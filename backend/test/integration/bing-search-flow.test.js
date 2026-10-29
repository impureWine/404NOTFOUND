import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { BingSearchProvider } from '../../src/search/bing-search-provider.js';
import { ConsentService } from '../../src/services/consent-service.js';
import { TaskService } from '../../src/services/task-service.js';
import { createSavedQueries } from '../../src/services/saved-query-service.js';
import { createTestDatabase, seedScope } from '../helpers/database.js';
import { decryptProfileText } from '../../src/security/crypto.js';

test('Bing results flow through consent-bound tasks and persist as uncertain evidence scoped to the owner', async () => {
  const database = await createTestDatabase();
  try {
    const scope = await seedScope(database, 'bing_owner'), stranger = await seedScope(database, 'bing_other');
    const context = { ...scope, sessionId: randomUUID() }, consentService = new ConsentService();
    const searchProvider = new BingSearchProvider({ apiKey: 'synthetic-key', fetchImplementation: async () => new Response(JSON.stringify({ search_metadata: { status: 'Success' }, organic_results: [{ title: 'Synthetic Bing source', link: 'https://example.org/bing-result', snippet: 'Synthetic source excerpt' }] }), { headers: { 'content-type': 'application/json' } }) });
    const tasks = new TaskService({ searchProvider, consentService });
    const session = tasks.createSession(context, { requestId: randomUUID(), mode: 'SEARCH' });
    const payload = { ...session, question: 'synthetic query' };
    delete payload.state; delete payload.mode;
    const consent = consentService.create(context, { requestId: randomUUID(), purpose: 'SEARCH_PROCESS', operation: 'SEARCH_TASK_CREATE', payload });
    const requestId = randomUUID();
    tasks.createSearchTask(context, { ...payload, requestId, consentId: consent.consentId });
    for (let i = 0; i < 20 && tasks.getSearchTask(context, requestId).status !== 'completed'; i++) await new Promise(resolve => setImmediate(resolve));
    const completed = tasks.getSearchTask(context, requestId);
    assert.equal(completed.status, 'completed'); assert.equal(completed.sources[0].verificationState, 'PARTIAL');
    assert.throws(() => tasks.getSearchTask({ ...stranger, sessionId: randomUUID() }, requestId));
    const key = Buffer.alloc(32, 7), repository = createSavedQueries(database, tasks, key);
    const saved = await repository.save({ ...scope, requestId: randomUUID(), searchRequestId: requestId });
    const loaded = await repository.get({ ...scope, recordId: saved.id });
    assert.equal(loaded.evidence[0].source.url, 'https://example.org/bing-result');
    assert.equal(loaded.evidence[0].source.verificationState, 'PARTIAL');
    const stored = await database.query("SELECT source_tier FROM sources WHERE canonical_url = 'https://example.org/bing-result'");
    assert.equal(stored.rows[0].source_tier, 'SX');
    assert.equal(loaded.claims[0].status, 'UNKNOWN');
    assert.equal(decryptProfileText(loaded.claims[0].claimTextCiphertext, key), 'Synthetic source excerpt');
    await assert.rejects(repository.get({ ...stranger, recordId: saved.id }));
  } finally { await database.close(); }
});
