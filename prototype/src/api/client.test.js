import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, createApiClient } from './client.js';

const jsonResponse = (status, payload) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

test('mock mode never calls fetch or claims an API success', async () => {
  let calls = 0;
  const client = createApiClient({ mode: 'mock', fetchImpl: async () => { calls += 1; } });

  await assert.rejects(client.getCapabilities(), error => error.code === 'API_NOT_CONNECTED');
  assert.equal(calls, 0);
});

test('real mode uses same-origin no-store requests and the configured CSRF header', async () => {
  const calls = [];
  const client = createApiClient({
    mode: 'real',
    csrfHeaderName: 'X-Test-CSRF',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url === '/api/auth/context') return jsonResponse(200, { data: { authenticated: false, csrfToken: 'memory-token' } });
      return jsonResponse(201, { data: { sessionId: 'session-1' } });
    },
  });

  await client.getAuthContext();
  const result = await client.createSession({ requestId: 'req-1', mode: 'LISTEN' });

  assert.deepEqual(result, { sessionId: 'session-1' });
  assert.equal(calls[0].url, '/api/auth/context');
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.headers.get('Cache-Control'), 'no-store');
  assert.equal(calls[1].options.headers.get('X-Test-CSRF'), 'memory-token');
  assert.equal(calls[1].options.body, JSON.stringify({ requestId: 'req-1', mode: 'LISTEN' }));
});

test('real mode refuses writes before context has configured CSRF state', async () => {
  let calls = 0;
  const client = createApiClient({ mode: 'real', csrfHeaderName: 'X-Test-CSRF', fetchImpl: async () => { calls += 1; } });

  await assert.rejects(client.createRecord({ requestId: 'req-1' }), error => error.code === 'CSRF_CONFIG_MISSING');
  assert.equal(calls, 0);
});

test('authentication methods preserve the shared request names and credential policy', async () => {
  const calls = [];
  const client = createApiClient({
    mode: 'real',
    csrfHeaderName: 'X-Test-CSRF',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url === '/api/auth/context') return jsonResponse(200, { data: { authenticated: false, csrfToken: 'auth-token' } });
      if (url === '/api/auth/register') return jsonResponse(201, { data: { accountId: 'account-1' } });
      if (url === '/api/auth/login') return jsonResponse(200, { data: { profile: { nickname: '小满' } } });
      if (url === '/api/profile') return jsonResponse(200, { data: { nickname: '小满', bio: '先慢慢来。' } });
      if (url === '/api/auth/logout') return new Response(null, { status: 204 });
      throw new Error(`unexpected URL ${url}`);
    },
  });

  await client.getAuthContext();
  await client.register({ requestId: 'req-register', loginName: 'demo_a', password: 'secret', confirmPassword: 'secret' });
  await client.login({ loginName: 'demo_a', password: 'secret', target: 'HOME' });
  await client.getAuthContext();
  assert.deepEqual(await client.getProfile(), { nickname: '小满', bio: '先慢慢来。' });
  await client.logout();

  assert.deepEqual(calls.map(call => call.url), [
    '/api/auth/context',
    '/api/auth/register',
    '/api/auth/login',
    '/api/auth/context',
    '/api/profile',
    '/api/auth/logout',
  ]);
  assert.equal(calls[1].options.headers.get('X-Test-CSRF'), 'auth-token');
  assert.equal(calls[1].options.credentials, 'include');
  assert.equal(calls[1].options.body, JSON.stringify({ requestId: 'req-register', loginName: 'demo_a', password: 'secret', confirmPassword: 'secret' }));
  assert.equal(calls[2].options.body, JSON.stringify({ loginName: 'demo_a', password: 'secret', target: 'HOME' }));
  assert.equal(calls[4].options.method, 'GET');
  assert.equal(calls[5].options.body, undefined);
});

test('identity changes discard the in-memory CSRF token even when the response is lost', async () => {
  const client = createApiClient({
    mode: 'real',
    csrfHeaderName: 'X-Test-CSRF',
    fetchImpl: async url => {
      if (url === '/api/auth/context') return jsonResponse(200, { data: { authenticated: true, csrfToken: 'old-token' } });
      throw new TypeError('connection lost after request');
    },
  });

  await client.getAuthContext();
  await assert.rejects(client.logout(), error => error.code === 'NETWORK_ERROR');
  await assert.rejects(client.createRecord({ requestId: 'req-after-logout' }), error => error.code === 'CSRF_CONFIG_MISSING');
});

