import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import test from 'node:test';

import { searchTaskStateSchema } from '@404notfound/contracts';

import { createApp } from '../../src/app.js';
import { RecordRepository } from '../../src/repositories/record-repository.js';
import { BingSearchProvider } from '../../src/search/bing-search-provider.js';
import { AuthService } from '../../src/services/auth-service.js';
import { ConsentService } from '../../src/services/consent-service.js';
import { RecordService } from '../../src/services/record-service.js';
import { createSavedQueries } from '../../src/services/saved-query-service.js';
import { TaskService } from '../../src/services/task-service.js';
import { createTestDatabase } from '../helpers/database.js';
import { listenForHttp } from '../helpers/http.js';

const ORIGIN = 'http://127.0.0.1:5173';
const KEY = 'synthetic-day4-serp-key';
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});
const organic = items => ({ search_metadata: { status: 'Success' }, organic_results: items });
const source = (title = '合成来源') => ({
  title, link: 'https://example.org/day4', snippet: '合成摘录，不代表真实检索。',
});

async function fixture(t) {
  const database = await createTestDatabase();
  const profileKey = Buffer.alloc(32, 4);
  const authService = new AuthService(database, { profileKey });
  const consents = new ConsentService();
  const tasks = new TaskService({ consentService: consents });
  const recordService = new RecordService(new RecordRepository(database), {
    encryptionKey: profileKey, consentService: consents,
    savedQueries: createSavedQueries(database, tasks, profileKey),
  });
  const server = await listenForHttp(createApp({ database, authService,
    consentService: consents, taskService: tasks, recordService, appOrigin: ORIGIN }));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await database.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) => fetch(base + path, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: owner.cookie,
      Origin: ORIGIN, 'X-CSRF-Token': owner.csrf }, body: JSON.stringify(body) });
  const anonymous = await fetch(base + '/api/auth/context');
  const owner = { cookie: anonymous.headers.get('set-cookie').split(';')[0],
    csrf: (await anonymous.json()).data.csrfToken };
  const registration = await post('/api/auth/register', {
    requestId: randomUUID(), loginName: 'beta_day4_owner', password: 'synthetic-day4-password',
    confirmPassword: 'synthetic-day4-password',
  });
  assert.equal(registration.status, 201);
  const login = await post('/api/auth/login', {
    loginName: 'beta_day4_owner', password: 'synthetic-day4-password', target: 'PROFILE',
  });
  assert.equal(login.status, 200);
  const loggedIn = await fetch(base + '/api/auth/context', {
    headers: { Cookie: login.headers.get('set-cookie').split(';')[0] },
  });
  owner.cookie = loggedIn.headers.get('set-cookie').split(';')[0];
  owner.csrf = (await loggedIn.json()).data.csrfToken;
  const read = path => fetch(base + path, { headers: { Cookie: owner.cookie } });
  async function grant(purpose, operation, payload) {
    const response = await post('/api/consents', { requestId: randomUUID(), purpose, operation, payload });
    assert.equal(response.status, 201);
    return (await response.json()).data.consentId;
  }
  async function search(question = '合成问题', { fetchImplementation, apiKey = KEY, timeoutMs = 100 } = {}) {
    tasks.searchProvider = new BingSearchProvider({ apiKey, timeoutMs,
      fetchImplementation: fetchImplementation ?? (async () => json(organic([source()]))),
      clock: () => new Date('2026-11-17T02:00:00.000Z') });
    const response = await post('/api/sessions', { requestId: randomUUID(), mode: 'SEARCH' });
    assert.equal(response.status, 201);
    const { mode, state, ...session } = (await response.json()).data;
    const payload = { ...session, question };
    const consentId = await grant('SEARCH_PROCESS', 'SEARCH_TASK_CREATE', payload);
    const requestId = randomUUID();
    const accepted = await post('/api/search/tasks', { ...payload, consentId, requestId });
    assert.equal(accepted.status, 202);
    searchTaskStateSchema.parse((await accepted.json()).data);
    let task;
    const deadline = Date.now() + 2000;
    do {
      const polling = await read(`/api/search/tasks/${requestId}`);
      assert.equal(polling.status, 200, JSON.stringify(await polling.clone().json()));
      task = searchTaskStateSchema.parse((await polling.json()).data);
      if (!['pending', 'running'].includes(task.status)) break;
      await new Promise(resolve => setTimeout(resolve, 5));
    } while (Date.now() < deadline);
    assert.ok(['completed', 'failed'].includes(task.status), 'query reaches terminal state');
    return { requestId, consentId, session, task };
  }
  async function save(searchRequestId) {
    const payload = { kind: 'QUERY', searchRequestId };
    return post('/api/saved-queries', { requestId: randomUUID(), searchRequestId,
      consentId: await grant('SAVE', 'RECORD_CREATE', payload) });
  }
  return { database, tasks, consents, post, read, save, search };
}

