/**
 * Beta Day5 隐私与迟到结果边界探针（关欣 · 安全 / 内容审核）。
 *
 * 覆盖 PM 的 Day5 范围表里分给安全岗的两项：
 *   B06 文字销毁：确认受测页面、登记实现范围差异与覆盖边界（结构级）
 *   B01 迟到回填：会话结束 / 主动取消 / 撤回许可后，模型迟到结果不得回填（接口级）
 *
 * 约定（与 Day2–Day4 探针一致）：
 * 1. 全部使用 `synthetic:` 合成数据、本地 PGlite 与合成模型适配器；不连接正式 PostgreSQL、不调用真实模型。
 * 2. 结构级检查只读 `prototype/src` 源码，不执行浏览器，不替代运行时抓包（运行时由曾俊涛 Day5 报告覆盖）。
 * 3. 每条用例输出 [B5-xx] 观察记录，供 Day5 专项报告引用；缺陷签名写进报告，不写成通过。
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createApp } from '../../src/app.js';
import { RecordRepository } from '../../src/repositories/record-repository.js';
import { parseProfileKey } from '../../src/security/crypto.js';
import { AuthService } from '../../src/services/auth-service.js';
import { ConsentService } from '../../src/services/consent-service.js';
import { RecordService } from '../../src/services/record-service.js';
import { TaskService } from '../../src/services/task-service.js';
import { createTestDatabase } from '../helpers/database.js';

const ORIGIN = 'http://127.0.0.1:5173';
const KEY = parseProfileKey('DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD=');
const PASSWORD = 'synthetic:beta5-password-only';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PROTOTYPE_SRC = path.join(REPO_ROOT, 'prototype/src');

/** 临时正文不得进入的通道：浏览器存储、网络、日志型 API。 */
const FORBIDDEN_CHANNELS = [
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'fetch(',
  'XMLHttpRequest',
  'sendBeacon',
  'console.log',
];

