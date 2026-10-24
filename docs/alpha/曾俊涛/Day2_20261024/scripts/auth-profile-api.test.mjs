import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

// Only run against an explicitly designated isolated test service/database.
const baseUrl = process.env.TEST_API_BASE_URL;
const csrfHeaderName = process.env.TEST_CSRF_HEADER_NAME;
const loginTarget = process.env.TEST_LOGIN_TARGET;
const appOrigin = process.env.TEST_APP_ORIGIN || (baseUrl ? new URL(baseUrl).origin : null);
const enabled = process.env.TEST_ISOLATED_API === '1' && Boolean(baseUrl && csrfHeaderName && loginTarget);

test('Day 2 auth/profile HTTP contract on an isolated service', { skip: enabled ? false : 'Set TEST_ISOLATED_API=1, TEST_API_BASE_URL, TEST_CSRF_HEADER_NAME and TEST_LOGIN_TARGET for an isolated service.' }, async t => {
  assert.equal(new URL(baseUrl).pathname, '/', 'TEST_API_BASE_URL must be the service origin with a trailing slash');
  const cookies = new Map();
  let csrfToken = null;

  async function request(path, { method = 'GET', body, csrf = false, authenticated = true } = {}) {
    const headers = { Accept: 'application/json', Origin: appOrigin };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (csrf) {
      assert.ok(csrfToken, 'Auth context must supply a CSRF token before writes');
      headers[csrfHeaderName] = csrfToken;
    }
    if (authenticated && cookies.size) headers.Cookie = [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    const response = await fetch(new URL(path, baseUrl), {
      method,
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const setCookie of response.headers.getSetCookie()) {
      const [pair] = setCookie.split(';');
      const equal = pair.indexOf('=');
      if (equal < 1) continue;
      const name = pair.slice(0, equal);
      const value = pair.slice(equal + 1);
      if (value) cookies.set(name, value);
      else cookies.delete(name);
    }
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    return { response, data: payload?.data ?? payload };
  }

  await t.test('anonymous profile access is denied', async () => {
    const { response } = await request('/api/profile', { authenticated: false });
    assert.equal(response.status, 401);
  });

  await t.test('fetch context and register without auto-login', async subtest => {
    const context = await request('/api/auth/context');
    assert.equal(context.response.status, 200);
    csrfToken = context.data?.csrfToken;
    assert.ok(csrfToken);
    const loginName = `qa_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
    const password = `T3st!${randomUUID()}Aa`;
    t.diagnostic(`synthetic loginName=${loginName}`);
    const registration = await request('/api/auth/register', {
      method: 'POST', csrf: true,
      body: { requestId: randomUUID(), loginName, password, confirmPassword: password },
    });
    assert.equal(registration.response.status, 201);
    assert.ok(registration.data?.accountId);
    const stillAnonymous = await request('/api/profile');
    assert.equal(stillAnonymous.response.status, 401);

    await subtest.test('duplicate login identifier and invalid password are rejected', async () => {
      const duplicate = await request('/api/auth/register', {
        method: 'POST', csrf: true,
        body: { requestId: randomUUID(), loginName: loginName.toUpperCase(), password, confirmPassword: password },
      });
      assert.equal(duplicate.response.status, 409);
      const invalid = await request('/api/auth/register', {
        method: 'POST', csrf: true,
        body: { requestId: randomUUID(), loginName: `qa_${randomUUID().replaceAll('-', '').slice(0, 20)}`, password: 'short-pass1', confirmPassword: 'short-pass1' },
      });
      assert.equal(invalid.response.status, 400);
    });

    await subtest.test('login, own profile, CSRF refusal, logout and old session rejection', async () => {
      const login = await request('/api/auth/login', {
        method: 'POST', csrf: true,
        body: { loginName, password, target: loginTarget },
      });
      assert.equal(login.response.status, 200);
      assert.ok(cookies.size, 'login must issue a session cookie');
      const oldCookie = new Map(cookies);
      const newContext = await request('/api/auth/context');
      assert.equal(newContext.response.status, 200);
      assert.equal(newContext.data?.authenticated, true);
      csrfToken = newContext.data?.csrfToken;
      const profile = await request('/api/profile');
      assert.equal(profile.response.status, 200);
      assert.equal(typeof profile.data?.version, 'number');
      const updated = await request('/api/profile', {
        method: 'PATCH', csrf: true,
        body: { requestId: randomUUID(), expectedVersion: profile.data.version, nickname: 'QA Synthetic', avatarKey: profile.data.avatarKey, bio: 'synthetic-only profile' },
      });
      assert.equal(updated.response.status, 200);
      assert.equal(updated.data?.version, profile.data.version + 1);
      const stale = await request('/api/profile', {
        method: 'PATCH', csrf: true,
        body: { requestId: randomUUID(), expectedVersion: profile.data.version, nickname: 'Stale', avatarKey: profile.data.avatarKey, bio: '' },
      });
      assert.equal(stale.response.status, 409);
      const withoutCsrf = await request('/api/auth/logout', { method: 'POST' });
      assert.ok([400, 403].includes(withoutCsrf.response.status));
      const logout = await request('/api/auth/logout', { method: 'POST', csrf: true });
      assert.equal(logout.response.status, 204);
      cookies.clear();
      for (const [key, value] of oldCookie) cookies.set(key, value);
      const afterLogout = await request('/api/profile');
      assert.equal(afterLogout.response.status, 401);
    });
  });
});
