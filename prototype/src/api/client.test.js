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
