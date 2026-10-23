import { createAccountSchema, createSessionSchema, sessionLookupSchema, updateProfileSchema } from '../contracts/identity.js';
import { withTransaction } from '../db/database.js';
import { ConflictError, InvalidInputError, NotFoundError } from '../domain/errors.js';

function parse(schema, value, message) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new InvalidInputError(message, parsed.error.flatten());
  return parsed.data;
}

export function normalizeLoginIdentifier(value) {
  const normalized = value.normalize('NFKC').toLowerCase();
  if (!/^[a-z0-9_]{3,64}$/.test(normalized)) {
    throw new InvalidInputError('loginIdentifier must normalize to 3-64 ASCII letters, digits, or underscores');
  }
  return normalized;
}

function isUniqueViolation(error) {
  return error?.code === '23505' || /unique|duplicate/i.test(error?.message ?? '');
}

export class IdentityRepository {
  constructor(database) {
    this.database = database;
  }

  async createAccount(input) {
    const value = parse(createAccountSchema, input, 'Invalid account input');
    const normalized = normalizeLoginIdentifier(value.loginIdentifier);
    try {
      return await withTransaction(this.database, async (transaction) => {
        const account = await transaction.query(
          `
            INSERT INTO user_accounts (login_identifier, login_identifier_normalized)
            VALUES ($1, $2)
            RETURNING id, status, created_at
          `,
          [value.loginIdentifier, normalized],
        );
        const accountId = account.rows[0].id;
        await transaction.query(
          `
            INSERT INTO password_credentials (
              account_id,
              password_digest,
              algorithm,
              parameters
            )
            VALUES ($1, $2, 'ARGON2ID', $3::jsonb)
          `,
          [accountId, value.passwordDigest, JSON.stringify(value.passwordParameters)],
        );
        await transaction.query(
          `
            INSERT INTO user_profiles (
              account_id,
              nickname,
              avatar_key,
              timezone_name
            )
            VALUES ($1, $2, $3, $4)
          `,
          [accountId, value.nickname, value.avatarKey, value.timezoneName],
        );
        await transaction.query(
          'INSERT INTO account_preferences (account_id) VALUES ($1)',
          [accountId],
        );
        return {
          accountId,
          status: account.rows[0].status,
          createdAt: new Date(account.rows[0].created_at).toISOString(),
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('loginIdentifier is already registered');
      }
      throw error;
    }
  }

  async createSession(input) {
    const value = parse(createSessionSchema, input, 'Invalid session input');
    if (new Date(value.expiresAt).getTime() <= Date.now()) {
      throw new InvalidInputError('expiresAt must be in the future');
    }
    const result = await this.database.query(
      `
        INSERT INTO login_sessions (
          account_id,
          entry_point_id,
          device_id,
          token_digest,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, issued_at, expires_at
      `,
      [
        value.accountId,
        value.entryPointId,
        value.deviceId,
        value.tokenDigest,
        value.expiresAt,
      ],
    );
    return {
      sessionId: result.rows[0].id,
      issuedAt: new Date(result.rows[0].issued_at).toISOString(),
      expiresAt: new Date(result.rows[0].expires_at).toISOString(),
    };
  }

  async findActiveSession(input) {
    const value = parse(sessionLookupSchema, input, 'Invalid session lookup');
    const result = await this.database.query(
      `
        UPDATE login_sessions
        SET last_seen_at = now()
        WHERE token_digest = $1
          AND revoked_at IS NULL
          AND expires_at > now()
          AND last_seen_at >= now() - interval '30 minutes'
        RETURNING id, account_id, entry_point_id, expires_at
      `,
      [value.tokenDigest],
    );
    if (result.rows.length === 0) throw new NotFoundError('Session is missing or expired');
    const row = result.rows[0];
    return {
      sessionId: row.id,
      accountId: row.account_id,
      entryPointId: row.entry_point_id,
      expiresAt: new Date(row.expires_at).toISOString(),
    };
  }

  async revokeSession(sessionId) {
    const result = await this.database.query(
      `
        UPDATE login_sessions
        SET revoked_at = COALESCE(revoked_at, now())
        WHERE id = $1
        RETURNING id
      `,
      [sessionId],
    );
    return result.rows.length > 0;
  }

  async revokeAllSessions(accountId) {
    const result = await this.database.query(
      `
        UPDATE login_sessions
        SET revoked_at = COALESCE(revoked_at, now())
        WHERE account_id = $1
          AND revoked_at IS NULL
        RETURNING id
      `,
      [accountId],
    );
    return result.rows.length;
  }

  async getProfile(accountId) {
    const result = await this.database.query(
      `
        SELECT nickname, avatar_key, bio_ciphertext, cipher_key_version, timezone_name, version_no
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
      bioCiphertext: row.bio_ciphertext,
      cipherKeyVersion: row.cipher_key_version,
      timezoneName: row.timezone_name,
      version: row.version_no,
    };
  }

  async updateProfile(input) {
    const value = parse(updateProfileSchema, input, 'Invalid profile input');
    const result = await this.database.query(
      `
        UPDATE user_profiles
        SET nickname = $3,
            avatar_key = $4,
            bio_ciphertext = $5,
            cipher_key_version = $6,
            version_no = version_no + 1,
            updated_at = now()
        WHERE account_id = $1
          AND version_no = $2
        RETURNING nickname, avatar_key, bio_ciphertext, cipher_key_version, timezone_name, version_no
      `,
      [
        value.accountId,
        value.expectedVersion,
        value.nickname,
        value.avatarKey,
        value.bioCiphertext,
        value.cipherKeyVersion,
      ],
    );
    if (result.rows.length === 0) {
      const exists = await this.database.query(
        'SELECT 1 FROM user_profiles WHERE account_id = $1',
        [value.accountId],
      );
      if (exists.rows.length === 0) throw new NotFoundError();
      throw new ConflictError('expectedVersion does not match the current profile version');
    }
    return this.getProfile(value.accountId);
  }
}
