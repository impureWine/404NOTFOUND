/**
 * Alpha 冲刺 Day 5 P0 复测探针（安全 / 内容审核，T07）。
 *
 * 复测对象（PM 缺陷分诊表中的两个 P0）：
 *   D5-01 内部模型入口绕过外发授权：错误 Origin/CSRF、缺少 AI_PROCESS 仍可调用
 *   D5-02 同账号跨入口可读 AI 任务结果：DESKTOP 会话读取 WEB 任务
 *
 * 约定（重要）：
 * 1. 本文件的断言记录的是**当前缺陷签名**，不是"期望的正确行为"。
 *    例如断言错误 Origin 返回 200 且适配器被调用 1 次，表示"缺陷仍可复现"。
 * 2. 因此修复后本文件应当失败——这是有意的：修复者必须把对应断言改为期望值（403 / 404 / 0 次）。
 * 3. 每条用例通过 console 输出 [D5-xx] 观察记录，供复核表引用；不使用真实用户数据。
 * 4. 全部在本地 PGlite 与合成适配器上执行，不连接正式 PostgreSQL、不调用真实模型。
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createApp } from '../../src/app.js';
import { sessionCookie } from '../../src/http/request.js';
import { parseProfileKey } from '../../src/security/crypto.js';
import { AuthService } from '../../src/services/auth-service.js';
import { ConsentService } from '../../src/services/consent-service.js';
import { TaskService } from '../../src/services/task-service.js';
import { createTestDatabase } from '../helpers/database.js';
import { createSyntheticModelRequest } from '../fixtures/model-requests.js';

const ORIGIN = 'http://127.0.0.1:5173';
const KEY = parseProfileKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
const PASSWORD = 'synthetic:day5-password-only';

function stubModelAdapter() {
  const calls = [];
  return {
    calls,
    async respond(input) {
      calls.push(input?.request_id ?? 'unknown');
      return {
        contract_version: '1.1',
        request_id: input?.request_id ?? 'unknown',
        status: 'success',
        result: {
          content: 'synthetic:day5 合成回复',
          intent: 'COMPANION',
          suggested_action: 'STAY',
          citations: [],
          uncertainty: null,
        },
        model_info: { provider: 'synthetic-stub', model: 'synthetic', mock: true },
        usage: { input_tokens: 0, output_tokens: 0 },
        timing: { latency_ms: 0, attempts: 1 },
      };
    },
  };
}

async function withApi(callback) {
  const database = await createTestDatabase();
  const authService = new AuthService(database, { profileKey: KEY });
  const consentService = new ConsentService();
  const modelAdapter = stubModelAdapter();
  const taskService = new TaskService({ consentService, modelAdapter });
  const server = createApp({
    database,
    authService,
    consentService,
    taskService,
    modelAdapter,
    appOrigin: ORIGIN,
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await callback({
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      database,
      authService,
      modelAdapter,
      taskService,
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await database.close();
  }
}

async function context(baseUrl, cookie) {
  const response = await fetch(`${baseUrl}/api/auth/context`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: body.data.csrfToken };
}

function send(baseUrl, path, state, body) {
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

async function registerAndLogin(baseUrl, loginName) {
  const anonymous = await context(baseUrl);
  const registered = await send(baseUrl, '/api/auth/register', anonymous, {
    requestId: randomUUID(),
    loginName,
    password: PASSWORD,
    confirmPassword: PASSWORD,
  });
  assert.equal(registered.status, 201);
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: anonymous.cookie,
      Origin: ORIGIN,
      'X-CSRF-Token': anonymous.csrf,
    },
    body: JSON.stringify({ loginName, password: PASSWORD, target: 'PROFILE' }),
  });
  assert.equal(login.status, 200);
  return context(baseUrl, login.headers.get('set-cookie').split(';')[0]);
}

test('D5-01 内部模型入口：缺少内部令牌的匿名与已登录请求均被拦截', async () => {
  await withApi(async ({ baseUrl, modelAdapter }) => {
    const user = await registerAndLogin(baseUrl, 'synthetic_day5_internal');
    const body = createSyntheticModelRequest({ request_id: 'req-synthetic-d5-01' });
    const observation = {};

    // 1) 匿名调用缺少内部令牌，应在适配器调用前拒绝。
    const anonymous = await fetch(`${baseUrl}/internal/v1/model/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    observation.anonymous = { status: anonymous.status, callsAfter: modelAdapter.calls.length };
    assert.equal(anonymous.status, 403, '缺少内部令牌应返回 403');

    // 2) 有会话但 Origin 错误、且不带 CSRF。
    const callsBefore = modelAdapter.calls.length;
    const badOrigin = await fetch(`${baseUrl}/internal/v1/model/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: user.cookie,
        Origin: 'https://attacker.example',
      },
      body: JSON.stringify(body),
    });
    observation.badOrigin = {
      status: badOrigin.status,
      adapterCalls: modelAdapter.calls.length - callsBefore,
    };

    // 3) 有会话、Origin 正确，但不带 CSRF。
    const callsBeforeNoCsrf = modelAdapter.calls.length;
    const noCsrf = await fetch(`${baseUrl}/internal/v1/model/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: user.cookie, Origin: ORIGIN },
      body: JSON.stringify(body),
    });
    observation.noCsrf = {
      status: noCsrf.status,
      adapterCalls: modelAdapter.calls.length - callsBeforeNoCsrf,
    };

    // 4) 请求体完全不含 AI_PROCESS 许可字段（契约本身不接受许可）。
    const callsBeforeNoConsent = modelAdapter.calls.length;
    const noConsent = await fetch(`${baseUrl}/internal/v1/model/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: user.cookie,
        Origin: ORIGIN,
        'X-CSRF-Token': user.csrf,
      },
      body: JSON.stringify(body),
    });
    observation.noConsent = {
      status: noConsent.status,
      adapterCalls: modelAdapter.calls.length - callsBeforeNoConsent,
    };
    console.log('[D5-01]', JSON.stringify(observation));

    // 内部入口要求独立令牌；登录会话不能替代内部凭据。
    assert.equal(observation.badOrigin.status, 403);
    assert.equal(observation.badOrigin.adapterCalls, 0);
    assert.equal(observation.noCsrf.status, 403);
    assert.equal(observation.noCsrf.adapterCalls, 0);
    assert.equal(observation.noConsent.status, 403);
    assert.equal(observation.noConsent.adapterCalls, 0);
  });
});

test('D5-02 同账号跨入口：DESKTOP 会话可读并取消 WEB 的 AI 任务', async () => {
  await withApi(async ({ baseUrl, database, authService }) => {
    const user = await registerAndLogin(baseUrl, 'synthetic_day5_cross_entry');
    const accountId = (await database.query(
      'SELECT id FROM user_accounts WHERE login_identifier_normalized = $1',
      ['synthetic_day5_cross_entry'],
    )).rows[0].id;

    // WEB 入口：建会话 → 取 AI_PROCESS 许可 → 建 AI 任务
    const sessionResponse = await send(baseUrl, '/api/sessions', user, {
      requestId: randomUUID(),
      mode: 'LISTEN',
    });
    assert.equal(sessionResponse.status, 201);
    const session = (await sessionResponse.json()).data;
    const consentPayload = {
      sessionId: session.sessionId,
      activityId: session.activityId,
      sessionGeneration: session.sessionGeneration,
      activityGeneration: session.activityGeneration,
      mode: 'LISTEN',
      operation: 'REPLY',
      selectedText: 'synthetic:day5 跨入口复现用的合成文本',
      selectedContextIds: [],
    };
    const consentResponse = await send(baseUrl, '/api/consents', user, {
      requestId: randomUUID(),
      purpose: 'AI_PROCESS',
      operation: 'AGENT_TASK_CREATE',
      payload: consentPayload,
    });
    assert.equal(consentResponse.status, 201);
    const consentId = (await consentResponse.json()).data.consentId;

    const taskRequestId = randomUUID();
    const taskResponse = await send(baseUrl, '/api/agent/tasks', user, {
      requestId: taskRequestId,
      consentId,
      ...consentPayload,
    });
    assert.equal(taskResponse.status, 202);
    await new Promise((resolve) => setImmediate(resolve));

    const webRead = await fetch(`${baseUrl}/api/agent/tasks/${taskRequestId}`, {
      headers: { Cookie: user.cookie },
    });
    assert.equal(webRead.status, 200);
    const webTask = (await webRead.json()).data;

    // DESKTOP 入口：同账号、不同 entryPoint 的可信会话（服务端夹具，不是原生桌面登录）
    const desktopEntry = await database.query(
      "INSERT INTO entry_points (code) VALUES ('DESKTOP_SYNTHETIC_DAY5') ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code RETURNING id",
    );
    const issued = await authService.createContext(accountId, desktopEntry.rows[0].id);
    const desktop = {
      cookie: sessionCookie(issued.sessionToken).split(';')[0],
      csrf: issued.csrfToken,
    };

    const crossRead = await fetch(`${baseUrl}/api/agent/tasks/${taskRequestId}`, {
      headers: { Cookie: desktop.cookie },
    });
    const crossBody = await crossRead.json();
    const crossCancel = await send(baseUrl, `/api/agent/tasks/${taskRequestId}/cancel`, desktop, {
      requestId: randomUUID(),
    });

    const observation = {
      webSession: { status: webRead.status, taskStatus: webTask.status, hasResult: Boolean(webTask.result) },
      desktopCrossRead: {
        status: crossRead.status,
        hasResult: Boolean(crossBody?.data?.result),
        taskStatus: crossBody?.data?.status ?? null,
      },
      desktopCrossCancel: { status: crossCancel.status },
    };
    console.log('[D5-02]', JSON.stringify(observation));

    // 缺陷签名：跨入口读取与取消均返回 200，且可读到已完成的 result。
    assert.equal(observation.webSession.status, 200);
    assert.equal(observation.webSession.hasResult, true);
    assert.equal(observation.desktopCrossRead.status, 200, '跨入口读取未被拒绝（缺陷 D5-02）');
    assert.equal(observation.desktopCrossRead.hasResult, true, '跨入口可读到 result（缺陷 D5-02）');
    assert.equal(observation.desktopCrossCancel.status, 200, '跨入口取消未被拒绝（缺陷 D5-02）');
  });
});

test('D5-10 失效会话写请求：请求被拒绝但返回 403 而非 401（沿用 Day 4 观察）', async () => {
  await withApi(async ({ baseUrl }) => {
    const user = await registerAndLogin(baseUrl, 'synthetic_day5_revoked');
    const logout = await send(baseUrl, '/api/auth/logout', user, {});
    assert.equal(logout.status, 204);

    const stale = await send(baseUrl, '/api/agent/tasks/00000000-0000-4000-8000-000000000001', user, {
      requestId: randomUUID(),
    });
    const observation = { staleWriteStatus: stale.status };
    console.log('[D5-10]', JSON.stringify(observation));
    // 缺陷签名：应 401 AUTH_REQUIRED，当前 CSRF 先于认证 → 403。
    assert.equal(stale.status, 403, '失效会话写请求当前返回 403（缺陷 D5-10）');
  });
});
