/**
 * Day 3 preflight against fixed main@0ee6d (same product files as 230293d).
 * Place this file at docs/alpha/曾俊涛/Day3_20261025/tests in the repository.
 * Real local HTTP/AuthService/TaskService/PGlite; search provider is an explicit substitute.
 * This does not prove external retrieval, companion, or browser integration.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { createApp } from '../../../../../backend/src/app.js';
import { AuthService } from '../../../../../backend/src/services/auth-service.js';
import { ConsentService } from '../../../../../backend/src/services/consent-service.js';
import { TaskService } from '../../../../../backend/src/services/task-service.js';
import { createTestDatabase } from '../../../../../backend/test/helpers/database.js';

const ORIGIN = 'http://127.0.0.1:5173';
const PASSWORD = 'synthetic:day3-only-password';
let database;
let server;
let baseUrl;
let state;
let releaseLate;

const searchProvider = {
  async search({ question }, { signal }) {
    if (question === 'synthetic:empty') {
      return { searchState: 'EMPTY', partial: false, hasConflict: false, claims: [], sources: [] };
    }
    if (question === 'synthetic:timeout') {
      const error = new Error('synthetic provider timeout');
      error.code = 'TIMEOUT';
      throw error;
    }
    if (question === 'synthetic:late') {
      return new Promise((resolve) => {
        releaseLate = () => resolve({
          searchState: 'SUCCESS', partial: false, hasConflict: false, claims: [],
          sources: [{ id: 'late', title: 'synthetic late source', url: 'https://example.test/late' }],
        });
        signal.addEventListener('abort', () => {}, { once: true });
      });
    }
    return {
      searchState: 'SUCCESS', partial: false, hasConflict: false, claims: [],
      sources: [{
        id: 'synthetic-source', title: 'synthetic source', url: 'https://example.test/source',
        retrievedAt: '2026-10-24T00:00:00.000Z',
      }],
    };
  },
};

async function jsonResponse(response) {
  const body = await response.json();
  return { status: response.status, body };
}

async function context(cookie) {
  const response = await fetch(`${baseUrl}/api/auth/context`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: body.data.csrfToken };
}

async function post(path, current, body) {
  return jsonResponse(await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Cookie: current.cookie,
      Origin: ORIGIN, 'X-CSRF-Token': current.csrf,
    },
    body: JSON.stringify(body),
  }));
}

async function get(path, current = state) {
  return jsonResponse(await fetch(`${baseUrl}${path}`, {
    headers: { Cookie: current.cookie },
  }));
}

async function session(mode = 'SEARCH') {
  const result = await post('/api/sessions', state, { requestId: randomUUID(), mode });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body.data;
}

async function searchTask(question, current = null) {
  current ??= await session();
  const requestId = randomUUID();
  const payload = {
    sessionId: current.sessionId, activityId: current.activityId,
    sessionGeneration: current.sessionGeneration,
    activityGeneration: current.activityGeneration, question,
  };
  const consent = await post('/api/consents', state, {
    requestId: randomUUID(), purpose: 'SEARCH_PROCESS',
    operation: 'SEARCH_TASK_CREATE', payload,
  });
  assert.equal(consent.status, 201, JSON.stringify(consent.body));
  const accepted = await post('/api/search/tasks', state, {
    requestId, ...payload, consentId: consent.body.data.consentId,
  });
  assert.equal(accepted.status, 202, JSON.stringify(accepted.body));
  return { requestId, current, accepted: accepted.body.data };
}

async function eventual(requestId, expected) {
  for (let i = 0; i < 100; i++) {
    const result = await get(`/api/search/tasks/${requestId}`);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    if (result.body.data.status === expected) return result.body.data;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`search task ${requestId} did not reach ${expected}`);
}

before(async () => {
  database = await createTestDatabase();
  const authService = new AuthService(database, {
    profileKey: createHash('sha256').update('synthetic:day3-key').digest(),
  });
  const consentService = new ConsentService();
  const taskService = new TaskService({ searchProvider, consentService });
  server = createApp({ database, authService, consentService, taskService, appOrigin: ORIGIN })
    .listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const anonymous = await context();
  const name = `synthetic_day3_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const registered = await post('/api/auth/register', anonymous, {
    requestId: randomUUID(), loginName: name, password: PASSWORD, confirmPassword: PASSWORD,
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Cookie: anonymous.cookie,
      Origin: ORIGIN, 'X-CSRF-Token': anonymous.csrf,
    },
    body: JSON.stringify({ loginName: name, password: PASSWORD, target: 'PROFILE' }),
  });
  assert.equal(loginResponse.status, 200, await loginResponse.text());
  state = await context(loginResponse.headers.get('set-cookie').split(';')[0]);
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (database) await database.close();
});

test('D3-S01 authenticated search returns a source through HTTP', async () => {
  const { requestId } = await searchTask('synthetic:success');
  const completed = await eventual(requestId, 'completed');
  assert.equal(completed.searchState, 'SUCCESS');
  assert.equal(completed.sources.length, 1);
  assert.equal(completed.sources[0].url, 'https://example.test/source');
});

test('D3-S02 empty search is distinct from success with sources', async () => {
  const { requestId } = await searchTask('synthetic:empty');
  const completed = await eventual(requestId, 'completed');
  assert.equal(completed.searchState, 'EMPTY');
  assert.deepEqual(completed.sources, []);
});

test('D3-S03 provider timeout becomes a failed task', async () => {
  const { requestId } = await searchTask('synthetic:timeout');
  const failed = await eventual(requestId, 'failed');
  assert.equal(failed.failureReason, 'TIMEOUT');
  assert.equal(failed.sources, undefined);
});

test('D3-S04 cancellation prevents late source refill', async () => {
  const { requestId } = await searchTask('synthetic:late');
  const cancelled = await post(`/api/search/tasks/${requestId}/cancel`, state, {});
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  releaseLate?.();
  const result = await eventual(requestId, 'cancelled');
  assert.equal(result.sources, undefined);
  assert.equal(result.answer, undefined);
});

test('D3-S05 search task is hidden from a second authenticated account', async () => {
  const { requestId } = await searchTask('synthetic:success');
  const second = await context();
  const loginName = `synthetic_day3_b_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const registered = await post('/api/auth/register', second, {
    requestId: randomUUID(), loginName, password: PASSWORD, confirmPassword: PASSWORD,
  });
  assert.equal(registered.status, 201);
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Cookie: second.cookie,
      Origin: ORIGIN, 'X-CSRF-Token': second.csrf,
    },
    body: JSON.stringify({ loginName, password: PASSWORD, target: 'PROFILE' }),
  });
  assert.equal(loginResponse.status, 200);
  const otherState = await context(loginResponse.headers.get('set-cookie').split(';')[0]);
  const result = await get(`/api/search/tasks/${requestId}`, otherState);
  assert.equal(result.status, 404);
  assert.equal((await get(`/api/search/tasks/${requestId}`)).status, 200);
});

test('D3-S06 ending a session cancels a late search result', async () => {
  const current = await session();
  const { requestId } = await searchTask('synthetic:late', current);
  const ended = await post(`/api/sessions/${current.sessionId}/actions`, state, {
    requestId: randomUUID(), action: 'END',
    expectedSessionGeneration: current.sessionGeneration,
    expectedActivityGeneration: current.activityGeneration,
  });
  assert.equal(ended.status, 200);
  assert.equal(ended.body.data.state, 'ended');
  releaseLate?.();
  const result = await eventual(requestId, 'cancelled');
  assert.equal(result.sources, undefined);
  assert.equal(result.answer, undefined);
});

test('D3-T01 rehearsal session pause, resume and end have HTTP state transitions', async () => {
  const current = await session('REHEARSE');
  let latest = current;
  for (const [action, expected] of [
    ['PAUSE', 'paused'], ['RESUME', 'running'],
    ['FINISH_REHEARSAL', 'reviewing'], ['END', 'ended'],
  ]) {
    const result = await post(`/api/sessions/${current.sessionId}/actions`, state, {
      requestId: randomUUID(), action,
      expectedSessionGeneration: latest.sessionGeneration,
      expectedActivityGeneration: latest.activityGeneration,
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.data.state, expected);
    latest = result.body.data;
  }
});