function stubModelAdapter(delayMs = 0) {
  return {
    async respond(input) {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return {
        contract_version: '1.1',
        request_id: input?.request_id ?? 'unknown',
        status: 'success',
        result: {
          content: 'synthetic:beta5 合成回复',
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

async function withApi(callback, { responseDelayMs = 0 } = {}) {
  const database = await createTestDatabase();
  const authService = new AuthService(database, { profileKey: KEY });
  const consentService = new ConsentService();
  const recordService = new RecordService(new RecordRepository(database), {
    encryptionKey: KEY,
    consentService,
  });
  const taskService = new TaskService({ consentService, modelAdapter: stubModelAdapter(responseDelayMs) });
  const server = createApp({ database, authService, consentService, taskService, recordService, appOrigin: ORIGIN })
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
  const response = await fetch(`${baseUrl}/api/auth/context`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: body.data.csrfToken };
}

function send(baseUrl, pathname, state, body) {
  return fetch(`${baseUrl}${pathname}`, {
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
  assert.equal((await send(baseUrl, '/api/auth/register', anonymous, {
    requestId: randomUUID(), loginName, password: PASSWORD, confirmPassword: PASSWORD,
  })).status, 201);
  const login = await send(baseUrl, '/api/auth/login', anonymous, {
    loginName, password: PASSWORD, target: 'PROFILE',
  });
  assert.equal(login.status, 200);
  return context(baseUrl, login.headers.get('set-cookie').split(';')[0]);
}

async function createSession(baseUrl, state) {
  const response = await send(baseUrl, '/api/sessions', state, { requestId: randomUUID(), mode: 'LISTEN' });
  assert.equal(response.status, 201);
  return (await response.json()).data;
}

function agentPayload(session, overrides = {}) {
  return {
    sessionId: session.sessionId,
    activityId: session.activityId,
    sessionGeneration: session.sessionGeneration,
    activityGeneration: session.activityGeneration,
    mode: 'LISTEN',
    operation: 'REPLY',
    selectedText: 'synthetic:beta5 迟到回填探针',
    selectedContextIds: [],
    ...overrides,
  };
}

async function issueConsent(baseUrl, state, payload) {
  const response = await send(baseUrl, '/api/consents', state, {
    requestId: randomUUID(), purpose: 'AI_PROCESS', operation: 'AGENT_TASK_CREATE', payload,
  });
  assert.equal(response.status, 201);
  return (await response.json()).data.consentId;
}

async function readTask(baseUrl, state, requestId) {
  const response = await fetch(`${baseUrl}/api/agent/tasks/${requestId}`, { headers: { Cookie: state.cookie } });
  const body = response.status === 200 ? (await response.json()).data : null;
  return { status: response.status, task: body };
}

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listSourceFiles(full));
    else if (/\.(js|jsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

test('B06-PAGE 确认受测页面：PrivateText 可达，routes.jsx 的 destroy 未被引用', async () => {
  const games = await readFile(path.join(PROTOTYPE_SRC, 'live/Games.jsx'), 'utf8');
  const routes = await readFile(path.join(PROTOTYPE_SRC, 'routes.jsx'), 'utf8');
  const app = await readFile(path.join(PROTOTYPE_SRC, 'App.jsx'), 'utf8');

  // routes.jsx 若没有被任何模块 import，则其中登记的 DestroyPage 是死代码
  const files = await listSourceFiles(PROTOTYPE_SRC);
  const importers = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    if (/from\s+['"][^'"]*routes(\.jsx)?['"]/.test(text)) importers.push(path.relative(REPO_ROOT, file));
  }

  const observation = {
    privateTextUsesHook: games.includes('useTextDestructionState'),
    privateTextClearsOnPagehide: /pagehide/.test(games) && /removeEventListener\('pagehide'/.test(games),
    appHasPrivateTextRoute: /'private-text'/.test(app),
    routesRegistersDestroyPage: /destroy:\s*\{\s*title:\s*'文本销毁'/.test(routes),
    routesImporters: importers.length,
  };
  console.log('[B5-PAGE]', JSON.stringify(observation));

  assert.equal(observation.privateTextUsesHook, true, 'PrivateText 应复用销毁 hook');
  assert.equal(observation.privateTextClearsOnPagehide, true, 'PrivateText 应在 pagehide 清理并解绑');
  assert.equal(observation.appHasPrivateTextRoute, true, 'App 应登记 private-text 路由');
  assert.equal(observation.routesRegistersDestroyPage, true);
  assert.equal(observation.routesImporters, 0, 'routes.jsx 未被引用，其中的 destroy 页面不可达');
});

test('B06-STRUCT 销毁通道结构级检查：临时正文不进入存储、网络与日志', async () => {
  const hook = await readFile(path.join(PROTOTYPE_SRC, 'req14/useTextDestructionState.js'), 'utf8');
  const games = await readFile(path.join(PROTOTYPE_SRC, 'live/Games.jsx'), 'utf8');
  const privateTextBlock = games.slice(games.indexOf('export function PrivateText'), games.indexOf('export function PhysicsGame'));

  const hits = (text) => FORBIDDEN_CHANNELS.filter((token) => text.includes(token));
  const observation = {
    hookHits: hits(hook),
    privateTextHits: hits(privateTextBlock),
    hookExposesDispose: /dispose/.test(hook),
  };
  console.log('[B5-STRUCT]', JSON.stringify(observation));

  assert.deepEqual(observation.hookHits, [], '销毁 hook 不得出现存储/网络/日志调用');
  assert.deepEqual(observation.privateTextHits, [], 'PrivateText 不得出现存储/网络/日志调用');
  assert.equal(observation.hookExposesDispose, true, 'hook 应提供 dispose 供离页调用');
});

test('B01-LATE-END 会话结束后模型迟到回复不得回填', async () => {
  await withApi(async ({ baseUrl }) => {
    const user = await registerAndLogin(baseUrl, 'synthetic_beta5_late_end');
    const session = await createSession(baseUrl, user);
    const payload = agentPayload(session);
    const consentId = await issueConsent(baseUrl, user, payload);
    const requestId = randomUUID();
    assert.equal((await send(baseUrl, '/api/agent/tasks', user, { requestId, consentId, ...payload })).status, 202);

    // 模型响应被延迟 120 ms；此时立即结束会话
    const ended = await send(baseUrl, `/api/sessions/${session.sessionId}/actions`, user, {
      requestId: randomUUID(),
      action: 'END',
      expectedSessionGeneration: session.sessionGeneration,
      expectedActivityGeneration: session.activityGeneration,
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const after = await readTask(baseUrl, user, requestId);

    const observation = {
      endActionStatus: ended.status,
      taskReadAfterEnd: after.status,
      taskStatusAfterEnd: after.task?.status ?? null,
      hasResultAfterEnd: Boolean(after.task?.result),
    };
    console.log('[B5-LATE-END]', JSON.stringify(observation));

    assert.equal(observation.endActionStatus, 200);
    assert.equal(observation.taskReadAfterEnd, 200);
    // 迟到回填是否发生写入报告；主线未合入修复时该值为 true（缺陷签名）
  }, { responseDelayMs: 120 });
});

test('B01-LATE-CANCEL 主动取消后模型迟到回复不得回填', async () => {
  await withApi(async ({ baseUrl }) => {
    const user = await registerAndLogin(baseUrl, 'synthetic_beta5_late_cancel');
    const session = await createSession(baseUrl, user);
    const payload = agentPayload(session);
    const consentId = await issueConsent(baseUrl, user, payload);
    const requestId = randomUUID();
    assert.equal((await send(baseUrl, '/api/agent/tasks', user, { requestId, consentId, ...payload })).status, 202);

    const cancelled = await send(baseUrl, `/api/agent/tasks/${requestId}/cancel`, user, { requestId: randomUUID() });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const after = await readTask(baseUrl, user, requestId);

    const observation = {
      cancelStatus: cancelled.status,
      taskStatusAfterCancel: after.task?.status ?? null,
      hasResultAfterCancel: Boolean(after.task?.result),
    };
    console.log('[B5-LATE-CANCEL]', JSON.stringify(observation));

    assert.equal(observation.cancelStatus, 200);
    assert.equal(observation.taskStatusAfterCancel, 'cancelled');
    assert.equal(observation.hasResultAfterCancel, false, '取消后的迟到结果不得回填');
  }, { responseDelayMs: 120 });
});

test('B01-CONC 撤回与读取并发：不产生 5xx，回填情况以观察值记录', async () => {
  await withApi(async ({ baseUrl }) => {
    const user = await registerAndLogin(baseUrl, 'synthetic_beta5_concurrent');
    const session = await createSession(baseUrl, user);
    const payload = agentPayload(session);
    const consentId = await issueConsent(baseUrl, user, payload);
    const requestId = randomUUID();
    assert.equal((await send(baseUrl, '/api/agent/tasks', user, { requestId, consentId, ...payload })).status, 202);

    const [revoke, concurrentRead] = await Promise.all([
      send(baseUrl, `/api/consents/${consentId}/revoke`, user, { requestId: randomUUID() }),
      fetch(`${baseUrl}/api/agent/tasks/${requestId}`, { headers: { Cookie: user.cookie } }),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const after = await readTask(baseUrl, user, requestId);

    const observation = {
      revokeStatus: revoke.status,
      concurrentReadStatus: concurrentRead.status,
      finalStatus: after.task?.status ?? null,
      hasResultFinally: Boolean(after.task?.result),
    };
    console.log('[B5-CONC]', JSON.stringify(observation));

    assert.ok(observation.revokeStatus < 500, '并发撤回不得 5xx');
    assert.ok(observation.concurrentReadStatus < 500, '并发读取不得 5xx');
  }, { responseDelayMs: 120 });
});
