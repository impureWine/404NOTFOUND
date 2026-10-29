import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../../src/app.js';
import { parseProfileKey } from '../../src/security/crypto.js';
import { AuthService } from '../../src/services/auth-service.js';
import { createTestDatabase } from '../helpers/database.js';

const ORIGIN = 'http://127.0.0.1:5173';
const requestId = '2f74a372-2e54-4fe7-945a-a7992cf4a06b';

async function withApi(callback) {
  const database = await createTestDatabase();
  const authService = new AuthService(database, {
    profileKey: parseProfileKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='),
  });
  const server = createApp({ database, authService, appOrigin: ORIGIN }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const address = server.address();
    await callback({ baseUrl: `http://127.0.0.1:${address.port}`, database });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await database.close();
  }
}

async function context(baseUrl, cookie) {
  const response = await fetch(`${baseUrl}/api/auth/context`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  const body = await response.json();
  return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: body.data.csrfToken, body };
}

async function post(baseUrl, path, state, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: state.cookie,
      Origin: ORIGIN,
      'X-CSRF-Token': state.csrf,
    },
    body: JSON.stringify(body),
  });
}

test('register, login, profile, logout and password change form a real isolated flow', async () => {
  await withApi(async ({ baseUrl, database }) => {
    const anonymous = await context(baseUrl);
    const password = 'correct-horse-battery';
    const register = await post(baseUrl, '/api/auth/register', anonymous, {
      requestId,
      loginName: 'Alpha_User',
      password,
      confirmPassword: password,
    });
    assert.equal(register.status, 201);

    const credential = await database.query('SELECT password_digest FROM password_credentials');
    assert.match(credential.rows[0].password_digest, /^\$argon2id\$/);
    assert.equal(JSON.stringify(credential.rows).includes(password), false);

    const login = await post(baseUrl, '/api/auth/login', anonymous, {
      loginName: 'alpha_user',
      password,
      target: 'PROFILE',
    });
    assert.equal(login.status, 200);
    const loggedCookie = login.headers.get('set-cookie').split(';')[0];
    const logged = await context(baseUrl, loggedCookie);
    assert.equal(logged.body.data.authenticated, true);

    const profile = await fetch(`${baseUrl}/api/profile`, { headers: { Cookie: logged.cookie } });
    assert.equal(profile.status, 200);
    assert.equal((await profile.json()).data.nickname, 'alpha_user');

    const updated = await fetch(`${baseUrl}/api/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: logged.cookie,
        Origin: ORIGIN,
        'X-CSRF-Token': logged.csrf,
      },
      body: JSON.stringify({
        requestId,
        expectedVersion: 1,
        nickname: 'Alpha',
        avatarKey: 'DEFAULT',
        bio: '不会明文落库的简介',
      }),
    });
    const updatedBody = await updated.json();
    assert.equal(updated.status, 200, JSON.stringify(updatedBody));
    assert.equal(updatedBody.data.bio, '不会明文落库的简介');
    const storedProfile = await database.query('SELECT bio_ciphertext FROM user_profiles');
    assert.equal(JSON.stringify(storedProfile.rows).includes('不会明文落库的简介'), false);

    const nextPassword = 'another-valid-password';
    const changed = await post(baseUrl, '/api/auth/change-password', logged, {
      currentPassword: password,
      newPassword: nextPassword,
      confirmPassword: nextPassword,
    });
    assert.equal(changed.status, 204);
    const staleProfile = await fetch(`${baseUrl}/api/profile`, { headers: { Cookie: logged.cookie } });
    assert.equal(staleProfile.status, 401);

    const freshAnonymous = await context(baseUrl);
    const oldLogin = await post(baseUrl, '/api/auth/login', freshAnonymous, {
      loginName: 'alpha_user',
      password,
      target: 'PROFILE',
    });
    assert.equal(oldLogin.status, 401);
    const freshLogin = await post(baseUrl, '/api/auth/login', freshAnonymous, {
      loginName: 'alpha_user',
      password: nextPassword,
      target: 'PROFILE',
    });
    assert.equal(freshLogin.status, 200);

    const logoutContext = await context(baseUrl, freshLogin.headers.get('set-cookie').split(';')[0]);
    const logout = await post(baseUrl, '/api/auth/logout', logoutContext);
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
    const afterLogout = await fetch(`${baseUrl}/api/profile`, { headers: { Cookie: logoutContext.cookie } });
    assert.equal(afterLogout.status, 401);
  });
});

test('mutating routes reject missing CSRF and foreign Origin', async () => {
  await withApi(async ({ baseUrl }) => {
    const anonymous = await context(baseUrl);
    const body = JSON.stringify({
      requestId,
      loginName: 'blocked_user',
      password: 'correct-horse-battery',
      confirmPassword: 'correct-horse-battery',
    });
    const missingCsrf = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: anonymous.cookie, Origin: ORIGIN },
      body,
    });
    assert.equal(missingCsrf.status, 403);
    const foreignOrigin = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: anonymous.cookie,
        Origin: 'https://attacker.invalid',
        'X-CSRF-Token': anonymous.csrf,
      },
      body,
    });
    assert.equal(foreignOrigin.status, 403);
  });
});

test('password change revokes every active session for the account', async () => {
  await withApi(async ({ baseUrl }) => {
    const password = 'correct-horse-battery';
    const firstAnonymous = await context(baseUrl);
    const registered = await post(baseUrl, '/api/auth/register', firstAnonymous, {
      requestId,
      loginName: 'multi_session_user',
      password,
      confirmPassword: password,
    });
    assert.equal(registered.status, 201);
    const secondAnonymous = await context(baseUrl);
    const firstLogin = await post(baseUrl, '/api/auth/login', firstAnonymous, {
      loginName: 'multi_session_user', password, target: 'PROFILE',
    });
    const secondLogin = await post(baseUrl, '/api/auth/login', secondAnonymous, {
      loginName: 'multi_session_user', password, target: 'PROFILE',
    });
    assert.equal(firstLogin.status, 200);
    assert.equal(secondLogin.status, 200);
    const first = await context(baseUrl, firstLogin.headers.get('set-cookie').split(';')[0]);
    const second = await context(baseUrl, secondLogin.headers.get('set-cookie').split(';')[0]);

    const changed = await post(baseUrl, '/api/auth/change-password', first, {
      currentPassword: password,
      newPassword: 'another-valid-password',
      confirmPassword: 'another-valid-password',
    });
    assert.equal(changed.status, 204);
    assert.equal((await fetch(`${baseUrl}/api/profile`, { headers: { Cookie: first.cookie } })).status, 401);
    assert.equal((await fetch(`${baseUrl}/api/profile`, { headers: { Cookie: second.cookie } })).status, 401);
  });
});
