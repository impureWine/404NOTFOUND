import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { runMigrations } from '../../src/db/migration-runner.js';
import { secureRestoredDatabase } from '../../src/db/restore-safety.js';
import { ConflictError, NotFoundError } from '../../src/domain/errors.js';
import { RecordRepository } from '../../src/repositories/record-repository.js';
import { SavedQueryRepository } from '../../src/repositories/saved-query-repository.js';
import { encryptProfileText, decryptProfileText } from '../../src/security/crypto.js';
import { AuthService } from '../../src/services/auth-service.js';
import { createTestDatabase, seedScope } from '../helpers/database.js';

test('Beta D6: restore confirmation requires literal true and rejects truthy strings before accessing data', async () => {
  const database = { transaction: () => assert.fail('unconfirmed restore must not access data') };
  for (const value of [undefined, false, null, 'false', 'true', 1, [], {}]) {
    await assert.rejects(secureRestoredDatabase(database, { deletionLogReplayCompleted: value }), ConflictError);
  }
});

test('Beta D6: recovered encrypted calendar and query snapshots stay isolated; cleared data and old sessions stay unavailable', async t => {
  const source = await createTestDatabase();
  t.after(() => source.close());
  const key = randomBytes(32);
  const owner = await seedScope(source, 'beta_d6_owner');
  const other = await seedScope(source, 'beta_d6_other');
  const otherEntry = { ...owner, entryPointId: other.entryPointId };
  const auth = new AuthService(source, { profileKey: key });
  const sessions = await Promise.all([
    auth.createContext(owner.accountId, owner.entryPointId),
    auth.createContext(other.accountId, other.entryPointId),
    auth.createContext(otherEntry.accountId, otherEntry.entryPointId),
  ]);
  const records = new RecordRepository(source);
  const createEmotion = scope => records.create({ ...scope, requestId: randomUUID(), kind: 'EMOTION',
    titleCiphertext: encryptProfileText('合成恢复标题', key), titleKeyVersion: 1,
    details: { recordDate: '2028-02-29', timezoneName: 'Pacific/Kiritimati', emotionCodes: [], intensity: null,
      eventCiphertext: encryptProfileText('合成私密日历正文', key), cipherKeyVersion: 1 },
  });
  const calendar = await createEmotion(owner);
  const otherCalendar = await createEmotion(other);
  const desktopCalendar = await createEmotion(otherEntry);
  const removedCalendar = await createEmotion(owner);
  const results = new Map();
  const queries = new SavedQueryRepository(source, { resolveCompletedSearch: async ({ searchRequestId }) => results.get(searchRequestId) });
  const createQuery = async (scope, title) => {
    const searchRequestId = randomUUID();
    results.set(searchRequestId, { ...scope, searchRequestId, status: 'completed', searchState: 'SUCCESS',
      rawQueryCiphertext: encryptProfileText('合成检索问题', key), normalizedQueryCiphertext: encryptProfileText('合成检索问题', key),
      cipherKeyVersion: 1, partial: true, hasConflict: false, uncertaintyNote: '合成来源，仅用于恢复验证',
      sources: [{ url: 'https://example.org/restore', title, publisher: null, sourceTier: 'S3', quality: 'UNKNOWN',
        publishedAt: null, retrievedAt: '2026-11-19T00:00:00Z', verificationState: 'PARTIAL' }], claims: [],
    });
    const request = { ...scope, requestId: randomUUID(), searchRequestId };
    return { request, saved: await queries.save(request) };
  };
  const queryA = await createQuery(owner, '合成来源A');
  const queryB = await createQuery(other, '合成来源B');
  const removedQuery = await createQuery(owner, '合成已清除来源');
  const expectedA = await queries.get({ ...owner, recordId: queryA.saved.id });
  const expectedB = await queries.get({ ...other, recordId: queryB.saved.id });
  for (const record of [removedCalendar, removedQuery.saved]) {
    const clear = { ...owner, recordId: record.id, requestId: randomUUID(), expectedVersion: 1 };
    const confirmation = await records.issueClearConfirmation(clear);
    await records.clear({ ...clear, requestId: randomUUID(), confirmationId: confirmation.confirmationId, confirmed: true });
  }
  const backup = await source.dumpDataDir();
  const restored = new PGlite({ loadDataDir: backup });
  t.after(() => restored.close());
  assert.deepEqual(await runMigrations(restored), []);
  const restoredAuth = new AuthService(restored, { profileKey: key });
  await assert.rejects(secureRestoredDatabase(restored), ConflictError);
  assert.ok(await restoredAuth.resolveContext(sessions[0].sessionToken), 'helper is not a network gate: target must remain offline');
  const result = await secureRestoredDatabase(restored, { deletionLogReplayCompleted: true });
  assert.deepEqual(result, { revokedSessionCount: 3, pendingDeletionOutboxCount: 2 });
  for (const session of sessions) assert.equal(await restoredAuth.resolveContext(session.sessionToken), null);
  assert.deepEqual(await secureRestoredDatabase(restored, { deletionLogReplayCompleted: true }),
    { revokedSessionCount: 0, pendingDeletionOutboxCount: 2 });
  const restoredRecords = new RecordRepository(restored);
  const restoredQueries = new SavedQueryRepository(restored, { resolveCompletedSearch: async () => null });
  const loaded = await restoredRecords.get({ ...owner, recordId: calendar.id });
  assert.equal(loaded.details.recordDate, '2028-02-29');
  assert.equal(loaded.details.timezoneName, 'Pacific/Kiritimati');
  assert.equal(decryptProfileText(loaded.details.eventCiphertext, key), '合成私密日历正文');
  assert.throws(() => decryptProfileText(loaded.details.eventCiphertext, randomBytes(32)));
  assert.deepEqual(await restoredQueries.get({ ...owner, recordId: queryA.saved.id }), expectedA);
  assert.deepEqual(await restoredQueries.get({ ...other, recordId: queryB.saved.id }), expectedB);
  assert.equal(decryptProfileText(expectedA.rawQueryCiphertext, key), '合成检索问题');
  assert.equal((await restoredQueries.save(queryA.request)).idempotent, true);
  for (const scope of [other, otherEntry]) {
    await assert.rejects(restoredRecords.get({ ...scope, recordId: calendar.id }), NotFoundError);
    await assert.rejects(restoredQueries.get({ ...scope, recordId: queryA.saved.id }), NotFoundError);
  }
  for (const [scope, id] of [[owner, calendar.id], [other, otherCalendar.id], [otherEntry, desktopCalendar.id]]) {
    assert.deepEqual((await restoredRecords.list({ ...scope, kind: 'EMOTION', from: '2028-02-01', to: '2028-02-29' })).items.map(x => x.id), [id]);
  }
  await assert.rejects(restoredRecords.get({ ...owner, recordId: removedCalendar.id }), NotFoundError);
  await assert.rejects(restoredQueries.get({ ...owner, recordId: removedQuery.saved.id }), NotFoundError);
  await assert.rejects(restoredQueries.save(removedQuery.request), NotFoundError);
  const counts = (await restored.query(`SELECT
    (SELECT count(*)::int FROM schema_migrations) AS migrations,
    (SELECT count(*)::int FROM saved_records WHERE deleted_at IS NULL) AS active_records,
    (SELECT count(*)::int FROM emotion_records) AS calendar_payloads,
    (SELECT count(*)::int FROM saved_queries) AS query_payloads,
    (SELECT count(*)::int FROM saved_query_sources) AS source_snapshots,
    (SELECT count(*)::int FROM deletion_outbox WHERE published_at IS NULL) AS pending_outbox`)).rows[0];
  assert.deepEqual(counts, { migrations: 7, active_records: 5, calendar_payloads: 3, query_payloads: 2, source_snapshots: 2, pending_outbox: 2 });
  if (process.env.BETA_DAY6_RECOVERY_REPORT) await writeFile(process.env.BETA_DAY6_RECOVERY_REPORT, JSON.stringify({
    date: '2026-11-19', environment: 'isolated in-memory PGlite; synthetic data; random in-memory encryption key',
    snapshotFormat: 'PGlite dumpDataDir', backupBytes: backup.size, counts, ...result,
    encryptedReadbackVerified: true, wrongKeyRejected: true, accountAndEntryIsolationVerified: true,
    clearedBeforeBackupRemainsUnavailable: true, clearedSaveReplayRejected: true,
    independentDeletionLogReplayed: false, postBackupDeletionReplayVerified: false,
    productionDatabaseTouched: false, productionReleaseReady: false,
  }, null, 2) + '\n');
});

