/**
 * Beta Day2 授权专项探针（关欣 · 安全 / 内容审核）。
 *
 * 覆盖：
 *   P0-03 用途许可不可互换（三条反例 + 两条正例）
 *   E-04  跨账号借用 consentId
 *   T-03  结束后读取已完成任务结果、重来（RESTART）后的旧结果
 *
 * 约定：
 * 1. 反例断言"应被拒绝"的期望值（403）；正例断言成功（200/201/202）。
 * 2. 全部使用 synthetic: 合成数据与合成模型适配器；不连接正式数据库、不调用真实模型。
 * 3. 每条用例输出 [B2-xx] 观察记录，供 Day2 安全专项报告引用。
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';

import { createApp } from '../../src/app.js';
import { RecordRepository } from '../../src/repositories/record-repository.js';
import { AuthService } from '../../src/services/auth-service.js';
import { ConsentService } from '../../src/services/consent-service.js';
import { RecordService } from '../../src/services/record-service.js';
import { TaskService } from '../../src/services/task-service.js';
import { createTestDatabase } from '../helpers/database.js';

const ORIGIN = 'http://127.0.0.1:5173';
const KEY = createHash('sha256').update('synthetic:beta-day2-key').digest();
const PASSWORD = 'synthetic:beta2-password-only';

function stubModelAdapter() {
  return {
    async respond(input) {
      return {
        contract_version: '1.1',
        request_id: input?.request_id ?? 'unknown',
        status: 'success',
        result: {
          content: 'synthetic:beta2 合成回复',
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
  const recordService = new RecordService(new RecordRepository(database), {
    encryptionKey: KEY,
    consentService,
  });
  const server = createApp({ database, authService, consentService, taskService, recordService, appOrigin: ORIGIN })
    .listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await callback({ baseUrl: `http://127.0.0.1:${server.address().port}`, database, authService });
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
  const login = await send(baseUrl, '/api/auth/login', anonymous, {
    loginName,
    password: PASSWORD,
    target: 'PROFILE',
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
    selectedText: 'synthetic:beta2 授权探针用文本',
    selectedContextIds: [],
    ...overrides,
  };
}

async function issueConsent(baseUrl, state, purpose, operation, payload) {
  const response = await send(baseUrl, '/api/consents', state, {
    requestId: randomUUID(),
    purpose,
    operation,
    payload,
  });
  assert.equal(response.status, 201, `许可签发失败: ${response.status}`);
  return (await response.json()).data.consentId;
}

test('P0-03 用途许可不可互换：三条反例 + 两条正例', async () => {
  await withApi(async ({ baseUrl }) => {
    const user = await registerAndLogin(baseUrl, 'synthetic_beta2_permit');
    const session = await createSession(baseUrl, user);
    const payload = agentPayload(session);
    const recordPayload = { kind: 'CONVERSATION', content: { title: 'synthetic:beta2 标题', body: 'synthetic:beta2 正文' } };
    const observation = {};

    // 反例 A：用 SAVE/RECORD_CREATE 许可去建 AI 任务
    const saveConsent = await issueConsent(baseUrl, user, 'SAVE', 'RECORD_CREATE', recordPayload);
    const swapA = await send(baseUrl, '/api/agent/tasks', user, {
      requestId: randomUUID(), consentId: saveConsent, ...payload,
    });
    observation.saveConsentForAiTask = swapA.status;

    // 反例 B：用 AI_PROCESS/AGENT_TASK_CREATE 许可去保存记录
    const aiConsent = await issueConsent(baseUrl, user, 'AI_PROCESS', 'AGENT_TASK_CREATE', payload);
    const swapB = await send(baseUrl, '/api/records', user, {
      requestId: randomUUID(), consentId: aiConsent, ...recordPayload,
    });
    observation.aiConsentForRecord = swapB.status;

    // 反例 C：许可绑定载荷摘要——正文被改后复用同一 consentId
    const changed = agentPayload(session, { selectedText: 'synthetic:beta2 被替换的文本' });
    const swapC = await send(baseUrl, '/api/agent/tasks', user, {
      requestId: randomUUID(), consentId: aiConsent, ...changed,
    });
    observation.consentPayloadMismatch = swapC.status;

    // 正例 1：用途匹配的 AI 任务可创建
    const accepted = await send(baseUrl, '/api/agent/tasks', user, {
      requestId: randomUUID(), consentId: aiConsent, ...payload,
    });
    observation.aiTaskAccepted = accepted.status;

    // 正例 2：用途匹配的记录可保存
    const saved = await send(baseUrl, '/api/records', user, {
      requestId: randomUUID(), consentId: saveConsent, ...recordPayload,
    });
    observation.recordSaved = saved.status;

    console.log('[B2-P0-03]', JSON.stringify(observation));

    assert.equal(observation.saveConsentForAiTask, 403, 'SAVE 许可不得用于 AI 任务');
    assert.equal(observation.aiConsentForRecord, 403, 'AI_PROCESS 许可不得用于保存记录');
    assert.equal(observation.consentPayloadMismatch, 403, '载荷变化后许可应失效');
    assert.equal(observation.aiTaskAccepted, 202, '用途匹配时应可创建 AI 任务');
    assert.equal(observation.recordSaved, 201, '用途匹配时应可保存记录');
  });
});

test('E-04 跨账号借用 consentId 应被拒绝', async () => {
  await withApi(async ({ baseUrl }) => {
    const alice = await registerAndLogin(baseUrl, 'synthetic_beta2_alice');
    const bob = await registerAndLogin(baseUrl, 'synthetic_beta2_bob');
    const aliceSession = await createSession(baseUrl, alice);
    const payload = agentPayload(aliceSession);
    const aliceConsent = await issueConsent(baseUrl, alice, 'AI_PROCESS', 'AGENT_TASK_CREATE', payload);

    // Bob 用自己的会话载荷 + Alice 的 consentId
    const bobSession = await createSession(baseUrl, bob);
    const bobPayload = agentPayload(bobSession);
    const borrowed = await send(baseUrl, '/api/agent/tasks', bob, {
      requestId: randomUUID(), consentId: aliceConsent, ...bobPayload,
    });

    const observation = { borrowedConsentStatus: borrowed.status };
    console.log('[B2-E-04]', JSON.stringify(observation));
    assert.equal(borrowed.status, 403, '他人许可不得跨账号使用');
  });
});

test('T-03 结束后读取已完成任务、重来（RESTART）后的旧结果', async () => {
  await withApi(async ({ baseUrl }) => {
    const user = await registerAndLogin(baseUrl, 'synthetic_beta2_lifecycle');
    const session = await createSession(baseUrl, user);
    const payload = agentPayload(session);
    const consentA = await issueConsent(baseUrl, user, 'AI_PROCESS', 'AGENT_TASK_CREATE', payload);
    const requestId = randomUUID();
    const accepted = await send(baseUrl, '/api/agent/tasks', user, {
      requestId, consentId: consentA, ...payload,
    });
    assert.equal(accepted.status, 202);
    await new Promise((resolve) => setImmediate(resolve));

    const done = await fetch(`${baseUrl}/api/agent/tasks/${requestId}`, { headers: { Cookie: user.cookie } });
    const doneBody = (await done.json()).data;

    // 结束会话后读取同一任务
    const ended = await send(baseUrl, `/api/sessions/${session.sessionId}/actions`, user, {
      requestId: randomUUID(),
      action: 'END',
      expectedSessionGeneration: session.sessionGeneration,
      expectedActivityGeneration: session.activityGeneration,
    });
    const afterEnd = await fetch(`${baseUrl}/api/agent/tasks/${requestId}`, { headers: { Cookie: user.cookie } });
    const afterEndBody = afterEnd.status === 200 ? (await afterEnd.json()).data : null;

    const observation = {
      completedStatus: done.status,
      completedTaskStatus: doneBody?.status ?? null,
      hasResultBeforeEnd: Boolean(doneBody?.result),
      endActionStatus: ended.status,
      afterEndReadStatus: afterEnd.status,
      hasResultAfterEnd: Boolean(afterEndBody?.result),
    };
    console.log('[B2-T-03]', JSON.stringify(observation));

    assert.equal(observation.completedStatus, 200);
    assert.equal(observation.hasResultBeforeEnd, true);
    assert.equal(observation.endActionStatus, 200);
    // 记录观察值，判定写入 Day2 报告：结束后是否仍可读，以实测为准
    assert.ok([200, 404, 403].includes(observation.afterEndReadStatus));
  });
});

test('B2-R 撤回许可：撤销后不可再用，已完成结果是否失效以实测记录', async () => {
  await withApi(async ({ baseUrl }) => {
    const user = await registerAndLogin(baseUrl, 'synthetic_beta2_revoke');
    const session = await createSession(baseUrl, user);
    const payload = agentPayload(session);
    const consentId = await issueConsent(baseUrl, user, 'AI_PROCESS', 'AGENT_TASK_CREATE', payload);

    // 先用该许可完成一个任务
    const requestId = randomUUID();
    const accepted = await send(baseUrl, '/api/agent/tasks', user, {
      requestId, consentId, ...payload,
    });
    assert.equal(accepted.status, 202);
    await new Promise((resolve) => setImmediate(resolve));

    // 撤销许可
    const revoked = await send(baseUrl, `/api/consents/${consentId}/revoke`, user, { requestId: randomUUID() });
    assert.equal(revoked.status, 200);

    // ① 撤销后复用同一许可建新任务
    const reuse = await send(baseUrl, '/api/agent/tasks', user, {
      requestId: randomUUID(), consentId, ...payload,
    });
    // ② 撤销前已完成的结果是否仍可读
    const reread = await fetch(`${baseUrl}/api/agent/tasks/${requestId}`, { headers: { Cookie: user.cookie } });
    const rereadBody = reread.status === 200 ? (await reread.json()).data : null;

    const observation = {
      reuseAfterRevoke: reuse.status,
      rereadAfterRevoke: reread.status,
      hasResultAfterRevoke: Boolean(rereadBody?.result),
    };
    console.log('[B2-REVOKE]', JSON.stringify(observation));

    assert.equal(observation.reuseAfterRevoke, 403, '已撤销许可不得继续使用');
    assert.ok([200, 404].includes(observation.rereadAfterRevoke));
  });
});

test('B2-RESTART 重来后读取上一轮任务结果', async () => {
  await withApi(async ({ baseUrl }) => {
    const user = await registerAndLogin(baseUrl, 'synthetic_beta2_restart');
    const session = await createSession(baseUrl, user);
    const payload = agentPayload(session);
    const consentId = await issueConsent(baseUrl, user, 'AI_PROCESS', 'AGENT_TASK_CREATE', payload);
    const requestId = randomUUID();
    assert.equal((await send(baseUrl, '/api/agent/tasks', user, {
      requestId, consentId, ...payload,
    })).status, 202);
    await new Promise((resolve) => setImmediate(resolve));

    const restarted = await send(baseUrl, `/api/sessions/${session.sessionId}/actions`, user, {
      requestId: randomUUID(),
      action: 'RESTART',
      expectedSessionGeneration: session.sessionGeneration,
      expectedActivityGeneration: session.activityGeneration,
    });
    const afterRestart = await fetch(`${baseUrl}/api/agent/tasks/${requestId}`, { headers: { Cookie: user.cookie } });
    const body = afterRestart.status === 200 ? (await afterRestart.json()).data : null;

    const observation = {
      restartStatus: restarted.status,
      afterRestartReadStatus: afterRestart.status,
      hasResultAfterRestart: Boolean(body?.result),
    };
    console.log('[B2-RESTART]', JSON.stringify(observation));
    assert.equal(observation.restartStatus, 200);
    assert.ok([200, 404].includes(observation.afterRestartReadStatus));
  });
});

test('B2-RATE 连续创建任务的限流表现（未实现则如实记录）', async () => {
  await withApi(async ({ baseUrl }) => {
    const user = await registerAndLogin(baseUrl, 'synthetic_beta2_rate');
    const session = await createSession(baseUrl, user);
    const payload = agentPayload(session);
    const statuses = [];
    for (let i = 0; i < 12; i += 1) {
      const consentId = await issueConsent(baseUrl, user, 'AI_PROCESS', 'AGENT_TASK_CREATE', payload);
      const response = await send(baseUrl, '/api/agent/tasks', user, {
        requestId: randomUUID(), consentId, ...payload,
      });
      statuses.push(response.status);
    }
    const observation = {
      statuses,
      limited: statuses.filter((status) => status === 429).length,
    };
    console.log('[B2-RATE]', JSON.stringify(observation));
    assert.ok(statuses.every((status) => status === 202 || status === 429), '只应出现 202 或 429');
  });
});

test('B2-ERR 错误脱敏与鉴权边界回归', async () => {
  await withApi(async ({ baseUrl }) => {
    const user = await registerAndLogin(baseUrl, 'synthetic_beta2_errors');

    // 非法 JSON → 400 INVALID_INPUT
    const malformed = await fetch(`${baseUrl}/api/agent/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: user.cookie,
        Origin: ORIGIN,
        'X-CSRF-Token': user.csrf,
      },
      body: '{',
    });
    const malformedBody = await malformed.json().catch(() => ({}));

    // 未知路径 → 404
    const unknown = await fetch(`${baseUrl}/api/not-a-route`, { headers: { Cookie: user.cookie } });

    // 无会话写请求 → 401
    const anonymous = await fetch(`${baseUrl}/api/agent/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ requestId: randomUUID() }),
    });

    const observation = {
      malformedStatus: malformed.status,
      malformedCode: malformedBody?.error?.code ?? null,
      malformedLeaksStack: JSON.stringify(malformedBody).includes('at '),
      unknownStatus: unknown.status,
      anonymousStatus: anonymous.status,
    };
    console.log('[B2-ERR]', JSON.stringify(observation));

    assert.equal(observation.malformedStatus, 400);
    assert.equal(observation.malformedCode, 'INVALID_INPUT');
    assert.equal(observation.malformedLeaksStack, false, '错误响应不得包含堆栈');
    assert.equal(observation.unknownStatus, 404);
    // 主线未合并 P0-02 修复时，无会话写请求会被 CSRF 先拦成 403；合并后应为 401\n    assert.ok([401, 403].includes(observation.anonymousStatus), '无会话写请求必须被拒绝');
  });
});
