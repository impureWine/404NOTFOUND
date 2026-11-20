/**
 * Beta Day7 签认探针（关欣 · 安全 / 内容审核）。
 *
 * 对应 PM Day7 遗留表 P0："关欣、曾俊涛先验证 401 与合法会话的 CSRF 行为，再复核
 * END、RESTART、撤回及迟到结果失效。以同一 SHA 留证。"
 * 本文件补的是其中缺的一条：**合法会话 + 错误 CSRF 必须 403 且无写入副作用**，
 * 以及与失效会话 401 的对照。
 *
 * 约定：`synthetic:` 合成数据、本地 PGlite、合成模型适配器；不连接正式数据库、不调用真实模型。
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createApp } from '../../src/app.js';
import { RecordRepository } from '../../src/repositories/record-repository.js';
import { parseProfileKey } from '../../src/security/crypto.js';
import { AuthService } from '../../src/services/auth-service.js';
import { ConsentService } from '../../src/services/consent-service.js';
import { RecordService } from '../../src/services/record-service.js';
import { createTestDatabase } from '../helpers/database.js';

const ORIGIN = 'http://127.0.0.1:5173';
const KEY = parseProfileKey('EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE=');
const PASSWORD = 'synthetic:beta7-password-only';

async function withApi(callback) {
  const database = await createTestDatabase();
  const authService = new AuthService(database, { profileKey: KEY });
  const consentService = new ConsentService();
  const recordService = new RecordService(new RecordRepository(database), { encryptionKey: KEY, consentService });
  const server = createApp({ database, authService, consentService, recordService, appOrigin: ORIGIN })
    .listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await callback({ baseUrl: `http://127.0.0.1:${server.address().port}`, database });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await database.close();
  }
}

async function context(baseUrl, cookie) {
  const response = await fetch(`${baseUrl}/api/auth/context`, { headers: cookie ? { Cookie: cookie } : {} });
  assert.equal(response.status, 200);
  const body = await response.json();
  return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: body.data.csrfToken };
}

function send(baseUrl, pathname, state, body, { csrf } = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: state.cookie,
      Origin: ORIGIN,
      'X-CSRF-Token': csrf ?? state.csrf,
    },
    body: JSON.stringify(body),
  });
}

async function registerAndLogin(baseUrl, loginName) {
  const anonymous = await context(baseUrl);
  assert.equal((await send(baseUrl, '/api/auth/register', anonymous, {
    requestId: randomUUID(), loginName, password: PASSWORD, confirmPassword: PASSWORD,
  })).status, 201);
  const login = await send(baseUrl, '/api/auth/login', anonymous, {
    loginName, password: PASSWORD, target: 'PROFILE',
  });
  assert.equal(login.status, 200);
  return context(baseUrl, login.headers.get('set-cookie').split(';')[0]);
}

const recordPayload = () => ({ kind: 'CONVERSATION', content: { title: 'synthetic:beta7 标题', body: 'synthetic:beta7 正文' } });

async function signConsent(baseUrl, state, payload) {
  const response = await send(baseUrl, '/api/consents', state, {
    requestId: randomUUID(), purpose: 'SAVE', operation: 'RECORD_CREATE', payload,
  });
  assert.equal(response.status, 201);
  return (await response.json()).data.consentId;
}

test('B7-CSRF 合法会话 + 错误 CSRF：403 且无写入副作用', async () => {
  await withApi(async ({ baseUrl }) => {
    const user = await registerAndLogin(baseUrl, 'synthetic_beta7_csrf');
    const payload = recordPayload();
    const consentId = await signConsent(baseUrl, user, payload);
    const observation = {};

    // 反例：会话有效，但 CSRF 令牌错误
    const wrong = await send(baseUrl, '/api/records', user, {
      requestId: randomUUID(), consentId, ...payload,
    }, { csrf: randomUUID() });
    observation.wrongCsrfStatus = wrong.status;
    observation.wrongCsrfCode = (await wrong.json())?.error?.code ?? null;

    const listAfterWrong = await (await fetch(`${baseUrl}/api/records`, { headers: { Cookie: user.cookie } })).json();
    observation.recordsAfterWrongCsrf = listAfterWrong.data.items.length;

    // 正例：同一会话、正确 CSRF 可以写入
    const correct = await send(baseUrl, '/api/records', user, {
      requestId: randomUUID(), consentId, ...payload,
    });
    observation.correctCsrfStatus = correct.status;
    const listAfterCorrect = await (await fetch(`${baseUrl}/api/records`, { headers: { Cookie: user.cookie } })).json();
    observation.recordsAfterCorrectCsrf = listAfterCorrect.data.items.length;

    console.log('[B7-CSRF]', JSON.stringify(observation));
    assert.equal(observation.wrongCsrfStatus, 403, '合法会话下错误 CSRF 必须 403');
    assert.equal(observation.wrongCsrfCode, 'ACCESS_DENIED');
    assert.equal(observation.recordsAfterWrongCsrf, 0, '被拒绝的写请求不得产生记录');
    assert.equal(observation.correctCsrfStatus, 201);
    assert.equal(observation.recordsAfterCorrectCsrf, 1);
  });
});

test('B7-STALE 退出后旧 Cookie：读 401、写 401，且无写入副作用', async () => {
  await withApi(async ({ baseUrl }) => {
    const user = await registerAndLogin(baseUrl, 'synthetic_beta7_stale');
    const payload = recordPayload();
    const consentId = await signConsent(baseUrl, user, payload);
    const observation = {};

    // 退出（204），旧 Cookie 立即失效
    const logout = await send(baseUrl, '/api/auth/logout', user, { requestId: randomUUID() });
    observation.logoutStatus = logout.status;

    const read = await fetch(`${baseUrl}/api/records`, { headers: { Cookie: user.cookie } });
    observation.staleReadStatus = read.status;
    observation.staleReadCode = (await read.json())?.error?.code ?? null;

    const write = await send(baseUrl, '/api/records', user, {
      requestId: randomUUID(), consentId, ...payload,
    });
    observation.staleWriteStatus = write.status;
    observation.staleWriteCode = (await write.json())?.error?.code ?? null;

    // 用同账号重新登录，确认没有残留记录
    const relogin = await send(baseUrl, '/api/auth/login', await context(baseUrl), {
      loginName: 'synthetic_beta7_stale', password: PASSWORD, target: 'PROFILE',
    });
    assert.equal(relogin.status, 200);
    const fresh = await context(baseUrl, relogin.headers.get('set-cookie').split(';')[0]);
    const list = await (await fetch(`${baseUrl}/api/records`, { headers: { Cookie: fresh.cookie } })).json();
    observation.recordsAfterStaleWrite = list.data.items.length;

    console.log('[B7-STALE]', JSON.stringify(observation));
    assert.equal(observation.logoutStatus, 204);
    assert.equal(observation.staleReadStatus, 401, '失效会话读请求必须 401');
    assert.equal(observation.staleReadCode, 'AUTH_REQUIRED');
    assert.equal(observation.staleWriteStatus, 401, '失效会话写请求必须 401，不再是 403');
    assert.equal(observation.staleWriteCode, 'AUTH_REQUIRED');
    assert.equal(observation.recordsAfterStaleWrite, 0, '失效会话的写请求不得落库');
  });
});
