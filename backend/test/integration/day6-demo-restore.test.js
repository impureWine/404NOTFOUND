import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { PGlite } from '@electric-sql/pglite';

import { runMigrations } from '../../src/db/migration-runner.js';
import { secureRestoredDatabase } from '../../src/db/restore-safety.js';
import { ConflictError, NotFoundError } from '../../src/domain/errors.js';
import { IdentityRepository } from '../../src/repositories/identity-repository.js';
import { RecordRepository } from '../../src/repositories/record-repository.js';
import { seedScope } from '../helpers/database.js';

const cipher = (value) => Buffer.from(`synthetic:${value}`, 'utf8');

test('Day 6 isolated restore preserves scoped records and revokes restored sessions', async () => {
  const source = new PGlite();
  let restored;
  try {
    const expectedMigrations = [
      '001_baseline.sql',
      '002_data_service_support.sql',
      '003_interface_contract_alignment.sql',
      '004_auth_http_support.sql',
      '004_identity_repository_support.sql',
    ];
    assert.deepEqual(await runMigrations(source), expectedMigrations);
    assert.deepEqual(await runMigrations(source), []);

    const scopeA = await seedScope(source, 'day6_restore_a');
    const scopeB = await seedScope(source, 'day6_restore_b');
    const tokenDigest = createHash('sha256').update(randomBytes(32)).digest();
    await new IdentityRepository(source).createSession({
      ...scopeA,
      tokenDigest,
      deviceId: 'synthetic-day6-restore',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const records = new RecordRepository(source);
    const recordA = await records.create({
      ...scopeA,
      requestId: randomUUID(),
      kind: 'CONVERSATION',
      titleCiphertext: cipher('day6-account-a-title'),
      titleKeyVersion: 1,
      details: {
        messages: [
          {
            role: 'USER',
            contentCiphertext: cipher('day6-account-a-body'),
            cipherKeyVersion: 1,
          },
        ],
      },
    });
    const recordB = await records.create({
      ...scopeB,
      requestId: randomUUID(),
      kind: 'CONVERSATION',
      titleCiphertext: cipher('day6-account-b-title'),
      titleKeyVersion: 1,
      details: {
        messages: [
          {
            role: 'USER',
            contentCiphertext: cipher('day6-account-b-body'),
            cipherKeyVersion: 1,
          },
        ],
      },
    });

    const backup = await source.dumpDataDir();
    restored = new PGlite({ loadDataDir: backup });
    assert.deepEqual(await runMigrations(restored), []);
    await assert.rejects(secureRestoredDatabase(restored), ConflictError);

    const restoreResult = await secureRestoredDatabase(restored, {
      deletionLogReplayCompleted: true,
    });
    assert.equal(restoreResult.revokedSessionCount, 1);
    assert.equal(restoreResult.pendingDeletionOutboxCount, 0);
    await assert.rejects(
      new IdentityRepository(restored).findActiveSession({ tokenDigest }),
    );

    const restoredRecords = new RecordRepository(restored);
    const detailA = await restoredRecords.get({ ...scopeA, recordId: recordA.id });
    const detailB = await restoredRecords.get({ ...scopeB, recordId: recordB.id });
    assert.deepEqual(
      Buffer.from(detailA.details.messages[0].contentCiphertext),
      cipher('day6-account-a-body'),
    );
    assert.deepEqual(
      Buffer.from(detailB.details.messages[0].contentCiphertext),
      cipher('day6-account-b-body'),
    );
    await assert.rejects(
      restoredRecords.get({ ...scopeB, recordId: recordA.id }),
      NotFoundError,
    );

    const counts = await restored.query(`
      SELECT
        (SELECT count(*)::int FROM saved_records WHERE deleted_at IS NULL) AS records,
        (SELECT count(*)::int FROM saved_messages) AS messages,
        (SELECT count(*)::int FROM schema_migrations) AS migrations
    `);
    assert.deepEqual(counts.rows[0], { records: 2, messages: 2, migrations: 5 });
  } finally {
    await source.close();
    if (restored) await restored.close();
  }
});
