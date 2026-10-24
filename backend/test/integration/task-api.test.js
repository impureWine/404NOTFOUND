import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../../src/app.js';
import { parseProfileKey } from '../../src/security/crypto.js';
import { AuthService } from '../../src/services/auth-service.js';
import { ConsentService } from '../../src/services/consent-service.js';
import { TaskService } from '../../src/services/task-service.js';
import { createTestDatabase } from '../helpers/database.js';

const ORIGIN = 'http://127.0.0.1:5173';
let sequence = 100;
const nextId = () => `2f74a372-2e54-4fe7-945a-${String(++sequence).padStart(12, '0')}`;

async function withApi(callback) {
  const database = await createTestDatabase();
  const authService = new AuthService(database, {
    profileKey: parseProfileKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='),
  });
  const consentService = new ConsentService();
  const taskService = new TaskService({
    consentService,
    searchProvider: {
      search: async ({ question }) => ({
        searchState: 'SUCCESS',
        partial: false,
        hasConflict: false,
        claims: [],
        sources: [{ id: 'source-1', title: question, url: 'https://example.test/source', retrievedAt: new Date().toISOString() }],
      }),
    },
  });
  const server = createApp({ database, authService, consentService, taskService, appOrigin: ORIGIN })
    .listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await database.close();
  }
}

async function context(baseUrl) {
  const response = await fetch(`${baseUrl}/api/auth/context`);
  const body = await response.json();
  return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: body.data.csrfToken };
}

async function post(baseUrl, path, state, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: state.cookie, Origin: ORIGIN, 'X-CSRF-Token': state.csrf },
    body: JSON.stringify(body),
  });
}

test('session and search HTTP flow binds consent, reports status, isolates owners and cancels on END', async () => {
  await withApi(async (baseUrl) => {
    const owner = await context(baseUrl);
    const stranger = await context(baseUrl);
    const createdSession = await post(baseUrl, '/api/sessions', owner, { requestId: nextId(), mode: 'SEARCH' });
    assert.equal(createdSession.status, 201);
    const session = (await createdSession.json()).data;
    const question = '后端 Day 3 查询';
    const payload = {
      sessionId: session.sessionId,
      activityId: session.activityId,
      sessionGeneration: session.sessionGeneration,
      activityGeneration: session.activityGeneration,
      question,
    };
    const consentResponse = await post(baseUrl, '/api/consents', owner, {
      requestId: nextId(),
      purpose: 'SEARCH_PROCESS',
      operation: 'SEARCH_TASK_CREATE',
      payload,
    });
    assert.equal(consentResponse.status, 201);
    const consentId = (await consentResponse.json()).data.consentId;
    const searchRequestId = nextId();
    const acceptedResponse = await post(baseUrl, '/api/search/tasks', owner, {
      requestId: searchRequestId,
      consentId,
      ...payload,
    });
    assert.equal(acceptedResponse.status, 202);
    assert.equal((await acceptedResponse.json()).data.status, 'pending');
    await new Promise((resolve) => setImmediate(resolve));

    const completedResponse = await fetch(`${baseUrl}/api/search/tasks/${searchRequestId}`, {
      headers: { Cookie: owner.cookie },
    });
    assert.equal(completedResponse.status, 200);
    const completed = (await completedResponse.json()).data;
    assert.equal(completed.status, 'completed');
    assert.equal(completed.sources.length, 1);
    assert.equal((await fetch(`${baseUrl}/api/search/tasks/${searchRequestId}`, {
      headers: { Cookie: stranger.cookie },
    })).status, 404);

    const endedResponse = await post(baseUrl, `/api/sessions/${session.sessionId}/actions`, owner, {
      requestId: nextId(),
      action: 'END',
      expectedSessionGeneration: session.sessionGeneration,
      expectedActivityGeneration: session.activityGeneration,
    });
    assert.equal(endedResponse.status, 200);
    assert.equal((await endedResponse.json()).data.state, 'ended');

    const staleConsent = await post(baseUrl, '/api/consents', owner, {
      requestId: nextId(),
      purpose: 'SEARCH_PROCESS',
      operation: 'SEARCH_TASK_CREATE',
      payload,
    });
    const staleConsentId = (await staleConsent.json()).data.consentId;
    const staleTask = await post(baseUrl, '/api/search/tasks', owner, {
      requestId: nextId(),
      consentId: staleConsentId,
      ...payload,
    });
    assert.equal(staleTask.status, 409);
  });
});
