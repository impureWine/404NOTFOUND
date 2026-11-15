import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';

import { ConsentService } from '../../src/services/consent-service.js';
import { TaskService } from '../../src/services/task-service.js';
import { RecordService } from '../../src/services/record-service.js';
import { RecordRepository } from '../../src/repositories/record-repository.js';
import { createSavedQueries } from '../../src/services/saved-query-service.js';
import { createTestDatabase, seedScope } from '../helpers/database.js';

const KEY = Buffer.alloc(32, 7); // Synthetic test key only.
const denied = { code: 'ACCESS_DENIED' };
const notFound = { code: 'NOT_FOUND' };

async function fixture(t) {
  const database = await createTestDatabase();
  t.after(() => database.close());
  const scope = await seedScope(database, 'beta_a');
  const stranger = await seedScope(database, 'beta_b');
  const otherEntry = { ...scope, entryPointId: stranger.entryPointId };
  let now = new Date();
  const consents = new ConsentService({ now: () => now });
  const tasks = new TaskService({ consentService: consents, searchProvider: {
    search: async () => ({ searchState: 'SUCCESS', partial: false, hasConflict: false,
      claims: [{ summary: 'Synthetic claim' }], sources: [{ id: 'synthetic', title: 'Synthetic source',
        url: 'https://example.org/beta', snippet: 'Synthetic excerpt', publisher: 'Example',
        sourceTier: 'SX', quality: 'UNKNOWN', verificationState: 'PARTIAL',
        publishedAt: null, retrievedAt: new Date().toISOString() }],
    }),
  } });
  const queries = createSavedQueries(database, tasks, KEY);
  const records = new RecordService(new RecordRepository(database), {
    encryptionKey: KEY, consentService: consents, savedQueries: queries,
  });
  const grant = (context, purpose, operation, payload) => consents.create(context, {
    requestId: randomUUID(), purpose, operation, payload,
  }).consentId;
  async function search() {
    const session = tasks.createSession(scope, { requestId: randomUUID(), mode: 'SEARCH' });
    const { mode, state, ...ids } = session;
    const payload = { ...ids, question: 'Synthetic Beta query' };
    const consentId = grant(scope, 'SEARCH_PROCESS', 'SEARCH_TASK_CREATE', payload);
    const requestId = randomUUID();
    tasks.createSearchTask(scope, { ...payload, requestId, consentId });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(tasks.getSearchTask(scope, requestId).status, 'completed');
    return { session, requestId, consentId };
  }
  const saveBody = (context, searchRequestId, requestId = randomUUID()) => ({
    requestId, searchRequestId,
    consentId: grant(context, 'SAVE', 'RECORD_CREATE', { kind: 'QUERY', searchRequestId }),
  });
  return { database, scope, stranger, otherEntry, consents, tasks, records, queries,
    grant, search, saveBody, expire: () => { now = new Date(now.getTime() + 300001); } };
}

for (const action of ['END', 'RESTART']) {
  test(`Beta D2: ${action} rejects a new save of a previously completed query`, async t => {
    const f = await fixture(t);
    const task = await f.search();
    f.tasks.action(f.scope, task.session.sessionId, { requestId: randomUUID(), action,
      expectedSessionGeneration: 0, expectedActivityGeneration: 0 });
    const cancelled = f.tasks.getSearchTask(f.scope, task.requestId);
    assert.equal(cancelled.status, 'cancelled');
    for (const field of ['answer', 'sources', 'claims', 'searchState']) assert.equal(cancelled[field], undefined);
    await assert.rejects(f.records.saveQuery(f.scope, f.saveBody(f.scope, task.requestId)), { code: 'CONFLICT' });
    assert.equal((await f.database.query('SELECT count(*)::int AS n FROM saved_records')).rows[0].n, 0);
  });
}

for (const change of ['revoke', 'expire']) {
  test(`Beta D2: ${change} search permission blocks new persistence despite a fresh SAVE grant`, async t => {
    const f = await fixture(t);
    const task = await f.search();
    if (change === 'revoke') f.consents.revoke(f.scope, task.consentId);
    else f.expire();
    assert.throws(() => f.tasks.getSearchTask(f.scope, task.requestId), denied);
    await assert.rejects(f.records.saveQuery(f.scope, f.saveBody(f.scope, task.requestId)), denied);
    assert.equal((await f.database.query('SELECT count(*)::int AS n FROM saved_records')).rows[0].n, 0);
  });
}

