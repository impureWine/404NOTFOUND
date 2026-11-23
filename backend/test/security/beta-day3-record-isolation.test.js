/**
 * Beta Day3 记录隔离与清除专项探针（关欣 · 安全 / 内容审核）。
 *
 * 覆盖：
 *   C-02 寄存（DEPOSIT）正文时序：未到期不可读、不可取回；取回后才解密
 *   C-03 记录与寄存的账号 / 入口隔离
 *   C-04 两段式清除、删除台账（deletion_jobs / deletion_targets / deletion_outbox）与幂等
 *   B3-REF  清除后旧引用：AI 任务引用过的记录被清除后不得继续持有结果
 *   B3-CONC 并发清除：同一记录两份确认并发生效时只能成功一次
 *
 * 约定（与 beta-day2-authz-matrix.test.js 一致）：
 * 1. 全部使用 `synthetic:` 合成数据、本地 PGlite 与合成模型适配器；不连接正式 PostgreSQL、不调用真实模型。
 * 2. 每条用例输出 [B3-xx] 观察记录，供 Day3 记录隔离与清除专项报告引用。
 * 3. 硬断言只写"必须成立"的规则；当前已知缺口按实测取值断言，结论以报告为准，不把观察写成通过。
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createApp } from '../../src/app.js';
import { sessionCookie } from '../../src/http/request.js';
import { RecordRepository } from '../../src/repositories/record-repository.js';
import { parseProfileKey } from '../../src/security/crypto.js';
import { AuthService } from '../../src/services/auth-service.js';
import { ConsentService } from '../../src/services/consent-service.js';
import { RecordService } from '../../src/services/record-service.js';
import { TaskService } from '../../src/services/task-service.js';
import { createTestDatabase } from '../helpers/database.js';

const ORIGIN = 'http://127.0.0.1:5173';
const KEY = parseProfileKey('BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=');
const PASSWORD = 'synthetic:beta3-password-only';
const CONVERSATION_BODY = 'synthetic:beta3 会话私密正文';
const DEPOSIT_BODY = 'synthetic:beta3 寄存正文';

function stubModelAdapter(delayMs = 0) {
  return {
    async respond(input) {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return {
        contract_version: '1.1',
        request_id: input?.request_id ?? 'unknown',
        status: 'success',
        result: {
          content: 'synthetic:beta3 合成回复',
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
  taskService.resolveObject = (context, recordId, version) => recordService.resolveObject(context, recordId, version);
  taskService.resolveSelectedContext = (context, ids) => recordService.resolveContext(context, ids);
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

/** 同账号的第二个入口（服务端夹具，非原生桌面登录）：与 day4-destroy-and-clearing.test.js 的 D4-03 一致。 */
async function desktopSession(baseUrl, database, authService, loginName) {
  const accountId = (await database.query(
    'SELECT id FROM user_accounts WHERE login_identifier_normalized = $1',
    [loginName],
  )).rows[0].id;
  const entry = await database.query(
    "INSERT INTO entry_points (code) VALUES ('DESKTOP_SYNTHETIC_BETA3') ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code RETURNING id",
  );
  const issued = await authService.createContext(accountId);
  await database.query('UPDATE login_sessions SET entry_point_id = $1 WHERE id = $2', [
    entry.rows[0].id,
    issued.sessionId,
  ]);
  return { cookie: sessionCookie(issued.sessionToken).split(';')[0], csrf: issued.csrfToken };
}

async function createRecord(baseUrl, state, payload) {
  const consent = await send(baseUrl, '/api/consents', state, {
    requestId: randomUUID(),
    purpose: 'SAVE',
    operation: 'RECORD_CREATE',
    payload,
  });
  assert.equal(consent.status, 201, `签署保存许可失败: ${consent.status}`);
  const created = await send(baseUrl, '/api/records', state, {
    requestId: randomUUID(),
    consentId: (await consent.json()).data.consentId,
    ...payload,
  });
  assert.equal(created.status, 201, `保存记录失败: ${created.status}`);
  return (await created.json()).data;
}

const conversationPayload = () => ({
  kind: 'CONVERSATION',
  content: { title: 'synthetic:beta3 会话标题', body: CONVERSATION_BODY },
});

function depositPayload(reopenAt) {
  return {
    kind: 'DEPOSIT',
    content: { title: 'synthetic:beta3 寄存标题', body: DEPOSIT_BODY, reopenAt },
  };
}

