/**
 * Day 2 安全复核：真实 HTTP + AuthService/仓储 + 内存 PGlite。
 * 内容、密码和密钥种子使用 synthetic:；登录名因 ASCII 契约使用 synthetic_。
 * 失败断言保留为待修复证据；异常注入与模型替身用例不代表真实依赖验收。
 * DAY2_EVIDENCE_PATH 只在显式设置时输出不含 Cookie/CSRF/密码的观察记录。
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import test, { after, before } from 'node:test';
import vm from 'node:vm';

import { createApp } from '../../src/app.js';
import { sessionCookie } from '../../src/http/request.js';
import { RecordRepository } from '../../src/repositories/record-repository.js';
import { AuthService } from '../../src/services/auth-service.js';
import { ConsentService } from '../../src/services/consent-service.js';
import { RecordService } from '../../src/services/record-service.js';
import { createTestDatabase } from '../helpers/database.js';

const ORIGIN = 'http://127.0.0.1:5173';
const PASSWORD = 'synthetic:day2-password-only';
const KEY = createHash('sha256').update('synthetic:day2-profile-key').digest();
const observations = [];
let database;
let auth;
let server;
let baseUrl;
let alice;
let bob;
let record;

function observe(id, actual) {
  observations.push({ id, ...actual });
}

async function context(cookie) {
  const response = await fetch(`${baseUrl}/api/auth/context`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  return {
    cookie: response.headers.get('set-cookie').split(';')[0],
    csrf: body.data.csrfToken,
    setCookie: response.headers.get('set-cookie'),
  };
}

function send(path, state, body, { method = 'POST', headers = {} } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(state ? { Cookie: state.cookie, 'X-CSRF-Token': state.csrf } : {}),
      Origin: ORIGIN,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function get(path, state) {
  return fetch(`${baseUrl}${path}`, { headers: state ? { Cookie: state.cookie } : {} });
}

async function register(name, state = null) {
  const anonymous = state ?? await context();
  const response = await send('/api/auth/register', anonymous, {
    requestId: randomUUID(), loginName: name, password: PASSWORD, confirmPassword: PASSWORD,
  });
  return { response, anonymous, body: await response.json() };
}

async function login(name, password = PASSWORD) {
  const anonymous = await context();
  const response = await send('/api/auth/login', anonymous, {
    loginName: name, password, target: 'PROFILE',
  });
  if (response.status !== 200) return { response, body: await response.json() };
  return { response, state: await context(response.headers.get('set-cookie').split(';')[0]) };
}

before(async () => {
  database = await createTestDatabase();
  auth = new AuthService(database, { profileKey: KEY });
  const consentService = new ConsentService();
  const recordService = new RecordService(new RecordRepository(database), {
    encryptionKey: KEY, consentService,
  });
  server = createApp({ database, authService: auth, consentService, recordService, appOrigin: ORIGIN })
    .listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  for (const name of ['synthetic_day2_alice', 'synthetic_day2_bob']) {
    assert.equal((await register(name)).response.status, 201);
  }
  alice = (await login('synthetic_day2_alice')).state;
  bob = (await login('synthetic_day2_bob')).state;
  const payload = {
    kind: 'CONVERSATION', content: { title: 'synthetic:record-title', body: 'synthetic:record-body' },
  };
  const consent = await send('/api/consents', alice, {
    requestId: randomUUID(), purpose: 'SAVE', operation: 'RECORD_CREATE', payload,
  });
  assert.equal(consent.status, 201);
  const created = await send('/api/records', alice, {
    requestId: randomUUID(), consentId: (await consent.json()).data.consentId, ...payload,
  });
  assert.equal(created.status, 201);
  record = (await created.json()).data;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (database) await database.close();
  if (process.env.DAY2_EVIDENCE_PATH) {
    await writeFile(process.env.DAY2_EVIDENCE_PATH, `${JSON.stringify({
      synthetic_only: true,
      layers: ['HTTP', 'real AuthService and repositories', 'in-memory PGlite'],
      observations,
    }, null, 2)}\n`);
  }
});

test('D2-01 注册→登录→查看本人资料→退出，旧 Cookie 失效', async () => {
  const created = await register('synthetic_day2_flow');
  assert.equal(created.response.status, 201);
  const logged = await login('synthetic_day2_flow');
  assert.equal(logged.response.status, 200);
  assert.equal((await get('/api/profile', logged.state)).status, 200);
  const logout = await send('/api/auth/logout', logged.state, {});
  const stale = await get('/api/profile', logged.state);
  observe('D2-01', { register: 201, login: 200, profile: 200, logout: logout.status, replay: stale.status });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal(stale.status, 401);
});

test('D2-02 大小写与 NFKC 同名被拒绝，账号相关表没有重复行', async () => {
  assert.equal((await register('synthetic_day2_duplicate')).response.status, 201);
  const statuses = [];
  for (const name of ['SYNTHETIC_DAY2_DUPLICATE', 'ｓｙｎｔｈｅｔｉｃ＿ｄａｙ２＿ｄｕｐｌｉｃａｔｅ']) {
    statuses.push((await register(name)).response.status);
  }
  const result = await database.query(`
    SELECT
      (SELECT count(*)::int FROM user_accounts WHERE login_identifier_normalized = $1) AS accounts,
      (SELECT count(*)::int FROM password_credentials c JOIN user_accounts a ON a.id=c.account_id
        WHERE a.login_identifier_normalized = $1) AS credentials,
      (SELECT count(*)::int FROM user_profiles p JOIN user_accounts a ON a.id=p.account_id
        WHERE a.login_identifier_normalized = $1) AS profiles,
      (SELECT count(*)::int FROM account_preferences p JOIN user_accounts a ON a.id=p.account_id
        WHERE a.login_identifier_normalized = $1) AS preferences
  `, ['synthetic_day2_duplicate']);
  observe('D2-02', { duplicate_statuses: statuses, counts: result.rows[0] });
  assert.deepEqual(statuses, [409, 409]);
  assert.deepEqual(result.rows[0], { accounts: 1, credentials: 1, profiles: 1, preferences: 1 });
});

test('D2-03 重复注册响应不得明确披露登录名已被使用', async () => {
  const duplicate = await register('synthetic_day2_alice');
  observe('D2-03', { status: duplicate.response.status, error: duplicate.body.error });
  assert.doesNotMatch(duplicate.body.error.message, /已被使用|已注册|already|exists/i);
});

test('D2-04 密码为实际 Argon2id 摘要，会话仅保存 32 字节摘要', async () => {
  const credentials = await database.query('SELECT password_digest FROM password_credentials');
  assert.ok(credentials.rows.length > 0);
  for (const row of credentials.rows) {
    assert.match(row.password_digest, /^\$argon2id\$/);
    assert.equal(row.password_digest.includes(PASSWORD), false);
  }
  const sessions = await database.query('SELECT token_digest, csrf_token_digest FROM login_sessions');
  for (const row of sessions.rows) {
    assert.equal(row.token_digest.length, 32);
    assert.equal(row.csrf_token_digest.length, 32);
  }
  observe('D2-04', { credential_count: credentials.rows.length, session_count: sessions.rows.length, digest_bytes: 32 });
});

test('D2-05 未登录或随机伪造 Cookie 不能读取资料和记录', async () => {
  const statuses = [];
  for (const state of [null, { cookie: 'session=synthetic%3Ainvalid-token' }]) {
    for (const path of ['/api/profile', '/api/records']) statuses.push((await get(path, state)).status);
  }
  observe('D2-05', { statuses });
  assert.deepEqual(statuses, [401, 401, 401, 401]);
});

for (const [id, name, sql] of [
  ['D2-06', '绝对过期', "UPDATE login_sessions SET issued_at=now()-interval '2 hours', expires_at=now()-interval '1 second' WHERE id=$1"],
  ['D2-07', '空闲过期', "UPDATE login_sessions SET issued_at=now()-interval '2 hours', last_seen_at=now()-interval '31 minutes' WHERE id=$1"],
  ['D2-08', '已撤销', 'UPDATE login_sessions SET revoked_at=now() WHERE id=$1'],
]) {
  test(`${id} ${name}会话不能读取资料`, async () => {
    const issued = await auth.createContext((await database.query(
      'SELECT id FROM user_accounts WHERE login_identifier_normalized=$1', ['synthetic_day2_alice'],
    )).rows[0].id);
    await database.query(sql, [issued.sessionId]);
    const response = await get('/api/profile', { cookie: sessionCookie(issued.sessionToken).split(';')[0] });
    observe(id, { status: response.status });
    assert.equal(response.status, 401);
  });
}

test('D2-09 改密撤销两个旧会话，旧密码失败、新密码可登录', async () => {
  assert.equal((await register('synthetic_day2_password')).response.status, 201);
  const first = (await login('synthetic_day2_password')).state;
  const second = (await login('synthetic_day2_password')).state;
  const nextPassword = 'synthetic:changed-password-only';
  const changed = await send('/api/auth/change-password', first, {
    currentPassword: PASSWORD, newPassword: nextPassword, confirmPassword: nextPassword,
  });
  const replay = [(await get('/api/profile', first)).status, (await get('/api/profile', second)).status];
  const oldLogin = await login('synthetic_day2_password');
  const newLogin = await login('synthetic_day2_password', nextPassword);
  observe('D2-09', { change: changed.status, replay, old_password_login: oldLogin.response.status, new_password_login: newLogin.response.status });
  assert.equal(changed.status, 204);
  assert.deepEqual(replay, [401, 401]);
  assert.equal(oldLogin.response.status, 401);
  assert.equal(newLogin.response.status, 200);
});

test('D2-10 不存在账号与错误密码返回相同错误', async () => {
  const missing = await login('synthetic_day2_missing');
  const wrong = await login('synthetic_day2_alice', 'synthetic:wrong-password');
  observe('D2-10', { missing_status: missing.response.status, wrong_status: wrong.response.status, missing_error: missing.body.error, wrong_error: wrong.body.error });
  assert.equal(missing.response.status, 401);
  assert.equal(wrong.response.status, 401);
  assert.deepEqual(missing.body.error, wrong.body.error);
});

test('D2-11 伪造 accountId 的查询只能返回当前 B 的资料，写入额外归属字段被拒绝', async () => {
  const aliceId = (await database.query('SELECT id FROM user_accounts WHERE login_identifier_normalized=$1', ['synthetic_day2_alice'])).rows[0].id;
  const response = await get(`/api/profile?accountId=${aliceId}&entryPointId=${randomUUID()}`, bob);
  const profile = (await response.json()).data;
  assert.equal(profile.nickname, 'synthetic_day2_bob');
  const update = await send('/api/profile', bob, {
    requestId: randomUUID(), expectedVersion: profile.version, nickname: 'synthetic:forged',
    avatarKey: 'DEFAULT', bio: 'synthetic:forged-profile', accountId: aliceId,
  }, { method: 'PATCH' });
  const afterAlice = (await (await get('/api/profile', alice)).json()).data;
  observe('D2-11', { read_status: response.status, returned_current_account: true, write_status: update.status, victim_unchanged: afterAlice.nickname === 'synthetic_day2_alice' });
  assert.equal(update.status, 400);
  assert.equal(afterAlice.nickname, 'synthetic_day2_alice');
});

test('D2-12 B 读 A 的记录与读不存在记录均为同一 404，列表不泄露 A 的记录', async () => {
  const denied = await get(`/api/records/${record.id}`, bob);
  const missing = await get(`/api/records/${randomUUID()}`, bob);
  const deniedBody = await denied.json();
  const missingBody = await missing.json();
  const list = (await (await get('/api/records', bob)).json()).data;
  observe('D2-12', { denied: denied.status, missing: missing.status, errors_equal: JSON.stringify(deniedBody.error) === JSON.stringify(missingBody.error), list_count: list.items.length });
  assert.equal(denied.status, 404);
  assert.equal(missing.status, 404);
  assert.deepEqual(deniedBody.error, missingBody.error);
  assert.equal(list.items.length, 0);
});

test('D2-13 B 不能给 A 的记录签发清除确认，A 的记录仍在', async () => {
  const denied = await send(`/api/records/${record.id}/clear-confirmations`, bob, {
    requestId: randomUUID(), expectedVersion: record.version,
  });
  const own = await get(`/api/records/${record.id}`, alice);
  observe('D2-13', { denied: denied.status, owner_read: own.status });
  assert.equal(denied.status, 404);
  assert.equal(own.status, 200);
});

test('D2-14 服务端切换入口后不能读取 WEB 记录，客户端入口参数不能绕过', async () => {
  const accountId = (await database.query('SELECT id FROM user_accounts WHERE login_identifier_normalized=$1', ['synthetic_day2_alice'])).rows[0].id;
  const desktopEntry = await database.query("INSERT INTO entry_points (code) VALUES ('DESKTOP_SYNTHETIC_DAY2') RETURNING id");
  const issued = await auth.createContext(accountId);
  await database.query('UPDATE login_sessions SET entry_point_id=$1 WHERE id=$2', [desktopEntry.rows[0].id, issued.sessionId]);
  const state = { cookie: sessionCookie(issued.sessionToken).split(';')[0], csrf: issued.csrfToken };
  const denied = await get(`/api/records/${record.id}?entry=WEB&accountId=${accountId}`, state);
  const listResponse = await get('/api/records?entry=WEB', state);
  const profile = await get('/api/profile', state);
  observe('D2-14', { record_status: denied.status, forged_list_status: listResponse.status, profile_status: profile.status, fixture: 'server-side session entry changed in PGlite; not native desktop login' });
  assert.equal(denied.status, 404);
  assert.equal(listResponse.status, 400);
});

test('D2-15 缺少/错误 CSRF 与外部 Origin 的写入被拒绝', async () => {
  const anonymous = await context();
  const statuses = [];
  for (const headers of [
    { 'X-CSRF-Token': '' },
    { 'X-CSRF-Token': 'synthetic:forged-csrf' },
    { Origin: 'https://synthetic-attacker.invalid' },
  ]) {
    const response = await send('/api/auth/register', anonymous, {
      requestId: randomUUID(), loginName: 'synthetic_day2_blocked', password: PASSWORD, confirmPassword: PASSWORD,
    }, { headers });
    statuses.push(response.status);
  }
  observe('D2-15', { statuses });
  assert.deepEqual(statuses, [403, 403, 403]);
});

test('D2-16 HTTP Cookie 包含 HttpOnly/SameSite/Path，安全配置生成 Host Cookie', async () => {
  const state = await context();
  assert.match(state.setCookie, /HttpOnly/);
  assert.match(state.setCookie, /SameSite=Lax/);
  assert.match(state.setCookie, /Path=\//);
  const secure = sessionCookie('synthetic:cookie', true);
  assert.match(secure, /^__Host-session=/);
  assert.match(secure, /; Secure$/);
  observe('D2-16', { http_cookie: 'HttpOnly; SameSite=Lax; Path=/', secure_cookie_function: '__Host-session; Secure', https_browser_verified: false });
});

test('D2-17 未知数据库异常不得把内部错误信息返回客户端（异常注入）', async () => {
  const original = database.query.bind(database);
  const marker = 'synthetic:db-private-detail';
  database.query = async (sql, ...args) => {
    if (String(sql).includes('SELECT nickname, avatar_key, bio_ciphertext, version_no')) {
      throw new Error(`${marker}; password=synthetic:secret; SQL SELECT; /synthetic/private/path`);
    }
    return original(sql, ...args);
  };
  try {
    const response = await get('/api/profile', alice);
    const body = await response.json();
    observe('D2-17', { status: response.status, error: body.error, layer: 'real HTTP with synthetic database exception injection' });
    assert.equal(JSON.stringify(body).includes(marker), false, '错误响应暴露了合成内部异常');
  } finally {
    database.query = original;
  }
});

test('D2-18 非法 JSON 应为 400 且有请求标识', async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'synthetic:invalid-json',
  });
  const body = await response.json();
  observe('D2-18', { status: response.status, error: body.error, has_request_id: Boolean(body.meta?.requestId) });
  assert.equal(response.status, 400);
  assert.ok(body.meta?.requestId);
});

test('D2-19 登录、资料响应和捕获的 console 不泄露敏感值', async (t) => {
  const logs = [];
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    t.mock.method(console, level, (...values) => logs.push(values.map(String).join(' ')));
  }
  const logged = await login('synthetic_day2_alice');
  const body = await logged.response.json();
  const profile = await (await get('/api/profile', logged.state)).json();
  const serialized = JSON.stringify({ body, profile });
  for (const forbidden of [PASSWORD, '$argon2id$', 'token_digest', 'csrf_token_digest', 'password_digest', logged.state.cookie.split('=')[1]]) {
    assert.equal(serialized.includes(forbidden), false);
  }
  for (const forbidden of [PASSWORD, 'synthetic_day2_alice', logged.state.cookie.split('=')[1]]) {
    assert.equal(logs.join('\n').includes(forbidden), false);
  }
  // GET context 换发了新凭据，后续用例必须使用当前身份，避免拿旧会话误报。
  alice = logged.state;
  observe('D2-19', { forbidden_fields_absent: true, console_events: logs.length, scope: 'only exercised login/profile paths; no centralized logger verified' });
});

test('D2-20 未认证请求不能触发内部模型适配器（路由替身）', async () => {
  let calls = 0;
  const probe = createApp({ database, authService: auth, modelAdapter: {
    async respond() { calls += 1; return { status: 'success', result: { content: 'synthetic:model-output' } }; },
  } }).listen(0, '127.0.0.1');
  await new Promise((resolve) => probe.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${probe.address().port}/internal/v1/model/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: 'synthetic:unauthenticated-probe' }),
    });
    observe('D2-20', { status: response.status, adapter_calls: calls, real_model_called: false, layer: 'substitute adapter used only to observe route dispatch' });
    assert.equal(calls, 0, '匿名请求已到达模型适配器');
    assert.ok([401, 403].includes(response.status));
  } finally {
    await new Promise((resolve) => probe.close(resolve));
  }
});

test('D2-21 preload 不能传入任意 IPC 通道，订阅可解除（VM 替身）', async () => {
  let exposed;
  const sent = [];
  const listeners = new Map();
  const source = await readFile(new URL('../../../prototype/electron/preload.cjs', import.meta.url), 'utf8');
  vm.runInNewContext(source, { require(name) {
    assert.equal(name, 'electron');
    return {
      contextBridge: { exposeInMainWorld(_name, value) { exposed = value; } },
      ipcRenderer: {
        send: (...args) => sent.push(args),
        on: (name, callback) => listeners.set(name, callback),
        removeListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name); },
      },
    };
  } });
  assert.equal(exposed.send, undefined);
  assert.equal(exposed.invoke, undefined);
  assert.equal(exposed.ipcRenderer, undefined);
  exposed.setClickThrough(true, 'synthetic:arbitrary-channel');
  assert.deepEqual(sent[0], ['pet:set-click-through', true]);
  const unsubscribe = exposed.onClickThroughChanged(() => {});
  assert.equal(listeners.size, 1);
  unsubscribe();
  assert.equal(listeners.size, 0);
  observe('D2-21', { arbitrary_channel_exposed: false, unsubscribe: true, layer: 'VM substitute; native Electron not launched' });
});

test('D2-22 获取认证上下文不应把 DESKTOP 会话重绑定为 WEB 并开放 WEB 记录', async () => {
  const accountId = (await database.query('SELECT id FROM user_accounts WHERE login_identifier_normalized=$1', ['synthetic_day2_alice'])).rows[0].id;
  const entry = await database.query("INSERT INTO entry_points (code) VALUES ('DESKTOP_SYNTHETIC_DAY2') ON CONFLICT (code) DO UPDATE SET code=EXCLUDED.code RETURNING id");
  const issued = await auth.createContext(accountId);
  await database.query('UPDATE login_sessions SET entry_point_id=$1 WHERE id=$2', [entry.rows[0].id, issued.sessionId]);
  const desktop = { cookie: sessionCookie(issued.sessionToken).split(';')[0], csrf: issued.csrfToken };
  const beforeRotation = await get(`/api/records/${record.id}`, desktop);
  const rotated = await context(desktop.cookie);
  const afterRotation = await get(`/api/records/${record.id}`, rotated);
  observe('D2-22', { before_context: beforeRotation.status, after_context: afterRotation.status, fixture: 'server-side DESKTOP session in PGlite; native multi-entry login not verified' });
  assert.equal(beforeRotation.status, 404);
  assert.equal(afterRotation.status, 404, '上下文换发把 DESKTOP 会话改为 WEB 并读取了 WEB 私密记录');
});
