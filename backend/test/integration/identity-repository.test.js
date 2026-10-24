import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { ConflictError, NotFoundError } from '../../src/domain/errors.js';
import { IdentityRepository } from '../../src/repositories/identity-repository.js';
import { createTestDatabase } from '../helpers/database.js';

function accountInput(loginIdentifier, overrides = {}) {
  const { requestId = randomUUID(), ...payloadOverrides } = overrides;
  const value = {
    loginIdentifier,
    passwordDigest: '$argon2id$synthetic-not-a-real-password-hash',
    passwordParameters: { memoryCostKiB: 19456, timeCost: 2, parallelism: 1 },
    nickname: 'Synthetic User',
    avatarKey: 'default-1',
    timezoneName: 'Asia/Shanghai',
    ...payloadOverrides,
  };
  return {
    requestId,
    registrationPayloadHash: createHash('sha256')
      .update(JSON.stringify(value), 'utf8')
      .digest(),
    ...value,
  };
}

test('account creation writes credentials, profile, and preferences atomically', async () => {
  const database = await createTestDatabase();
  try {
    const repository = new IdentityRepository(database);
    const account = await repository.createAccount(accountInput('Test_User'));
    const counts = await database.query(
      `
        SELECT
          (SELECT count(*)::int FROM password_credentials WHERE account_id = $1) AS credentials,
          (SELECT count(*)::int FROM user_profiles WHERE account_id = $1) AS profiles,
          (SELECT count(*)::int FROM account_preferences WHERE account_id = $1) AS preferences
      `,
      [account.accountId],
    );
    assert.deepEqual(counts.rows[0], { credentials: 1, profiles: 1, preferences: 1 });

    const idempotentInput = accountInput('idempotent_user');
    const first = await repository.createAccount(idempotentInput);
    const repeated = await repository.createAccount(idempotentInput);
    assert.equal(repeated.accountId, first.accountId);
    assert.equal(repeated.idempotent, true);
    await assert.rejects(
      repository.createAccount(accountInput('idempotent_user', {
        requestId: idempotentInput.requestId,
        nickname: 'Changed Payload',
      })),
      ConflictError,
    );

    await assert.rejects(
      repository.createAccount(accountInput('test_user')),
      ConflictError,
    );
  } finally {
    await database.close();
  }
});

test('account creation rolls back all identity rows when a later write fails', async () => {
  const database = await createTestDatabase();
  try {
    const failingDatabase = {
      transaction: (work) => database.transaction(async (transaction) => work({
        query: async (sql, parameters) => {
          if (sql.includes('INSERT INTO password_credentials')) {
            throw new Error('synthetic credential write failure');
          }
          return transaction.query(sql, parameters);
        },
      })),
    };
    const repository = new IdentityRepository(failingDatabase);
    const input = accountInput('rollback_user');
    await assert.rejects(
      repository.createAccount(input),
      /synthetic credential write failure/,
    );

    const state = await database.query(
      `
        SELECT
          (SELECT count(*)::int FROM user_accounts WHERE login_identifier_normalized = 'rollback_user') AS accounts,
          (SELECT count(*)::int FROM registration_requests WHERE request_id = $1) AS requests
      `,
      [input.requestId],
    );
    assert.deepEqual(state.rows[0], { accounts: 0, requests: 0 });
  } finally {
    await database.close();
  }
});