test('Beta D4: EMPTY is readable over HTTP, never saved, and still checks query permission', async t => {
  const f = await fixture(t);
  const result = await f.search('合成无结果', { fetchImplementation: async () => json(organic([])) });
  assert.equal(result.task.searchState, 'EMPTY');
  assert.equal(result.task.answer, '');
  assert.deepEqual(result.task.sources, []);
  assert.match(result.task.uncertaintyNote, /未找到/);
  assert.equal((await f.save(result.requestId)).status, 409);
  assert.equal((await f.database.query('SELECT count(*)::int AS n FROM saved_records')).rows[0].n, 0);
  assert.equal((await f.post(`/api/consents/${result.consentId}/revoke`, {})).status, 200);
  assert.equal((await f.read(`/api/search/tasks/${result.requestId}`)).status, 403);
});

test('Beta D4: source fields and warnings survive save/read; different queries keep separate snapshots', async t => {
  const f = await fixture(t);
  const first = await f.search('合成问题一');
  const savedResponse = await f.save(first.requestId);
  assert.equal(savedResponse.status, 201);
  const firstId = (await savedResponse.json()).data.id;
  const before = (await (await f.read(`/api/records/${firstId}`)).json()).data;
  assert.equal(before.content.question, '合成问题一');
  assert.equal(before.content.sources[0].url, first.task.sources[0].url);
  assert.equal(before.content.sources[0].retrievedAt, first.task.sources[0].retrievedAt);
  assert.equal(before.content.sources[0].publishedAt, null);
  assert.equal(before.content.sources[0].verificationState, 'PARTIAL');
  assert.equal(before.content.claims[0].status, 'UNKNOWN');
  assert.equal(before.content.uncertaintyNote, first.task.uncertaintyNote);
  assert.match(before.content.uncertaintyNote, /仅有一个可用来源/);
  const second = await f.search('合成问题二', { fetchImplementation: async () => json(organic([source('第二次的同网址标题')])) });
  const secondSaved = await f.save(second.requestId);
  assert.equal(secondSaved.status, 201);
  const secondId = (await secondSaved.json()).data.id;
  assert.notEqual(firstId, secondId);
  const after = (await (await f.read(`/api/records/${firstId}`)).json()).data;
  assert.deepEqual(after, before);
  assert.equal((await (await f.read(`/api/records/${secondId}`)).json()).data.content.question, '合成问题二');
  assert.doesNotMatch(JSON.stringify(before), /Ciphertext|synthetic-day4-serp-key/);
  if (process.env.BETA_DAY4_SAMPLE_PATH) {
    await writeFile(process.env.BETA_DAY4_SAMPLE_PATH, JSON.stringify({
      environment: 'HTTP + PGlite + synthetic SerpAPI response; no real search',
      task: first.task, savedDetail: before, originalSnapshotUnchanged: true,
    }, null, 2) + '\n');
  }
});

