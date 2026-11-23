import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

import { runMigrations } from '../../src/db/migration-runner.js';
import { RecordRepository } from '../../src/repositories/record-repository.js';
import { SavedQueryRepository } from '../../src/repositories/saved-query-repository.js';
import { RecordService } from '../../src/services/record-service.js';
import { ConsentService } from '../../src/services/consent-service.js';
import { encryptProfileText } from '../../src/security/crypto.js';
import { createTestDatabase, seedScope } from '../helpers/database.js';

const KEY = Buffer.alloc(32, 3); // Synthetic development key only.
const encrypt = text => encryptProfileText(text, KEY);
const conflict = { code: 'CONFLICT' };
const missing = { code: 'NOT_FOUND' };

async function fixture(t) {
  const database = await createTestDatabase();
  t.after(() => database.close());
  const scope = await seedScope(database, 'beta_d3_owner');
  const stranger = await seedScope(database, 'beta_d3_other');
  const results = new Map();
  const resolver = async ({ searchRequestId }) => results.get(searchRequestId);
  const queries = new SavedQueryRepository(database, { resolveCompletedSearch: resolver });
  const repository = new RecordRepository(database);
  const consents = new ConsentService();
  const records = new RecordService(repository, { encryptionKey: KEY, consentService: consents, savedQueries: queries });
  function search(overrides = {}) {
    const searchRequestId = randomUUID();
    const result = { ...scope, searchRequestId, status: 'completed', searchState: 'SUCCESS',
      rawQueryCiphertext: encrypt('合成问题：怎样准备课堂表达？'),
      normalizedQueryCiphertext: encrypt('合成课堂表达'), cipherKeyVersion: 1,
      uncertaintyNote: '合成来源，仅用于验证保存回看，不代表事实核验。',
      sources: [{ url: 'https://example.org/beta-day3', title: '保存时的合成来源',
        publisher: 'Example', sourceTier: 'SX', quality: 'UNKNOWN',
        publishedAt: null, retrievedAt: '2026-11-16T01:00:00.000Z', verificationState: 'PARTIAL' }],
      claims: [{ claimTextCiphertext: encrypt('先列出一个要点，再尝试表达。'), cipherKeyVersion: 1,
        status: 'UNKNOWN', evidence: [{ sourceUrl: 'https://example.org/beta-day3', relation: 'CONTEXT' }] }],
      ...overrides };
    results.set(searchRequestId, result);
    return { input: { ...scope, searchRequestId, requestId: randomUUID() }, result };
  }
  const conversation = () => ({ ...scope, requestId: randomUUID(), kind: 'CONVERSATION',
    titleCiphertext: encrypt('合成对话'), titleKeyVersion: 1,
    details: { messages: [{ role: 'USER', contentCiphertext: encrypt('合成正文'), cipherKeyVersion: 1 }] } });
  async function clearInput(record) {
    const confirmation = await repository.issueClearConfirmation({ ...scope, recordId: record.id,
      expectedVersion: record.version, requestId: randomUUID() });
    return { ...scope, recordId: record.id, expectedVersion: record.version,
      requestId: randomUUID(), confirmationId: confirmation.confirmationId, confirmed: true };
  }
  return { database, scope, stranger, results, resolver, queries, repository, records, consents, search, conversation, clearInput };
}

test('Beta D3: saved source metadata stays frozen when another account saves a newer copy', async t => {
  const f = await fixture(t);
  const first = f.search();
  const saved = await f.queries.save(first.input);
  const before = await f.queries.get({ ...f.scope, recordId: saved.id });
  const later = f.search({ ...f.stranger, sources: [{ ...first.result.sources[0],
    title: '后来变化的标题', quality: 'CURRENT', verificationState: 'VERIFIED',
    retrievedAt: '2026-11-16T02:00:00.000Z' }] });
  await f.queries.save({ ...later.input, ...f.stranger });
  assert.deepEqual(await f.queries.get({ ...f.scope, recordId: saved.id }), before);
  assert.equal(before.snapshotOrigin, 'SAVED');
  assert.equal(before.evidence[0].source.title, first.result.sources[0].title);
  const catalog = await f.database.query('SELECT title FROM sources');
  assert.equal(catalog.rows[0].title, '后来变化的标题');
});

test('Beta D3: sources without excerpts remain readable in the public query detail', async t => {
  const f = await fixture(t);
  const { input, result } = f.search({ claims: [] });
  const saved = await f.queries.save(input);
  const detail = await f.records.get(f.scope, saved.id);
  assert.equal(detail.content.question, '合成问题：怎样准备课堂表达？');
  assert.deepEqual(detail.content.claims, []);
  assert.equal(detail.content.sources.length, 1);
  assert.equal(detail.content.sources[0].url, result.sources[0].url);
  assert.equal(detail.content.uncertaintyNote, result.uncertaintyNote);
  assert.equal(detail.content.status, 'PARTIAL_SUCCESS');
  assert.doesNotMatch(JSON.stringify(detail), /Ciphertext|cipherKeyVersion|normalizedQuery|accountId/);
  for (const scope of [f.stranger, { ...f.scope, entryPointId: f.stranger.entryPointId }]) {
    await assert.rejects(f.records.get(scope, saved.id), missing);
    assert.equal((await f.records.list(scope, {})).items.length, 0);
    await assert.rejects(f.repository.issueClearConfirmation({ ...scope, recordId: saved.id,
      requestId: randomUUID(), expectedVersion: saved.version }), missing);
  }
});