test('session lookup uses a 32-byte digest and rejects revoked sessions', async () => {
  const database = await createTestDatabase();
  try {
    const repository = new IdentityRepository(database);
    const account = await repository.createAccount(accountInput('session_user'));
    const entry = await database.query(
      "INSERT INTO entry_points (code) VALUES ('WEB_SESSION') RETURNING id",
    );
    const rawToken = randomBytes(32);
    const tokenDigest = createHash('sha256').update(rawToken).digest();
    const session = await repository.createSession({
      accountId: account.accountId,
      entryPointId: entry.rows[0].id,
      tokenDigest,
      deviceId: 'synthetic-device',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const active = await repository.findActiveSession({ tokenDigest });
    assert.equal(active.accountId, account.accountId);
    assert.equal(active.entryPointId, entry.rows[0].id);

    assert.equal(await repository.revokeSession(session.sessionId), true);
    await assert.rejects(repository.findActiveSession({ tokenDigest }), NotFoundError);

    await assert.rejects(
      repository.createSession({
        accountId: randomUUID(),
        entryPointId: entry.rows[0].id,
        tokenDigest: createHash('sha256').update(randomBytes(32)).digest(),
        deviceId: null,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
      /foreign key|violates foreign key constraint/i,
    );
  } finally {
    await database.close();
  }
});

test('profile update uses optimistic locking', async () => {
  const database = await createTestDatabase();
  try {
    const repository = new IdentityRepository(database);
    const account = await repository.createAccount(accountInput('profile_user'));
    const entry = await database.query(
      "INSERT INTO entry_points (code) VALUES ('WEB_PROFILE') RETURNING id",
    );
    const initial = await repository.getProfile(account.accountId);
    const updateInput = {
      accountId: account.accountId,
      entryPointId: entry.rows[0].id,
      requestId: randomUUID(),
      expectedVersion: initial.version,
      nickname: 'Updated Synthetic User',
      avatarKey: 'default-2',
      bioCiphertext: Buffer.from('synthetic:bio'),
      cipherKeyVersion: 1,
    };
    const updated = await repository.updateProfile(updateInput);
    assert.equal(updated.version, initial.version + 1);
    assert.equal(updated.nickname, 'Updated Synthetic User');
    const repeated = await repository.updateProfile(updateInput);
    assert.equal(repeated.version, updated.version);
    assert.equal(repeated.idempotent, true);

    await assert.rejects(
      repository.updateProfile({
        accountId: account.accountId,
        entryPointId: entry.rows[0].id,
        requestId: randomUUID(),
        expectedVersion: initial.version,
        nickname: 'Stale Update',
        avatarKey: 'default-2',
        bioCiphertext: null,
        cipherKeyVersion: null,
      }),
      ConflictError,
    );
  } finally {
    await database.close();
  }
});

test('profile summary and preferences are scoped and versioned', async () => {
  const database = await createTestDatabase();
  try {
    const repository = new IdentityRepository(database);
    const account = await repository.createAccount(accountInput('summary_user'));
    const entryA = await database.query(
      "INSERT INTO entry_points (code) VALUES ('WEB_SUMMARY_A') RETURNING id",
    );
    const entryB = await database.query(
      "INSERT INTO entry_points (code) VALUES ('WEB_SUMMARY_B') RETURNING id",
    );
    await database.query(
      `
        INSERT INTO saved_records (account_id, entry_point_id, record_kind, request_id)
        VALUES
          ($1, $2, 'EMOTION', $4),
          ($1, $2, 'EMOTION', $5),
          ($1, $3, 'QUERY', $6)
      `,
      [
        account.accountId,
        entryA.rows[0].id,
        entryB.rows[0].id,
        randomUUID(),
        randomUUID(),
        randomUUID(),
      ],
    );

    const summary = await repository.getProfileSummary({
      accountId: account.accountId,
      entryPointId: entryA.rows[0].id,
    });
    assert.deepEqual(summary.counts, {
      CONVERSATION: 0,
      EMOTION: 2,
      WORRY_OBJECT: 0,
      REHEARSAL_DRAFT: 0,
      DEPOSIT: 0,
      QUERY: 0,
    });

    const initial = await repository.getPreferences({ accountId: account.accountId });
    assert.equal(initial.offerHistorySave, false);
    const updateInput = {
      accountId: account.accountId,
      entryPointId: entryA.rows[0].id,
      requestId: randomUUID(),
      expectedVersion: initial.version,
      offerHistorySave: true,
    };
    const updated = await repository.updatePreferences(updateInput);
    assert.equal(updated.offerHistorySave, true);
    assert.equal(updated.version, initial.version + 1);
    const repeated = await repository.updatePreferences(updateInput);
    assert.equal(repeated.idempotent, true);

    await assert.rejects(
      repository.updatePreferences({
        ...updateInput,
        requestId: randomUUID(),
        offerHistorySave: false,
      }),
      ConflictError,
    );
  } finally {
    await database.close();
  }
});