test('Beta D6: restore safety transaction rolls back session revocation if outbox inspection fails', async t => {
  const database = await createTestDatabase();
  t.after(() => database.close());
  const scope = await seedScope(database, 'beta_d6_rollback');
  const auth = new AuthService(database, { profileKey: randomBytes(32) });
  const session = await auth.createContext(scope.accountId, scope.entryPointId);
  const failingDatabase = { transaction: work => database.transaction(tx => work({ query: (sql, params) => {
    if (sql.includes('deletion_outbox')) throw new Error('synthetic outbox inspection failure');
    return tx.query(sql, params);
  } })) };
  await assert.rejects(secureRestoredDatabase(failingDatabase, { deletionLogReplayCompleted: true }), /synthetic outbox/);
  assert.ok(await auth.resolveContext(session.sessionToken));
  assert.equal((await secureRestoredDatabase(database, { deletionLogReplayCompleted: true })).revokedSessionCount, 1);
  assert.equal(await auth.resolveContext(session.sessionToken), null);
});

test('Beta D6: migration checksum mismatch on a restored candidate is rejected without changing business data', async t => {
  const database = await createTestDatabase();
  t.after(() => database.close());
  await seedScope(database, 'beta_d6_checksum');
  await database.query("UPDATE schema_migrations SET checksum = $1 WHERE name = '006_saved_query_source_snapshots.sql'", ['0'.repeat(64)]);
  await assert.rejects(runMigrations(database), /Migration checksum mismatch: 006_saved_query_source_snapshots.sql/);
  assert.equal((await database.query('SELECT count(*)::int AS n FROM user_accounts')).rows[0].n, 1);
  assert.equal((await database.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n, 7);
});
