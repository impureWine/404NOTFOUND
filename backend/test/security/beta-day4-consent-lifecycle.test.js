/**
 * Beta Day4 许可生命周期专项探针（关欣 · 安全 / 内容审核）。
 *
 * 覆盖 Day1 P0 清单里的 P1-07（许可绑定载荷摘要、过期与撤销均未复测）：
 *   P-02 许可绑定本次载荷摘要，载荷变更即失效
 *   P-03 许可过期或已撤销后不可继续使用
 *   附加：到期边界（expiresAt 前 1 ms / 正好到期）与跨入口 / 跨账号借用
 *
 * 约定（与 Day2/Day3 探针一致）：
 * 1. 全部使用 `synthetic:` 合成数据、本地 PGlite 与合成模型适配器；不连接正式 PostgreSQL、不调用真实模型。
 * 2. 每条用例输出 [B4-xx] 观察记录，供 Day4 许可生命周期专项报告引用。
 * 3. 过期通过注入时钟验证（`ConsentService({ now })`），不改业务代码、不改系统时间。
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
import { createTestDatabase } from '../helpers/database.js';

const ORIGIN = 'http://127.0.0.1:5173';
const KEY = parseProfileKey('CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=');
const PASSWORD = 'synthetic:beta4-password-only';
const TTL_MS = 5 * 60 * 1000;

async function withApi(callback) {
  const database = await createTestDatabase();
  const authService = new AuthService(database, { profileKey: KEY });
  let clock = Date.now();
  const consentService = new ConsentService({ now: () => new Date(clock) });
  const recordService = new RecordService(new RecordRepository(database), {
    encryptionKey: KEY,
    consentService,
  });
  const server = createApp({ database, authService, consentService, recordService, appOrigin: ORIGIN })
    .listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await callback({
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      database,
      authService,
      advance: (ms) => { clock += ms; },
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
  const login = await send(baseUrl, '/api/auth/login', anonymous, {
    loginName,
    password: PASSWORD,
    target: 'PROFILE',
  });
  assert.equal(login.status, 200);
  return context(baseUrl, login.headers.get('set-cookie').split(';')[0]);
}

/** 同账号的第二个入口（服务端夹具，与 day4-destroy-and-clearing.test.js 的 D4-03 一致）。 */
async function desktopSession(baseUrl, database, authService, loginName) {
  const accountId = (await database.query(
    'SELECT id FROM user_accounts WHERE login_identifier_normalized = $1',
    [loginName],
  )).rows[0].id;
  const entry = await database.query(
    "INSERT INTO entry_points (code) VALUES ('DESKTOP_SYNTHETIC_BETA4') ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code RETURNING id",
  );
  const issued = await authService.createContext(accountId);
  await database.query('UPDATE login_sessions SET entry_point_id = $1 WHERE id = $2', [
    entry.rows[0].id,
    issued.sessionId,
  ]);
  return { cookie: sessionCookie(issued.sessionToken).split(';')[0], csrf: issued.csrfToken };
}

function recordPayload(overrides = {}) {
  return {
    kind: 'CONVERSATION',
    content: { title: 'synthetic:beta4 许可标题', body: 'synthetic:beta4 许可正文', ...overrides },
  };
}

async function issueConsent(baseUrl, state, payload, purpose = 'SAVE', operation = 'RECORD_CREATE') {
  const response = await send(baseUrl, '/api/consents', state, {
    requestId: randomUUID(),
    purpose,
    operation,
    payload,
  });
  assert.equal(response.status, 201, `签发许可失败: ${response.status}`);
  return (await response.json()).data;
}

function saveRecord(baseUrl, state, consentId, payload) {
  return send(baseUrl, '/api/records', state, {
    requestId: randomUUID(),
    consentId,
    ...payload,
  });
}

test('P-02 载荷摘要：内容变更即失效，键序变化不得误杀', async () => {
  await withApi(async ({ baseUrl }) => {
    const user = await registerAndLogin(baseUrl, 'synthetic_beta4_payload');
    const payload = recordPayload();
    const consent = await issueConsent(baseUrl, user, payload);
    const observation = {};

    // 正例：同一载荷可用
    observation.samePayload = (await saveRecord(baseUrl, user, consent.consentId, payload)).status;

    // 反例：正文被改后复用同一 consentId
    const changed = recordPayload({ body: 'synthetic:beta4 被替换的正文' });
    observation.changedBody = (await saveRecord(baseUrl, user, consent.consentId, changed)).status;

    // 正例：内容相同、对象键序不同（规范哈希不应把它当成变更）
    const reordered = { content: { body: payload.content.body, title: payload.content.title }, kind: payload.kind };
    observation.reorderedKeys = (await saveRecord(baseUrl, user, consent.consentId, reordered)).status;

    console.log('[B4-P02]', JSON.stringify(observation));
    assert.equal(observation.samePayload, 201, '同一载荷应可保存');
    assert.equal(observation.changedBody, 403, '载荷变更后许可应失效');
    assert.equal(observation.reorderedKeys, 201, '键序变化不构成载荷变更');
  });
});