async function clearRecord(baseUrl, state, record) {
  const confirmation = await send(baseUrl, `/api/records/${record.id}/clear-confirmations`, state, {
    requestId: randomUUID(),
    expectedVersion: record.version,
  });
  assert.equal(confirmation.status, 201, `签发清除确认失败: ${confirmation.status}`);
  const confirmationId = (await confirmation.json()).data.confirmationId;
  const cleared = await send(baseUrl, `/api/records/${record.id}/clear`, state, {
    requestId: randomUUID(),
    expectedVersion: record.version,
    confirmationId,
  });
  return { confirmationId, cleared };
}

async function createSession(baseUrl, state) {
  const response = await send(baseUrl, '/api/sessions', state, { requestId: randomUUID(), mode: 'LISTEN' });
  assert.equal(response.status, 201);
  return (await response.json()).data;
}

test('C-02 寄存正文时序：未到期不可读不可取回，取回后才解密', async () => {
  await withApi(async ({ baseUrl, database }) => {
    const user = await registerAndLogin(baseUrl, 'synthetic_beta3_deposit');
    const reopenAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const record = await createRecord(baseUrl, user, depositPayload(reopenAt));
    const observation = { recordId: record.id, reopenAt, storedState: null };

    // ① 未到期：详情不出现正文，寄存接口只给状态
    const detail = await fetch(`${baseUrl}/api/records/${record.id}`, { headers: { Cookie: user.cookie } });
    const detailBody = await detail.json();
    observation.detailStatus = detail.status;
    observation.detailLeaksBody = JSON.stringify(detailBody).includes(DEPOSIT_BODY);

    const stored = await fetch(`${baseUrl}/api/records/${record.id}/deposit`, { headers: { Cookie: user.cookie } });
    const storedBody = (await stored.json()).data;
    observation.storedState = storedBody.state;
    observation.storedBodyIsNull = storedBody.body === null;

    // ② 未到期不得提前取回
    const early = await send(baseUrl, `/api/records/${record.id}/deposit/retrieve`, user, {
      requestId: randomUUID(),
      expectedVersion: storedBody.version,
    });
    observation.earlyRetrieveStatus = early.status;

    // ③ 到期（夹具把 reopen_at 提前）后状态转 AVAILABLE，仍不给正文
    await database.query("UPDATE worry_deposits SET reopen_at = now() - interval '1 minute' WHERE saved_record_id = $1", [record.id]);
    const available = await fetch(`${baseUrl}/api/records/${record.id}/deposit`, { headers: { Cookie: user.cookie } });
    const availableBody = (await available.json()).data;
    observation.availableState = availableBody.state;
    observation.availableBodyIsNull = availableBody.body === null;

    // ④ 取回后才解密
    const retrieved = await send(baseUrl, `/api/records/${record.id}/deposit/retrieve`, user, {
      requestId: randomUUID(),
      expectedVersion: availableBody.version,
    });
    const retrievedBody = (await retrieved.json()).data;
    observation.retrieveStatus = retrieved.status;
    observation.retrievedState = retrievedBody?.state ?? null;
    observation.retrievedBodyMatches = retrievedBody?.body === DEPOSIT_BODY;

    // ⑤ 取回后详情仍然不出现寄存正文（正文只在取回响应里给一次）
    const detailAfter = await fetch(`${baseUrl}/api/records/${record.id}`, { headers: { Cookie: user.cookie } });
    observation.detailAfterRetrieveLeaksBody = JSON.stringify(await detailAfter.json()).includes(DEPOSIT_BODY);

    console.log('[B3-C02]', JSON.stringify(observation));

    assert.equal(observation.detailStatus, 200);
    assert.equal(observation.detailLeaksBody, false, '寄存未取回时详情不得出现正文');
    assert.equal(observation.storedState, 'STORED');
    assert.equal(observation.storedBodyIsNull, true, '未到期时寄存接口不得返回正文');
    assert.equal(observation.earlyRetrieveStatus, 409, '未到期不得提前取回');
    assert.equal(observation.availableState, 'AVAILABLE');
    assert.equal(observation.availableBodyIsNull, true, '到期但未取回时仍不得返回正文');
    assert.equal(observation.retrieveStatus, 200);
    assert.equal(observation.retrievedState, 'RETRIEVED');
    assert.equal(observation.retrievedBodyMatches, true, '显式取回后才解密正文');
    assert.equal(observation.detailAfterRetrieveLeaksBody, false, '取回后详情不得顺带回显寄存正文');
  });
});