test('Beta D2: SAVE consent cannot be reused or revoked across entries of the same account', async t => {
  const f = await fixture(t);
  const payload = { kind: 'CONVERSATION', content: { title: 'Synthetic title', body: 'Synthetic body' } };
  const consentId = f.grant(f.scope, 'SAVE', 'RECORD_CREATE', payload);
  await assert.rejects(f.records.create(f.otherEntry, { ...payload, consentId, requestId: randomUUID() }), denied);
  assert.throws(() => f.consents.revoke(f.otherEntry, consentId), notFound);
  assert.equal((await f.database.query('SELECT count(*)::int AS n FROM saved_records')).rows[0].n, 0);
  await f.records.create(f.scope, { ...payload, consentId, requestId: randomUUID() });
});

test('Beta D2: same requestId is isolated by account and entry even with randomized encryption', async t => {
  const f = await fixture(t);
  const requestId = randomUUID();
  const ids = [];
  for (const context of [f.scope, { ...f.stranger, entryPointId: f.scope.entryPointId }, f.otherEntry]) {
    const payload = { kind: 'CONVERSATION', content: { title: 'Synthetic title', body: 'Synthetic body' } };
    const consentId = f.grant(context, 'SAVE', 'RECORD_CREATE', payload);
    const body = { ...payload, consentId, requestId };
    const created = await f.records.create(context, body);
    const retry = await f.records.create(context, body);
    assert.equal(retry.id, created.id);
    assert.equal(retry.idempotent, true);
    ids.push(created.id);
    const changed = { ...payload, content: { title: 'Synthetic title', body: 'Changed body' } };
    await assert.rejects(f.records.create(context, { ...changed, requestId,
      consentId: f.grant(context, 'SAVE', 'RECORD_CREATE', changed) }), { code: 'CONFLICT' });
    assert.equal((await f.records.list(context, {})).items.length, 1);
  }
  assert.equal(new Set(ids).size, 3);
  await assert.rejects(f.records.get(f.otherEntry, ids[0]), notFound);
  await assert.rejects(f.records.resolveContext(f.otherEntry, [ids[0]]), notFound);
  await assert.rejects(f.records.resolveContext(f.stranger, [ids[0]]), notFound);
});

test('Beta D2: query persistence rejects foreign scope, wrong purpose and cancelled tasks', async t => {
  const f = await fixture(t);
  const task = await f.search();
  for (const context of [{ ...f.stranger, entryPointId: f.scope.entryPointId }, f.otherEntry]) {
    await assert.rejects(f.records.saveQuery(context, f.saveBody(context, task.requestId)), notFound);
    assert.throws(() => f.tasks.getSearchTask(context, task.requestId), notFound);
    assert.throws(() => f.tasks.cancelSearchTask(context, task.requestId), notFound);
  }
  await assert.rejects(f.records.saveQuery(f.scope, {
    ...f.saveBody(f.scope, task.requestId), consentId: task.consentId,
  }), denied);
  f.tasks.cancelSearchTask(f.scope, task.requestId);
  assert.equal(f.tasks.getSearchTask(f.scope, task.requestId).claims, undefined);
  await assert.rejects(f.records.saveQuery(f.scope, f.saveBody(f.scope, task.requestId)), { code: 'CONFLICT' });
  assert.equal((await f.database.query('SELECT count(*)::int AS n FROM saved_records')).rows[0].n, 0);
});

test('Beta D2: query replay returns the owned saved snapshot after task cancellation, but cannot bypass SAVE revocation or clear', async t => {
  const f = await fixture(t);
  const task = await f.search();
  const body = f.saveBody(f.scope, task.requestId);
  const created = await f.records.saveQuery(f.scope, body);
  f.tasks.cancelSearchTask(f.scope, task.requestId);
  const replay = await f.records.saveQuery(f.scope, body);
  assert.equal(replay.id, created.id);
  assert.equal((await f.records.list(f.scope, {})).items.length, 1);
  const confirmation = await f.records.issueClearConfirmation(f.scope, created.id, {
    requestId: randomUUID(), expectedVersion: created.version,
  });
  await f.records.clear(f.scope, created.id, { requestId: randomUUID(),
    expectedVersion: created.version, confirmationId: confirmation.confirmationId });
  await assert.rejects(f.records.saveQuery(f.scope, body), notFound);
  f.consents.revoke(f.scope, body.consentId);
  await assert.rejects(f.records.saveQuery(f.scope, body), denied);
  assert.equal((await f.records.list(f.scope, {})).items.length, 0);
});