test('Beta D4: absent excerpts and filtered unsafe sources are partial, readable and saveable', async t => {
  const f = await fixture(t);
  const result = await f.search('合成无摘要', { fetchImplementation: async () => json(organic([
    { ...source(), link: 'javascript:alert(1)' }, { ...source(), snippet: '' },
  ])) });
  assert.equal(result.task.partial, true);
  assert.equal(result.task.sources.length, 1);
  assert.equal(result.task.sources[0].snippet, '');
  assert.match(result.task.uncertaintyNote, /信息可能不完整/);
  const saved = await f.save(result.requestId);
  assert.equal(saved.status, 201);
  const detail = (await (await f.read(`/api/records/${(await saved.json()).data.id}`)).json()).data;
  assert.equal(detail.content.sources.length, 1);
  assert.deepEqual(detail.content.claims, []);
  assert.equal(detail.content.uncertaintyNote, result.task.uncertaintyNote);
});

test('Beta D4: failures poll as sanitized failed states, cannot save, and allow a new-request retry', async t => {
  const f = await fixture(t);
  const cases = [
    ['not-configured', 'SEARCH_NOT_CONFIGURED', { apiKey: '', fetchImplementation: async () => assert.fail('must not call network') }],
    ['auth', 'SEARCH_AUTH_FAILED', { fetchImplementation: async () => json({ error: KEY }, 401) }],
    ['quota', 'SEARCH_RATE_LIMITED', { fetchImplementation: async () => json({ error: KEY }, 429) }],
    ['upstream', 'SERVICE_UNAVAILABLE', { fetchImplementation: async () => json({ error: KEY }, 503) }],
    ['malformed', 'SERVICE_UNAVAILABLE', { fetchImplementation: async () => json({}) }],
    ['invalid-sources', 'SERVICE_UNAVAILABLE', { fetchImplementation: async () => json(organic([source('invalid')].map(item => ({ ...item, link: 'file:///private' })))) }],
    ['network', 'SERVICE_UNAVAILABLE', { fetchImplementation: async () => { throw new Error(KEY); } }],
    ['timeout', 'TIMEOUT', { timeoutMs: 10, fetchImplementation: async () => new Promise(() => {}) }],
  ];
  const observations = [];
  for (const [name, code, options] of cases) {
    const { task, requestId } = await f.search(`合成 ${name}`, options);
    assert.equal(task.status, 'failed', name);
    assert.equal(task.failureReason, code, name);
    assert.equal(task.sources, undefined);
    assert.equal(task.answer, undefined);
    assert.doesNotMatch(JSON.stringify(task), /synthetic-day4-serp-key|serpapi\.com|stack|consentId/);
    assert.equal((await f.save(requestId)).status, 409, name);
    observations.push({ case: name, pollingHttpStatus: 200, status: task.status, code, saveStatus: 409 });
  }
  assert.equal((await f.database.query('SELECT count(*)::int AS n FROM saved_records')).rows[0].n, 0);
  const retry = await f.search('合成重试成功');
  assert.equal(retry.task.status, 'completed');
  assert.equal((await f.save(retry.requestId)).status, 201);
  if (process.env.BETA_DAY4_FAILURE_PATH) {
    await writeFile(process.env.BETA_DAY4_FAILURE_PATH, JSON.stringify({
      environment: 'synthetic HTTP failures; no real vendor failure measurement', observations,
      retry: { newRequest: true, status: 'completed', saveStatus: 201 },
    }, null, 2) + '\n');
  }
});

test('Beta D4: ended queries discard warning metadata along with sources and answer', async t => {
  const f = await fixture(t);
  const result = await f.search();
  assert.equal((await f.post(`/api/sessions/${result.session.sessionId}/actions`, {
    requestId: randomUUID(), action: 'END', expectedSessionGeneration: 0, expectedActivityGeneration: 0,
  })).status, 200);
  const ended = searchTaskStateSchema.parse((await (await f.read(`/api/search/tasks/${result.requestId}`)).json()).data);
  assert.equal(ended.status, 'cancelled');
  for (const field of ['sources', 'claims', 'answer', 'searchState', 'partial', 'hasConflict', 'uncertaintyNote']) {
    assert.equal(ended[field], undefined);
  }
  assert.equal((await f.save(result.requestId)).status, 409);
});