test('C-03 记录与寄存的账号 / 入口隔离', async () => {
  await withApi(async ({ baseUrl, database, authService }) => {
    const alice = await registerAndLogin(baseUrl, 'synthetic_beta3_alice');
    const bob = await registerAndLogin(baseUrl, 'synthetic_beta3_bob');
    const record = await createRecord(baseUrl, alice, conversationPayload());
    const deposit = await createRecord(baseUrl, alice, depositPayload(new Date(Date.now() + 60 * 60 * 1000).toISOString()));
    const desktop = await desktopSession(baseUrl, database, authService, 'synthetic_beta3_alice');

    const observation = {};

    // ① 他人读记录 / 读寄存 / 取回寄存
    observation.bobRecordDetail = (await fetch(`${baseUrl}/api/records/${record.id}`, { headers: { Cookie: bob.cookie } })).status;
    observation.bobDepositDetail = (await fetch(`${baseUrl}/api/records/${deposit.id}/deposit`, { headers: { Cookie: bob.cookie } })).status;
    observation.bobDepositRetrieve = (await send(baseUrl, `/api/records/${deposit.id}/deposit/retrieve`, bob, {
      requestId: randomUUID(),
      expectedVersion: deposit.version,
    })).status;

    // ② 同账号异入口（DESKTOP）读记录 / 读寄存 / 取回寄存
    observation.desktopRecordDetail = (await fetch(`${baseUrl}/api/records/${record.id}`, { headers: { Cookie: desktop.cookie } })).status;
    observation.desktopDepositDetail = (await fetch(`${baseUrl}/api/records/${deposit.id}/deposit`, { headers: { Cookie: desktop.cookie } })).status;
    observation.desktopDepositRetrieve = (await send(baseUrl, `/api/records/${deposit.id}/deposit/retrieve`, desktop, {
      requestId: randomUUID(),
      expectedVersion: deposit.version,
    })).status;

    // ③ 他人列表里不得出现 Alice 的记录
    const bobList = await (await fetch(`${baseUrl}/api/records`, { headers: { Cookie: bob.cookie } })).json();
    observation.bobListCount = bobList.data.items.length;

    console.log('[B3-C03]', JSON.stringify(observation));

    assert.equal(observation.bobRecordDetail, 404, '他人读记录必须 404');
    assert.equal(observation.bobDepositDetail, 404, '他人读寄存必须 404');
    assert.equal(observation.bobDepositRetrieve, 404, '他人不得取回他人寄存');
    assert.equal(observation.desktopRecordDetail, 404, '异入口读记录必须 404');
    assert.equal(observation.desktopDepositDetail, 404, '异入口读寄存必须 404');
    assert.equal(observation.desktopDepositRetrieve, 404, '异入口不得取回本入口寄存');
    assert.equal(observation.bobListCount, 0, '他人列表不得出现他人记录');
  });
});