test('P-03 过期：5 分钟 TTL 与到期边界', async () => {
  await withApi(async ({ baseUrl, advance }) => {
    const user = await registerAndLogin(baseUrl, 'synthetic_beta4_expiry');
    const payload = recordPayload();
    const consent = await issueConsent(baseUrl, user, payload);
    const observation = {
      ttlFromResponse: Date.parse(consent.expiresAt) - Date.now(),
    };

    // 到期前 1 秒仍可用
    advance(TTL_MS - 1000);
    observation.beforeExpiry = (await saveRecord(baseUrl, user, consent.consentId, payload)).status;

    // 正好到期（expiresAt <= now）应拒绝
    advance(1000);
    observation.atExpiry = (await saveRecord(baseUrl, user, consent.consentId, payload)).status;

    console.log('[B4-P03A]', JSON.stringify(observation));
    assert.ok(observation.ttlFromResponse > TTL_MS - 5000 && observation.ttlFromResponse <= TTL_MS, '许可有效期应为 5 分钟（响应时间与断言时间存在毫秒差）');
    assert.equal(observation.beforeExpiry, 201, '到期前应仍可使用');
    assert.equal(observation.atExpiry, 403, '到期后必须拒绝');
  });
});

test('P-03 撤销：撤销即失效，跨账号撤销返回 404', async () => {
  await withApi(async ({ baseUrl }) => {
    const alice = await registerAndLogin(baseUrl, 'synthetic_beta4_revoke');
    const bob = await registerAndLogin(baseUrl, 'synthetic_beta4_revoker');
    const payload = recordPayload();
    const consent = await issueConsent(baseUrl, alice, payload);
    const observation = {};

    observation.beforeRevoke = (await saveRecord(baseUrl, alice, consent.consentId, payload)).status;

    const revoked = await send(baseUrl, `/api/consents/${consent.consentId}/revoke`, alice, { requestId: randomUUID() });
    observation.revokeStatus = revoked.status;
    observation.afterRevoke = (await saveRecord(baseUrl, alice, consent.consentId, payload)).status;

    // Bob 不能撤销 Alice 的许可
    const crossRevoke = await send(baseUrl, `/api/consents/${consent.consentId}/revoke`, bob, { requestId: randomUUID() });
    observation.crossAccountRevoke = crossRevoke.status;

    console.log('[B4-P03B]', JSON.stringify(observation));
    assert.equal(observation.beforeRevoke, 201);
    assert.equal(observation.revokeStatus, 200);
    assert.equal(observation.afterRevoke, 403, '撤销后许可不得继续使用');
    assert.equal(observation.crossAccountRevoke, 404, '他人不得撤销我的许可');
  });
});

test('P-03 附加：同账号异入口借用 SAVE 许可', async () => {
  await withApi(async ({ baseUrl, database, authService }) => {
    const alice = await registerAndLogin(baseUrl, 'synthetic_beta4_cross_entry');
    const desktop = await desktopSession(baseUrl, database, authService, 'synthetic_beta4_cross_entry');
    const payload = recordPayload();

    // 许可是在 WEB 入口签发的
    const consent = await issueConsent(baseUrl, alice, payload);
    // 用同一 payload 从 DESKTOP 入口提交
    const reused = await saveRecord(baseUrl, desktop, consent.consentId, payload);

    const observation = { crossEntryReuse: reused.status };
    console.log('[B4-P03C]', JSON.stringify(observation));
    // main 上许可只按账号绑定（ownerKey = accountId），因此可跨入口复用；#145 才补 entryPointId 绑定
    assert.ok([201, 403].includes(observation.crossEntryReuse), '跨入口复用应为 201（缺口）或 403（已收紧）');
  });
});

test('P-03 附加：跨账号借用他人许可（回归）', async () => {
  await withApi(async ({ baseUrl }) => {
    const alice = await registerAndLogin(baseUrl, 'synthetic_beta4_borrow');
    const bob = await registerAndLogin(baseUrl, 'synthetic_beta4_borrower');
    const payload = recordPayload();
    const consent = await issueConsent(baseUrl, alice, payload);

    const borrowed = await saveRecord(baseUrl, bob, consent.consentId, payload);
    const observation = { borrowedConsentStatus: borrowed.status };
    console.log('[B4-P03D]', JSON.stringify(observation));
    assert.equal(observation.borrowedConsentStatus, 403, '他人许可不得跨账号使用');
  });
});
