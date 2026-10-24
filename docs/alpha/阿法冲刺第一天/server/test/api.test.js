import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

const withServer = async (callback) => {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const address = server.address();
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
};

test('health endpoint is runnable and does not expose configuration', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.data.status, 'ok');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(JSON.stringify(body).includes('DATABASE_URL'), false);
    assert.match(body.meta.requestId, /^[0-9a-f-]{36}$/i);
  });
});

test('registered skeleton validates input before reporting unavailable service', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginName: 'x' }),
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'INVALID_INPUT');
    assert.ok(Array.isArray(body.error.fields));
  });
});

test('valid but unimplemented auth request is explicitly unavailable', async () => {
  await withServer(async (baseUrl) => {
    const password = 'valid-password';
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: '2f74a372-2e54-4fe7-945a-a7992cf4a06b',
        loginName: 'team_404',
        password,
        confirmPassword: password,
      }),
    });
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.error.code, 'SERVICE_UNAVAILABLE');
  });
});