test('C-04 两段式清除、删除台账与重复请求幂等', async () => {
  await withApi(async ({ baseUrl, database }) => {
    const user = await registerAndLogin(baseUrl, 'synthetic_beta3_clear');
    const record = await createRecord(baseUrl, user, conversationPayload());
    const observation = { recordId: record.id };

    // ① 跳过确认直接清除 → 契约拒绝，记录仍在
    const skip = await send(baseUrl, `/api/records/${record.id}/clear`, user, {
      requestId: randomUUID(),
      expectedVersion: record.version,
    });
    observation.skipConfirmationStatus = skip.status;
    observation.stillReadableAfterSkip = (await fetch(`${baseUrl}/api/records/${record.id}`, {
      headers: { Cookie: user.cookie },
    })).status;

    // ② 用不存在的确认号清除 → 冲突
    const forged = await send(baseUrl, `/api/records/${record.id}/clear`, user, {
      requestId: randomUUID(),
      expectedVersion: record.version,
      confirmationId: randomUUID(),
    });
    observation.forgedConfirmationStatus = forged.status;

    // ③ 正常两段式
    const confirmation = await send(baseUrl, `/api/records/${record.id}/clear-confirmations`, user, {
      requestId: randomUUID(),
      expectedVersion: record.version,
    });
    observation.confirmationStatus = confirmation.status;
    const confirmationBody = (await confirmation.json()).data;
    observation.confirmationExpiresAt = confirmationBody.expiresAt;
    const clearRequestId = randomUUID();
    const cleared = await send(baseUrl, `/api/records/${record.id}/clear`, user, {
      requestId: clearRequestId,
      expectedVersion: record.version,
      confirmationId: confirmationBody.confirmationId,
    });
    const clearedBody = (await cleared.json()).data;
    observation.clearStatus = cleared.status;
    observation.cleared = clearedBody.cleared;
    observation.deletionJobId = clearedBody.deletionJobId ?? null;

    // ④ 删除台账三件套 + 正文子表
    const jobs = await database.query(
      "SELECT status FROM deletion_jobs WHERE id = $1",
      [clearedBody.deletionJobId],
    );
    const targets = await database.query(
      'SELECT target_kind, target_ref FROM deletion_targets WHERE deletion_job_id = $1',
      [clearedBody.deletionJobId],
    );
    const outbox = await database.query(
      "SELECT payload->>'recordId' AS record_id, payload->>'recordKind' AS record_kind FROM deletion_outbox WHERE deletion_job_id = $1",
      [clearedBody.deletionJobId],
    );
    const messages = await database.query(
      'SELECT count(*)::int AS count FROM saved_messages WHERE saved_record_id = $1',
      [record.id],
    );
    observation.jobStatus = jobs.rows[0]?.status ?? null;
    observation.deletionTarget = targets.rows[0]?.target_ref === record.id ? targets.rows[0].target_kind : null;
    observation.outboxRecordId = outbox.rows[0]?.record_id ?? null;
    observation.outboxRecordKind = outbox.rows[0]?.record_kind ?? null;
    observation.savedMessagesAfterClear = messages.rows[0].count;

    // ⑤ 清除后不可读、列表为空
    observation.detailAfterClear = (await fetch(`${baseUrl}/api/records/${record.id}`, { headers: { Cookie: user.cookie } })).status;
    const listAfter = await (await fetch(`${baseUrl}/api/records`, { headers: { Cookie: user.cookie } })).json();
    observation.listCountAfterClear = listAfter.data.items.length;

    // ⑥ 同一 requestId 重放 → 幂等，不产生第二条台账
    const replay = await send(baseUrl, `/api/records/${record.id}/clear`, user, {
      requestId: clearRequestId,
      expectedVersion: record.version,
      confirmationId: confirmationBody.confirmationId,
    });
    const replayBody = (await replay.json()).data;
    const outboxCount = await database.query(
      "SELECT count(*)::int AS count FROM deletion_outbox WHERE payload->>'recordId' = $1",
      [record.id],
    );
    observation.replayStatus = replay.status;
    observation.replayIdempotent = replayBody?.idempotent ?? null;
    observation.outboxCountForRecord = outboxCount.rows[0].count;

    console.log('[B3-C04]', JSON.stringify(observation));

    assert.equal(observation.skipConfirmationStatus, 400, '缺少确认号必须被契约拒绝');
    assert.equal(observation.stillReadableAfterSkip, 200, '被拒绝的清除不得影响记录');
    assert.ok([400, 409].includes(observation.forgedConfirmationStatus), '伪造确认号必须被拒绝');
    assert.equal(observation.confirmationStatus, 201);
    assert.equal(observation.clearStatus, 200);
    assert.equal(observation.cleared, true);
    assert.equal(observation.jobStatus, 'PENDING', '删除任务应进入 PENDING');
    assert.equal(observation.deletionTarget, 'CONVERSATION', '删除目标应指向被清除记录');
    assert.equal(observation.outboxRecordId, record.id, 'outbox 载荷应携带被清除记录');
    assert.equal(observation.outboxRecordKind, 'CONVERSATION');
    assert.equal(observation.savedMessagesAfterClear, 0, '清除后正文子表不得留正文');
    assert.equal(observation.detailAfterClear, 404, '清除后详情必须 404');
    assert.equal(observation.listCountAfterClear, 0, '清除后列表不得再出现该记录');
    assert.equal(observation.replayStatus, 200);
    assert.equal(observation.replayIdempotent, true, '同 requestId 重放应幂等');
    assert.equal(observation.outboxCountForRecord, 1, '重放不得产生第二条删除台账');
  });
});