test('record vault uses the shared consent, list, detail, and two-step clear endpoints', async () => {
  const calls = [];
  const recordId = 'eb42bd50-4f63-4cfb-8515-b45c30de2c52';
  const client = createApiClient({
    mode: 'real',
    csrfHeaderName: 'X-Test-CSRF',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url === '/api/auth/context') return jsonResponse(200, { data: { authenticated: true, csrfToken: 'record-token' } });
      if (url === '/api/consents') return jsonResponse(201, { data: { consentId: 'ed80345f-0105-4a57-9d08-1e3956e7484b' } });
      if (url === '/api/records') return jsonResponse(201, { data: { id: recordId, version: 1 } });
      if (url === '/api/records?limit=20') return jsonResponse(200, { data: { items: [{ id: recordId, kind: 'CONVERSATION', version: 1 }], nextCursor: null } });
      if (url === `/api/records/${recordId}`) return jsonResponse(200, { data: { id: recordId, kind: 'CONVERSATION', version: 1, details: { messages: [{ role: 'USER', contentCiphertext: 'ciphertext' }] } } });
      if (url === `/api/records/${recordId}/clear-confirmations`) return jsonResponse(201, { data: { confirmationId: 'f4c56483-d675-4f66-a08e-c4e471cb429d' } });
      if (url === `/api/records/${recordId}/clear`) return jsonResponse(200, { data: { cleared: true, recordId } });
      throw new Error(`unexpected URL ${url}`);
    },
  });

  await client.getAuthContext();
  const content = { title: '仅主动保存', body: '保存正文' };
  const consent = await client.createConsent({ requestId: 'consent-request', purpose: 'SAVE', operation: 'RECORD_CREATE', payload: { kind: 'CONVERSATION', content } });
  await client.createRecord({ requestId: 'record-request', consentId: consent.consentId, kind: 'CONVERSATION', content });
  await client.listRecords({ limit: 20 });
  await client.getRecord(recordId);
  await client.createRecordClearConfirmation(recordId, { requestId: 'clear-confirm-request', expectedVersion: 1 });
  await client.clearRecord(recordId, { requestId: 'clear-request', expectedVersion: 1, confirmationId: 'f4c56483-d675-4f66-a08e-c4e471cb429d' });

  assert.deepEqual(calls.map(call => call.url), [
    '/api/auth/context',
    '/api/consents',
    '/api/records',
    '/api/records?limit=20',
    `/api/records/${recordId}`,
    `/api/records/${recordId}/clear-confirmations`,
    `/api/records/${recordId}/clear`,
  ]);
  for (const call of calls.slice(1).filter(({ options }) => options.method !== 'GET')) {
    assert.equal(call.options.credentials, 'include');
    assert.equal(call.options.cache, 'no-store');
    assert.equal(call.options.headers.get('X-Test-CSRF'), 'record-token');
  }
  assert.equal(calls[1].options.body, JSON.stringify({ requestId: 'consent-request', purpose: 'SAVE', operation: 'RECORD_CREATE', payload: { kind: 'CONVERSATION', content } }));
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), {
    requestId: 'clear-request',
    expectedVersion: 1,
    confirmationId: 'f4c56483-d675-4f66-a08e-c4e471cb429d',
  });
});

test('API errors preserve the contract code and request id without retaining raw bodies', async () => {
  const client = createApiClient({
    mode: 'real',
    fetchImpl: async () => jsonResponse(409, { error: { code: 'SESSION_STALE', message: 'Session changed' }, meta: { requestId: 'req-2' } }),
  });

  await assert.rejects(client.getCapabilities(), error => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 409);
    assert.equal(error.code, 'SESSION_STALE');
    assert.equal(error.requestId, 'req-2');
    assert.equal(Object.hasOwn(error, 'rawBody'), false);
    return true;
  });
});
