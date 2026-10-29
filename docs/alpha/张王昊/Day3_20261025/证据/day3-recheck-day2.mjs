// PM复核探针：只在内存PGlite和127.0.0.1临时端口使用合成材料。
// 运行：node day2-contract-probe.mjs <完整仓库路径>
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';

const root = path.resolve(process.argv[2] ?? '.');
const require = createRequire(path.join(root, 'backend/package.json'));
const { PGlite } = require('@electric-sql/pglite');
const load = async (file) => import(pathToFileURL(path.join(root, file)).href);
const { runMigrations } = await load('backend/src/db/migration-runner.js');
const { createApp } = await load('backend/src/app.js');
const { AuthService } = await load('backend/src/services/auth-service.js');
const database = new PGlite();
const records = [];
const smokeChecks = [];
const origin = 'http://127.0.0.1:5173';
await runMigrations(database);
const authService = new AuthService(database, { profileKey: randomBytes(32) });
const server = createApp({ database, authService, appOrigin: origin }).listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const url = `http://127.0.0.1:${server.address().port}`;

const record = (id, name, expected, actual, pass) => records.push({ id, name, expected, actual, pass });
const ctx = async (cookie) => {
  const r = await fetch(`${url}/api/auth/context`, { headers: cookie ? { Cookie: cookie } : {} });
  const b = await r.json();
  return { cookie: r.headers.get('set-cookie').split(';')[0], csrf: b.data.csrfToken };
};
const send = async (method, route, context, body, raw = false) => {
  const r = await fetch(url + route, {
    method, headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: context.cookie, 'X-CSRF-Token': context.csrf },
    ...(body === undefined ? {} : { body: raw ? body : JSON.stringify(body) }),
  });
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { status: r.status, data, cookie: r.headers.get('set-cookie')?.split(';')[0] };
};

try {
  const anon = await ctx();
  const bad = await send('POST', '/api/auth/register', anon, '{', true);
  record('RV-01', '非法JSON与requestId', { status: 400, code: 'INVALID_INPUT', requestId: true },
    { status: bad.status, code: bad.data?.error?.code, requestId: Boolean(bad.data?.meta?.requestId) },
    bad.status === 400 && bad.data?.error?.code === 'INVALID_INPUT' && Boolean(bad.data?.meta?.requestId));
  const large = await send('POST', '/api/auth/register', anon, JSON.stringify({ marker: 'x'.repeat(132000) }), true);
  record('RV-02', '请求体超限与requestId', { status: 413, requestId: true },
    { status: large.status, code: large.data?.error?.code, requestId: Boolean(large.data?.meta?.requestId) },
    large.status === 413 && Boolean(large.data?.meta?.requestId));
  const password = 'SYNTHETIC-review-only-2026';
  const registration = { requestId: randomUUID(), loginName: 'pm_day2_probe', password, confirmPassword: password };
  const first = await send('POST', '/api/auth/register', anon, registration);
  const beforeLogin = await fetch(url + '/api/profile', { headers: { Cookie: anon.cookie } });
  smokeChecks.push({ id: 'SM-01', name: '注册不自动登录', status: beforeLogin.status, pass: first.status === 201 && beforeLogin.status === 401 });
  const replay = await send('POST', '/api/auth/register', anon, registration);
  record('RV-03', '注册同requestId同载荷重放', { first: 201, replay: 201, sameAccount: true },
    { first: first.status, replay: replay.status, sameAccount: first.data?.data?.accountId === replay.data?.data?.accountId },
    first.status === 201 && replay.status === 201 && first.data?.data?.accountId === replay.data?.data?.accountId);
  const login = await send('POST', '/api/auth/login', anon, { loginName: registration.loginName, password, target: 'PROFILE' });
  if (login.status !== 200) throw new Error('probe setup login failed');
  const logged = await ctx(login.cookie);
  const patch = { requestId: randomUUID(), expectedVersion: 1, nickname: '合成复核账号', avatarKey: 'DEFAULT', bio: '' };
  const updated = await send('PATCH', '/api/profile', logged, patch);
  const patchReplay = await send('PATCH', '/api/profile', logged, patch);
  record('RV-04', '资料PATCH同requestId同载荷重放', { first: 200, replay: 200, sameVersion: true },
    { first: updated.status, replay: patchReplay.status, sameVersion: updated.data?.data?.version === patchReplay.data?.data?.version },
    updated.status === 200 && patchReplay.status === 200 && updated.data?.data?.version === patchReplay.data?.data?.version);
  const accountId = first.data.data.accountId;
  await database.query("UPDATE login_sessions SET issued_at = now() - interval '31 minutes', last_seen_at = now() - interval '29 minutes' WHERE account_id = $1 AND revoked_at IS NULL", [accountId]);
  const before = await database.query('SELECT last_seen_at FROM login_sessions WHERE account_id = $1 AND revoked_at IS NULL', [accountId]);
  const profile = await fetch(url + '/api/profile', { headers: { Cookie: logged.cookie } });
  const after = await database.query('SELECT last_seen_at FROM login_sessions WHERE account_id = $1 AND revoked_at IS NULL', [accountId]);
  const refreshed = new Date(after.rows[0].last_seen_at) > new Date(before.rows[0].last_seen_at);
  record('RV-05', '有效资料访问刷新会话空闲时间', { status: 200, lastSeenRefreshed: true }, { status: profile.status, lastSeenRefreshed: refreshed }, profile.status === 200 && refreshed);
  const long = await send('POST', '/api/auth/register', await ctx(), { requestId: randomUUID(), loginName: 'a'.repeat(33), password, confirmPassword: password });
  record('RV-06', '规范允许的33字符登录名可注册', { status: 201 }, { status: long.status, code: long.data?.error?.code }, long.status === 201);
  const logout = await send('POST', '/api/auth/logout', logged, {});
  const afterLogout = await fetch(url + '/api/profile', { headers: { Cookie: logged.cookie } });
  smokeChecks.push({ id: 'SM-02', name: '登录、资料读取、退出与旧Cookie拒绝', login: login.status, profile: profile.status, logout: logout.status, staleProfile: afterLogout.status, pass: login.status === 200 && profile.status === 200 && logout.status === 204 && afterLogout.status === 401 });
  console.log(JSON.stringify({ fixedCommit: 'a25c91203680abdbe216cb74f2b92dc3f1c5a09d', recordedAt: new Date().toISOString(), environment: 'PGlite memory + localhost HTTP; synthetic only', smokeChecks, probes: records, passed: records.filter(x => x.pass).length, failed: records.filter(x => !x.pass).length }, null, 2));
  process.exitCode = records.every(x => x.pass) ? 0 : 1;
} finally {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await database.close();
}