test('B3-REF 清除后旧引用：被 AI 任务引用的记录清除后任务结果不得保留', async () => {
  await withApi(async ({ baseUrl, database }) => {
    const user = await registerAndLogin(baseUrl, 'synthetic_beta3_reference');
    const record = await createRecord(baseUrl, user, conversationPayload());
    const session = await createSession(baseUrl, user);
    const payload = {
      sessionId: session.sessionId,
      activityId: session.activityId,
      sessionGeneration: session.sessionGeneration,
      activityGeneration: session.activityGeneration,
      mode: 'LISTEN',
      operation: 'REPLY',
      selectedText: 'synthetic:beta3 引用历史正文',
      selectedContextIds: [record.id],
    };
    const observation = { recordId: record.id };

    // 用被清除前的记录建任务（正例）
    const consent = await send(baseUrl, '/api/consents', user, {
      requestId: randomUUID(),
      purpose: 'AI_PROCESS',
      operation: 'AGENT_TASK_CREATE',
      payload,
    });
    observation.consentStatus = consent.status;
    const requestId = randomUUID();
    const accepted = await send(baseUrl, '/api/agent/tasks', user, {
      requestId,
      consentId: (await consent.json()).data.consentId,
      ...payload,
    });
    observation.taskAccepted = accepted.status;
    await new Promise((resolve) => setImmediate(resolve));
    const before = await fetch(`${baseUrl}/api/agent/tasks/${requestId}`, { headers: { Cookie: user.cookie } });
    const beforeBody = (await before.json()).data;
    observation.taskStatusBefore = beforeBody?.status ?? null;
    observation.taskHasResultBefore = Boolean(beforeBody?.result);

    // 清除被引用的记录
    const { cleared } = await clearRecord(baseUrl, user, record);
    observation.clearStatus = cleared.status;
    await new Promise((resolve) => setImmediate(resolve));

    const after = await fetch(`${baseUrl}/api/agent/tasks/${requestId}`, { headers: { Cookie: user.cookie } });
    const afterBody = after.status === 200 ? (await after.json()).data : null;
    observation.taskReadAfterClear = after.status;
    observation.taskStatusAfter = afterBody?.status ?? null;
    observation.taskHasResultAfter = Boolean(afterBody?.result);

    // 清除后不得再把该记录当作历史上下文送进模型
    const replayConsent = await send(baseUrl, '/api/consents', user, {
      requestId: randomUUID(),
      purpose: 'AI_PROCESS',
      operation: 'AGENT_TASK_CREATE',
      payload,
    });
    const replayedRequestId = randomUUID();
    const replayed = await send(baseUrl, '/api/agent/tasks', user, {
      requestId: replayedRequestId,
      consentId: (await replayConsent.json()).data.consentId,
      ...payload,
    });
    observation.contextReuseStatus = replayed.status;
    const replayedText = JSON.stringify(await replayed.json());
    observation.contextReuseLeaksBody = replayedText.includes(CONVERSATION_BODY);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setTimeout(resolve, 20));
    const replayedTask = await fetch(`${baseUrl}/api/agent/tasks/${replayedRequestId}`, { headers: { Cookie: user.cookie } });
    const replayedTaskBody = replayedTask.status === 200 ? (await replayedTask.json()).data : null;
    observation.contextReuseTaskStatus = replayedTaskBody?.status ?? null;
    observation.contextReuseTaskHasResult = Boolean(replayedTaskBody?.result);
    observation.contextReuseTaskFailureReason = replayedTaskBody?.failureReason ?? null;

    console.log('[B3-REF]', JSON.stringify(observation));

    assert.equal(observation.consentStatus, 201);
    assert.equal(observation.taskAccepted, 202);
    assert.equal(observation.taskStatusBefore, 'completed');
    assert.equal(observation.taskHasResultBefore, true);
    assert.equal(observation.clearStatus, 200);
    assert.equal(observation.taskReadAfterClear, 200);
    assert.equal(observation.taskHasResultAfter, false, '被引用记录清除后不得继续返回任务结果');
    assert.ok([400, 404, 202].includes(observation.contextReuseStatus), '已清除记录不得再作为可用上下文');
    assert.equal(observation.contextReuseLeaksBody, false, '任何响应都不得回显已清除正文');
    assert.equal(observation.contextReuseTaskHasResult, false, '复用已清除记录建任务不得产出结果');
    // 台账仍应只对该记录留一条
    const outbox = await database.query(
      "SELECT count(*)::int AS count FROM deletion_outbox WHERE payload->>'recordId' = $1",
      [record.id],
    );
    assert.equal(outbox.rows[0].count, 1);
  });
});