test('Beta D3: failed query save rolls back snapshots, catalog, claims and idempotency, then retries', async t => {
  const f = await fixture(t);
  const { input } = f.search();
  const broken = { transaction: work => f.database.transaction(tx => work({
    query: async (sql, params) => {
      if (/INSERT INTO evidence_links/.test(sql)) throw new Error('injected evidence write failure');
      return tx.query(sql, params);
    },
  })), query: (...args) => f.database.query(...args) };
  await assert.rejects(new SavedQueryRepository(broken, { resolveCompletedSearch: f.resolver }).save(input), /injected/);
  for (const table of ['saved_records', 'saved_queries', 'saved_query_sources', 'sources', 'claims', 'evidence_links', 'idempotency_keys']) {
    assert.equal((await f.database.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, 0, table);
  }
  const retried = await f.queries.save(input);
  assert.equal(retried.idempotent, false);
  assert.equal((await f.queries.save(input)).id, retried.id);
});

test('Beta D3: simultaneous duplicate saves and clear confirmations return one identity', async t => {
  const f = await fixture(t);
  const { input } = f.search();
  const saves = await Promise.all(Array.from({ length: 4 }, () => f.queries.save(input)));
  assert.equal(new Set(saves.map(record => record.id)).size, 1);
  assert.equal(saves.filter(record => !record.idempotent).length, 1);
  const confirmationInput = { ...f.scope, recordId: saves[0].id, expectedVersion: 1, requestId: randomUUID() };
  const confirmations = await Promise.all(Array.from({ length: 4 }, () => f.repository.issueClearConfirmation(confirmationInput)));
  assert.equal(new Set(confirmations.map(value => value.confirmationId)).size, 1);
  const clear = { ...confirmationInput, requestId: randomUUID(), confirmed: true, confirmationId: confirmations[0].confirmationId };
  const cleared = await Promise.all(Array.from({ length: 4 }, () => f.repository.clear(clear)));
  assert.equal(cleared.filter(value => !value.idempotent).length, 1);
  assert.equal((await f.database.query('SELECT count(*)::int AS n FROM deletion_outbox')).rows[0].n, 1);
  await assert.rejects(f.queries.save(input), missing);
  await assert.rejects(f.repository.issueClearConfirmation(confirmationInput), missing);
});

test('Beta D3: failed query clear preserves all content and confirmation for retry', async t => {
  const f = await fixture(t);
  const { input } = f.search();
  const saved = await f.queries.save(input);
  const before = await f.records.get(f.scope, saved.id);
  const clear = await f.clearInput(saved);
  const broken = { transaction: work => f.database.transaction(tx => work({
    query: async (sql, params) => {
      if (/INSERT INTO deletion_outbox/.test(sql)) throw new Error('injected outbox failure');
      return tx.query(sql, params);
    },
  })) };
  await assert.rejects(new RecordRepository(broken).clear(clear), /injected/);
  assert.deepEqual(await f.records.get(f.scope, saved.id), before);
  assert.equal((await f.database.query('SELECT consumed_at FROM record_clear_confirmations')).rows[0].consumed_at, null);
  assert.equal((await f.database.query('SELECT count(*)::int AS n FROM deletion_jobs')).rows[0].n, 0);
  const cleared = await f.repository.clear(clear);
  assert.equal(cleared.idempotent, false);
  for (const table of ['saved_queries', 'saved_query_sources', 'claims', 'evidence_links']) {
    assert.equal((await f.database.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, 0, table);
  }
  await assert.rejects(f.records.get(f.scope, saved.id), missing);
  await assert.rejects(f.records.resolveContext(f.scope, [saved.id]), missing);
  await assert.rejects(f.queries.save(input), missing);
  assert.equal((await f.records.list(f.scope, {})).items.length, 0);
  if (process.env.BETA_DAY3_SAMPLE_PATH) await writeFile(process.env.BETA_DAY3_SAMPLE_PATH,
    JSON.stringify({ environment: 'PGlite; synthetic input; no live search', beforeClear: before,
      afterClear: { list: [], detail: 'NOT_FOUND', selectedContext: 'NOT_FOUND', replaySave: 'NOT_FOUND',
        payloadRows: 0, deletionOutbox: 'PENDING; backup purge not executed' } }, null, 2) + '\n');
});

test('Beta D3: expired confirmations require a new request and record create replay cannot resurrect a clear', async t => {
  const f = await fixture(t);
  const input = f.conversation();
  const saved = await f.repository.create(input);
  const confirmationInput = { ...f.scope, recordId: saved.id, expectedVersion: 1, requestId: randomUUID() };
  await f.repository.issueClearConfirmation(confirmationInput);
  await f.database.query("UPDATE record_clear_confirmations SET created_at = now() - interval '4 minutes', expires_at = now() - interval '1 minute'");
  await assert.rejects(f.repository.issueClearConfirmation(confirmationInput), conflict);
  await f.repository.clear(await f.clearInput(saved));
  await assert.rejects(f.repository.create(input), conflict);
  await assert.rejects(f.repository.get({ ...f.scope, recordId: saved.id }), missing);
});

test('Beta D3: migration backfills legacy evidence once and labels its historical limitation', async t => {
  const f = await fixture(t);
  const { input } = f.search();
  const saved = await f.queries.save(input);
  // Reconstruct the pre-006 schema only inside this disposable test database.
  await f.database.exec(`DROP TABLE saved_query_sources;
    ALTER TABLE saved_queries DROP COLUMN snapshot_origin;
    DELETE FROM schema_migrations WHERE name = '006_saved_query_source_snapshots.sql';`);
  assert.deepEqual(await runMigrations(f.database), ['006_saved_query_source_snapshots.sql']);
  assert.deepEqual(await runMigrations(f.database), []);
  const detail = await f.records.get(f.scope, saved.id);
  assert.equal(detail.content.snapshotOrigin, 'LEGACY_BACKFILL');
  assert.equal(detail.content.sources.length, 1);
  assert.equal(detail.content.claims[0].evidence[0].source.title, '保存时的合成来源');
});
