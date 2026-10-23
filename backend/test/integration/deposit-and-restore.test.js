import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { PGlite } from '@electric-sql/pglite';

import { secureRestoredDatabase } from '../../src/db/restore-safety.js';
import { ConflictError } from '../../src/domain/errors.js';
import { IdentityRepository } from '../../src/repositories/identity-repository.js';
import { RecordRepository } from '../../src/repositories/record-repository.js';
import { createTestDatabase, seedScope } from '../helpers/database.js';

const cipher = (value) => Buffer.from(`synthetic:${value}`, 'utf8');

test('deposit becomes available by database time and reveals body only after active retrieval', async () => {
  const database = await createTestDatabase();
  try {
    const scope = await seedScope(database, 'deposit');
    const repository = new RecordRepository(database);
    const created = await repository.create({
      ...scope,
      requestId: randomUUID(),
      kind: 'DEPOSIT',
      titleCiphertext: cipher('deposit title'),
      titleKeyVersion: 1,
      details: {
        bodyCiphertext: cipher('deposit body'),
        cipherKeyVersion: 1,
        reopenAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });

    const stored = await repository.getDeposit({ ...scope, recordId: created.id });
    assert.equal(stored.state, 'STORED');
    assert.equal(stored.bodyCiphertext, null);

    await database.query(
      "UPDATE worry_deposits SET reopen_at = now() - interval '1 second' WHERE saved_record_id = $1",
      [created.id],
    );
    const available = await repository.getDeposit({ ...scope, recordId: created.id });
    assert.equal(available.state, 'AVAILABLE');
    assert.equal(available.bodyCiphertext, null);
    assert.equal(available.version, created.version + 1);

    const retrieved = await repository.retrieveDeposit({
      ...scope,
      recordId: created.id,
      requestId: randomUUID(),
      expectedVersion: available.version,
    });
    assert.equal(retrieved.state, 'RETRIEVED');
    assert.deepEqual(Buffer.from(retrieved.bodyCiphertext), cipher('deposit body'));
  } finally {
    await database.close();
  }
});

test('isolated backup restore preserves data and blocks opening until deletion replay is confirmed', async () => {
  const source = await createTestDatabase();
  let restored;
  try {
    const scope = await seedScope(source, 'restore');
    const identity = new IdentityRepository(source);
    const tokenDigest = createHash('sha256').update(randomBytes(32)).digest();
    await identity.createSession({
      ...scope,
      tokenDigest,
      deviceId: 'restore-test',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const backup = await source.dumpDataDir();
    restored = new PGlite({ loadDataDir: backup });

    await assert.rejects(
      secureRestoredDatabase(restored),
      ConflictError,
    );
    const result = await secureRestoredDatabase(restored, {
      deletionLogReplayCompleted: true,
    });
    assert.equal(result.revokedSessionCount, 1);
    await assert.rejects(
      new IdentityRepository(restored).findActiveSession({ tokenDigest }),
    );

    const accountCount = await restored.query('SELECT count(*)::int AS count FROM user_accounts');
    assert.equal(accountCount.rows[0].count, 1);
  } finally {
    await source.close();
    if (restored) await restored.close();
  }
});