test('B3-CONC 并发清除：同一记录两份确认只能成功一次', async () => {
  await withApi(async ({ baseUrl, database }) => {
    const user = await registerAndLogin(baseUrl, 'synthetic_beta3_concurrent');
    const record = await createRecord(baseUrl, user, conversationPayload());
    const confirmations = [];
    for (let index = 0; index < 2; index += 1) {
      const response = await send(baseUrl, `/api/records/${record.id}/clear-confirmations`, user, {
        requestId: randomUUID(),
        expectedVersion: record.version,
      });
      assert.equal(response.status, 201);
      confirmations.push((await response.json()).data.confirmationId);
    }

    const statuses = (await Promise.all(confirmations.map((confirmationId) => send(
      baseUrl,
      `/api/records/${record.id}/clear`,
      user,
      { requestId: randomUUID(), expectedVersion: record.version, confirmationId },
    ).then((response) => response.status)))).sort();

    const outbox = await database.query(
      "SELECT count(*)::int AS count FROM deletion_outbox WHERE payload->>'recordId' = $1",
      [record.id],
    );
    const observation = {
      statuses,
      outboxCountForRecord: outbox.rows[0].count,
      detailAfter: (await fetch(`${baseUrl}/api/records/${record.id}`, { headers: { Cookie: user.cookie } })).status,
    };
    console.log('[B3-CONC]', JSON.stringify(observation));

    assert.equal(statuses.filter((status) => status === 200).length, 1, '并发清除只允许一次成功');
    assert.ok([404, 409].includes(statuses.find((status) => status !== 200)), '另一次必须以 404 或 409 拒绝');
    assert.equal(observation.outboxCountForRecord, 1, '并发清除不得产生重复台账');
    assert.equal(observation.detailAfter, 404);
  });
});

test('B3-INFLIGHT 撤回在途任务：任务立即取消且迟到结果不可读', async () => {
  await withApi(async ({ baseUrl }) => {
    const user = await registerAndLogin(baseUrl, 'synthetic_beta3_inflight');
    const session = await createSession(baseUrl, user);
    const payload = {
      sessionId: session.sessionId,
      activityId: session.activityId,
      sessionGeneration: session.sessionGeneration,
      activityGeneration: session.activityGeneration,
      mode: 'LISTEN',
      operation: 'REPLY',
      selectedText: 'synthetic:beta3 在途撤回探针',
      selectedContextIds: [],
    };
    const consent = await send(baseUrl, '/api/consents', user, {
      requestId: randomUUID(),
      purpose: 'AI_PROCESS',
      operation: 'AGENT_TASK_CREATE',
      payload,
    });
    assert.equal(consent.status, 201);
    const consentId = (await consent.json()).data.consentId;

    const requestId = randomUUID();
    const accepted = await send(baseUrl, '/api/agent/tasks', user, {
      requestId, consentId, ...payload,
    });
    // 模型响应被夹具延迟，此时任务仍在途
    const revoked = await send(baseUrl, `/api/consents/${consentId}/revoke`, user, { requestId: randomUUID() });
    const inFlight = await fetch(`${baseUrl}/api/agent/tasks/${requestId}`, { headers: { Cookie: user.cookie } });
    const inFlightBody = (await inFlight.json()).data;

    await new Promise((resolve) => setTimeout(resolve, 200));
    const settled = await fetch(`${baseUrl}/api/agent/tasks/${requestId}`, { headers: { Cookie: user.cookie } });
    const settledBody = settled.status === 200 ? (await settled.json()).data : null;

    const observation = {
      taskAccepted: accepted.status,
      revokeStatus: revoked.status,
      statusInFlight: inFlightBody?.status ?? null,
      taskReadAfterRevoke: settled.status,
      statusAfterRevoke: settledBody?.status ?? null,
      hasResultAfterRevoke: Boolean(settledBody?.result),
    };
    console.log('[B3-INFLIGHT]', JSON.stringify(observation));

    assert.equal(observation.taskAccepted, 202);
    assert.equal(observation.revokeStatus, 200);
    assert.ok(observation.statusInFlight !== 'completed', '夹具应让任务在撤回时仍处于在途');
    assert.equal(observation.statusInFlight, 'cancelled');
    assert.equal(observation.taskReadAfterRevoke, 200);
    assert.equal(observation.statusAfterRevoke, 'cancelled');
    assert.equal(observation.hasResultAfterRevoke, false, '许可撤回后的迟到结果不得回填');
  }, { responseDelayMs: 60 });
});
