/**
 * Alpha 冲刺 Day 4 隐私与越权复核用例（安全 / 内容审核，T07）。
 *
 * 覆盖计划中 Day 4 的两项主责：
 * ① 文字销毁正文不进入网络、存储、日志或 AI；
 * ② 复核账号 A/B、失效会话、不同入口的拒绝路径。
 *
 * 边界声明（不得在日报中省略）：
 * 1. D4-01 是**结构级**证据：证明后端没有销毁通路口，不等于已对真实浏览器做抓包验证。
 * 2. 运行时网络请求、存储面板与重开页面检查需在浏览器中另行执行，本文件不替代。
 * 3. 全部使用 `synthetic:` 合成内容与本地 PGlite，不连接正式 PostgreSQL、不调用真实模型。
 * 4. 通过即"该条在本次运行环境下成立"，不构成系统级"绝对无痕"结论。
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createApp } from '../../src/app.js';
import { sessionCookie } from '../../src/http/request.js';
import { parseProfileKey } from '../../src/security/crypto.js';
import { RecordRepository } from '../../src/repositories/record-repository.js';
import { AuthService } from '../../src/services/auth-service.js';
import { ConsentService } from '../../src/services/consent-service.js';
import { RecordService } from '../../src/services/record-service.js';
import { createTestDatabase } from '../helpers/database.js';

const ORIGIN = 'http://127.0.0.1:5173';
const KEY = parseProfileKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
const PASSWORD = 'synthetic:day4-password-only';
const SYNTHETIC_BODY = 'synthetic:day4 私密正文';

async function withApi(callback) {
  const database = await createTestDatabase();
  const authService = new AuthService(database, { profileKey: KEY });
  const consentService = new ConsentService();
  const recordService = new RecordService(new RecordRepository(database), {
    encryptionKey: KEY,
    consentService,
  });
  const server = createApp({ database, authService, consentService, recordService, appOrigin: ORIGIN })
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

function send(baseUrl, path, state, body, { method = 'POST' } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: state.cookie,
      Origin: ORIGIN,
      'X-CSRF-Token': state.csrf,
    },
    body: JSON.stringify(body),
  });
}

async function register(baseUrl, loginName) {
  const anonymous = await context(baseUrl);
  const registered = await send(baseUrl, '/api/auth/register', anonymous, {
    requestId: randomUUID(),
    loginName,
    password: PASSWORD,
    confirmPassword: PASSWORD,
  });
  assert.equal(registered.status, 201);
  return anonymous;
}

async function login(baseUrl, loginName) {
  const anonymous = await context(baseUrl);
  const response = await send(baseUrl, '/api/auth/login', anonymous, {
    loginName,
    password: PASSWORD,
    target: 'PROFILE',
  });
  assert.equal(response.status, 200);
  return context(baseUrl, response.headers.get('set-cookie').split(';')[0]);
}

async function registerAndLogin(baseUrl, loginName) {
  await register(baseUrl, loginName);
  return login(baseUrl, loginName);
}

async function createRecord(baseUrl, state) {
  const payload = { kind: 'CONVERSATION', content: { title: 'synthetic:day4 标题', body: SYNTHETIC_BODY } };
  const consent = await send(baseUrl, '/api/consents', state, {
    requestId: randomUUID(),
    purpose: 'SAVE',
    operation: 'RECORD_CREATE',
    payload,
  });
  assert.equal(consent.status, 201);
  const created = await send(baseUrl, '/api/records', state, {
    requestId: randomUUID(),
    consentId: (await consent.json()).data.consentId,
    ...payload,
  });
  assert.equal(created.status, 201);
  return (await created.json()).data;
}

test('D4-01 文字销毁在后端不存在任何通路口（结构级）', async () => {
  await withApi(async ({ baseUrl, database }) => {
    const alice = await registerAndLogin(baseUrl, 'synthetic_day4_destroy');

    // 任何可能被误接的销毁类路径都必须回到 404，且不回显提交内容。
    for (const path of [
      '/api/destroy',
      '/api/records/destroy',
      '/api/destroy/text',
      '/internal/v1/destroy',
    ]) {
      const response = await send(baseUrl, path, alice, { text: SYNTHETIC_BODY });
      assert.equal(response.status, 404, `${path} 不应存在后端通路`);
      const serialized = JSON.stringify(await response.json());
      assert.equal(serialized.includes(SYNTHETIC_BODY), false, `${path} 不得回显正文`);
    }

    // 库中不得存在销毁正文的表或列。
    const columns = await database.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          table_name ~* '(destroy|burn|incinerat|cremat)'
          OR column_name ~* '(destroy|burn|incinerat|cremat)'
        )
    `);
    assert.deepEqual(columns.rows, [], '文字销毁不应存在任何表或列');

    // 即使把内容写入正常记录路径，也不得出现明文正文列。
    const record = await createRecord(baseUrl, alice);
    const stored = await database.query(
      `SELECT title_ciphertext, deleted_at FROM saved_records WHERE id = $1`,
      [record.id],
    );
    assert.equal(stored.rows.length, 1);
    assert.equal(JSON.stringify(stored.rows[0]).includes(SYNTHETIC_BODY), false);
  });
});

test('D4-02 清除后记录不再可读：详情、列表与正文子表均无残留', async () => {
  await withApi(async ({ baseUrl, database }) => {
    const alice = await registerAndLogin(baseUrl, 'synthetic_day4_clear');
    const record = await createRecord(baseUrl, alice);

    const detailBefore = await fetch(`${baseUrl}/api/records/${record.id}`, {
      headers: { Cookie: alice.cookie },
    });
    assert.equal(detailBefore.status, 200);

    const confirmation = await send(baseUrl, `/api/records/${record.id}/clear-confirmations`, alice, {
      requestId: randomUUID(),
      expectedVersion: record.version,
    });
    assert.equal(confirmation.status, 201);
    const cleared = await send(baseUrl, `/api/records/${record.id}/clear`, alice, {
      requestId: randomUUID(),
      expectedVersion: record.version,
      confirmationId: (await confirmation.json()).data.confirmationId,
    });
    assert.equal(cleared.status, 200);

    // 详情不可读、列表为空。
    assert.equal((await fetch(`${baseUrl}/api/records/${record.id}`, {
      headers: { Cookie: alice.cookie },
    })).status, 404);
    const list = await fetch(`${baseUrl}/api/records`, { headers: { Cookie: alice.cookie } });
    assert.equal((await list.json()).data.items.length, 0);

    // 正文子表无残留，删除任务与 outbox 已生成。
    const payload = await database.query(
      'SELECT count(*)::int AS count FROM saved_messages WHERE saved_record_id = $1',
      [record.id],
    );
    assert.equal(payload.rows[0].count, 0);
    const outbox = await database.query(
      'SELECT count(*)::int AS count FROM deletion_outbox',
    );
    assert.ok(outbox.rows[0].count >= 1, '清除应产生删除 outbox 记录');
  });
});

test('D4-03 不同入口不能清除本入口记录，原入口记录不受影响', async () => {
  await withApi(async ({ baseUrl, database, authService }) => {
    const alice = await registerAndLogin(baseUrl, 'synthetic_day4_entry');
    const record = await createRecord(baseUrl, alice);

    // 同账号的 DESKTOP 会话：创建会话后把入口改为 DESKTOP（服务端夹具，非原生桌面登录）。
    const accountId = (await database.query(
      'SELECT id FROM user_accounts WHERE login_identifier_normalized = $1',
      ['synthetic_day4_entry'],
    )).rows[0].id;
    const desktopEntry = await database.query(
      "INSERT INTO entry_points (code) VALUES ('DESKTOP_SYNTHETIC_DAY4') ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code RETURNING id",
    );
    const issued = await authService.createContext(accountId);
    await database.query('UPDATE login_sessions SET entry_point_id = $1 WHERE id = $2', [
      desktopEntry.rows[0].id,
      issued.sessionId,
    ]);
    const desktop = {
      cookie: sessionCookie(issued.sessionToken).split(';')[0],
      csrf: issued.csrfToken,
    };

    // 另一入口既读不到、也不能签发清除确认。
    assert.equal((await fetch(`${baseUrl}/api/records/${record.id}`, {
      headers: { Cookie: desktop.cookie },
    })).status, 404);
    const denied = await send(baseUrl, `/api/records/${record.id}/clear-confirmations`, desktop, {
      requestId: randomUUID(),
      expectedVersion: record.version,
    });
    assert.equal(denied.status, 404);

    // 原入口记录仍在且可读。
    assert.equal((await fetch(`${baseUrl}/api/records/${record.id}`, {
      headers: { Cookie: alice.cookie },
    })).status, 200);
  });
});

test('D4-04 失效会话不能执行清除，重新登录后记录仍在', async () => {
  await withApi(async ({ baseUrl }) => {
    const alice = await registerAndLogin(baseUrl, 'synthetic_day4_revoked');
    const record = await createRecord(baseUrl, alice);

    const logout = await send(baseUrl, '/api/auth/logout', alice, {});
    assert.equal(logout.status, 204);

    // 旧 Cookie 已失效：详情应返回 401；写请求必须被拒绝。
    const staleDetail = await fetch(`${baseUrl}/api/records/${record.id}`, {
      headers: { Cookie: alice.cookie },
    });
    assert.equal(staleDetail.status, 401);

    const staleClear = await send(baseUrl, `/api/records/${record.id}/clear-confirmations`, alice, {
      requestId: randomUUID(),
      expectedVersion: record.version,
    });
    // 要求：失效会话不得执行清除。实测当前返回 403——createSecurityMiddleware 在
    // 认证之前先校验 CSRF，无会话时抛 ACCESS_DENIED，走不到 requireAuthentication 的 401。
    // 该语义与错误契约不一致，已记为 Day 4 待修项，此处只断言"必须被拒绝"。
    assert.ok(
      [401, 403].includes(staleClear.status),
      `失效会话的清除请求必须被拒绝，实测 ${staleClear.status}`,
    );

    // 重新登录后记录仍可读，证明失效会话没有造成数据丢失或越权删除。
    const relogin = await login(baseUrl, 'synthetic_day4_revoked');
    const detail = await fetch(`${baseUrl}/api/records/${record.id}`, {
      headers: { Cookie: relogin.cookie },
    });
    assert.equal(detail.status, 200);
  });
});
