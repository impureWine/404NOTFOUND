import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomBytes } from 'node:crypto';

import { ConflictError, NotFoundError } from '../../src/domain/errors.js';
import { IdentityRepository } from '../../src/repositories/identity-repository.js';
import { createTestDatabase } from '../helpers/database.js';

function accountInput(loginIdentifier) {
  return {
    loginIdentifier,
    passwordDigest: '$argon2id$synthetic-not-a-real-password-hash',
    passwordParameters: { memoryCostKiB: 19456, timeCost: 2, parallelism: 1 },
    nickname: 'Synthetic User',
    avatarKey: 'default-1',
    timezoneName: 'Asia/Shanghai',
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

    await assert.rejects(
      repository.createAccount(accountInput('test_user')),
      ConflictError,
    );
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
  } finally {
    await database.close();
  }
});

test('profile update uses optimistic locking', async () => {
  const database = await createTestDatabase();
  try {
    const repository = new IdentityRepository(database);
    const account = await repository.createAccount(accountInput('profile_user'));
    const initial = await repository.getProfile(account.accountId);
    const updated = await repository.updateProfile({
      accountId: account.accountId,
      expectedVersion: initial.version,
      nickname: 'Updated Synthetic User',
      avatarKey: 'default-2',
      bioCiphertext: Buffer.from('synthetic:bio'),
      cipherKeyVersion: 1,
    });
    assert.equal(updated.version, initial.version + 1);
    assert.equal(updated.nickname, 'Updated Synthetic User');

    await assert.rejects(
      repository.updateProfile({
        accountId: account.accountId,
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
