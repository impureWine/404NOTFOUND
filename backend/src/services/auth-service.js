import {
  changePasswordRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  updateProfileRequestSchema,
} from '@404notfound/contracts';

import { normalizeLoginIdentifier } from '../repositories/identity-repository.js';
import { withTransaction } from '../db/database.js';
import {
  decryptProfileText,
  encryptProfileText,
  hashPassword,
  randomToken,
  sha256,
  verifyPassword,
} from '../security/crypto.js';
import { ConflictError, InvalidInputError, NotFoundError } from '../domain/errors.js';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new InvalidInputError('请求字段不符合接口契约', result.error.issues);
  return result.data;
}

export class AuthService {
  constructor(database, { profileKey, now = () => new Date() }) {
    this.database = database;
    this.profileKey = profileKey;
    this.now = now;
  }

  async ensureWebEntryPoint() {
    const result = await this.database.query(
      `
        INSERT INTO entry_points (code)
        VALUES ('WEB')
        ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
        RETURNING id
      `,
    );
    return result.rows[0].id;
  }

  async createContext(accountId = null, entryPointId = null) {
    const resolvedEntryPointId = entryPointId ?? await this.ensureWebEntryPoint();
    const sessionToken = randomToken();
    const csrfToken = randomToken();
    const expiresAt = new Date(this.now().getTime() + SESSION_TTL_MS);
    const result = await this.database.query(
      `
        INSERT INTO login_sessions (
          account_id,
          entry_point_id,
          token_digest,
          csrf_token_digest,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `,
      [accountId, resolvedEntryPointId, sha256(sessionToken), sha256(csrfToken), expiresAt],
    );
    return { sessionId: result.rows[0].id, sessionToken, csrfToken, expiresAt, accountId, entryPointId: resolvedEntryPointId };
  }

  async resolveContext(sessionToken) {
    if (!sessionToken) return null;
    const result = await this.database.query(
      `
        SELECT id, account_id, entry_point_id, csrf_token_digest, expires_at
        FROM login_sessions
        WHERE token_digest = $1
          AND revoked_at IS NULL
          AND expires_at > now()
          AND last_seen_at >= now() - interval '30 minutes'
      `,
      [sha256(sessionToken)],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      sessionId: row.id,
      accountId: row.account_id,
      entryPointId: row.entry_point_id,
      csrfTokenDigest: row.csrf_token_digest ? Buffer.from(row.csrf_token_digest) : null,
      expiresAt: new Date(row.expires_at),
    };
  }

  verifyCsrf(context, csrfToken) {
    if (!context || !csrfToken || !sha256(csrfToken).equals(context.csrfTokenDigest)) {
      const error = new Error('CSRF 校验失败');
      error.code = 'ACCESS_DENIED';
      throw error;
    }
  }

  async register(body) {
    const value = parse(registerRequestSchema, body);
    const passwordDigest = await hashPassword(value.password);
    const normalized = normalizeLoginIdentifier(value.loginName);
    try {
      const result = await withTransaction(this.database, async (transaction) => {
        const account = await transaction.query(
          `
            INSERT INTO user_accounts (login_identifier, login_identifier_normalized)
            VALUES ($1, $2)
            RETURNING id
          `,
          [value.loginName, normalized],
        );
        const accountId = account.rows[0].id;
        await transaction.query(
          `
            INSERT INTO password_credentials (account_id, password_digest, parameters)
            VALUES ($1, $2, $3::jsonb)
          `,
          [accountId, passwordDigest, JSON.stringify({ memoryKiB: 19 * 1024, timeCost: 2, parallelism: 1 })],
        );
        await transaction.query(
          `
            INSERT INTO user_profiles (account_id, nickname, avatar_key)
            VALUES ($1, $2, 'DEFAULT')
          `,
          [accountId, value.loginName],
        );
        await transaction.query('INSERT INTO account_preferences (account_id) VALUES ($1)', [accountId]);
        return accountId;
      });
      return { accountId: result };
    } catch (error) {
      if (error?.code === '23505' || /unique|duplicate/i.test(error?.message ?? '')) {
        throw new ConflictError('无法完成注册');
      }
      throw error;
    }
  }

  async login(body, previousContext) {
    const value = parse(loginRequestSchema, body);
    const result = await this.database.query(
      `
        SELECT a.id, a.status, p.password_digest
        FROM user_accounts a
        JOIN password_credentials p ON p.account_id = a.id
        WHERE a.login_identifier_normalized = $1
      `,
      [normalizeLoginIdentifier(value.loginName)],
    );
    const row = result.rows[0];
    if (!row || row.status !== 'ACTIVE' || !(await verifyPassword(row.password_digest, value.password))) {
      const error = new Error('登录名或密码不正确');
      error.code = 'AUTH_REQUIRED';
      throw error;
    }
    if (previousContext) await this.revokeSession(previousContext.sessionId);
    const context = await this.createContext(row.id);
    return { context, target: value.target, profile: await this.getProfile(row.id) };
  }

  async revokeSession(sessionId) {
    await this.database.query(
      'UPDATE login_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1',
      [sessionId],
    );
  }

  async logout(context) {
    if (context) await this.revokeSession(context.sessionId);
  }

  async getProfile(accountId) {
    const result = await this.database.query(
      `
        SELECT nickname, avatar_key, bio_ciphertext, version_no
        FROM user_profiles
        WHERE account_id = $1
      `,
      [accountId],
    );
    if (result.rows.length === 0) throw new NotFoundError();
    const row = result.rows[0];
    return {
      nickname: row.nickname,
      avatarKey: row.avatar_key,
      bio: decryptProfileText(row.bio_ciphertext, this.profileKey),
      version: row.version_no,
    };
  }

  async updateProfile(accountId, body) {
    const value = parse(updateProfileRequestSchema, body);
    const result = await this.database.query(
      `
        UPDATE user_profiles
        SET nickname = $3,
            avatar_key = $4,
            bio_ciphertext = $5::bytea,
            cipher_key_version = CASE WHEN $5::bytea IS NULL THEN NULL ELSE 1 END,
            version_no = version_no + 1,
            updated_at = now()
        WHERE account_id = $1 AND version_no = $2
        RETURNING version_no
      `,
      [accountId, value.expectedVersion, value.nickname, value.avatarKey, encryptProfileText(value.bio, this.profileKey)],
    );
    if (result.rows.length === 0) throw new ConflictError('资料版本已经变化');
    return this.getProfile(accountId);
  }

  async changePassword(accountId, body) {
    const value = parse(changePasswordRequestSchema, body);
    const credentials = await this.database.query(
      'SELECT password_digest FROM password_credentials WHERE account_id = $1',
      [accountId],
    );
    if (!credentials.rows[0] || !(await verifyPassword(credentials.rows[0].password_digest, value.currentPassword))) {
      const error = new Error('当前密码不正确');
      error.code = 'AUTH_REQUIRED';
      throw error;
    }
    const nextDigest = await hashPassword(value.newPassword);
    await withTransaction(this.database, async (transaction) => {
      await transaction.query(
        `
          UPDATE password_credentials
          SET password_digest = $2, changed_at = now()
          WHERE account_id = $1
        `,
        [accountId, nextDigest],
      );
      await transaction.query(
        `
          UPDATE login_sessions
          SET revoked_at = COALESCE(revoked_at, now())
          WHERE account_id = $1 AND revoked_at IS NULL
        `,
        [accountId],
      );
    });
  }
}
