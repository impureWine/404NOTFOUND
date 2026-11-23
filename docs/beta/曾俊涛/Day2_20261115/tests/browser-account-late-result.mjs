import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../../..');
const out = resolve(here, '../evidence');
const playwrightPath = process.env.PLAYWRIGHT_MODULE_PATH;
if (!playwrightPath) throw new Error('Set PLAYWRIGHT_MODULE_PATH to playwright-core/index.mjs');
const { chromium } = await import(pathToFileURL(resolve(playwrightPath)).href);
const { createServer } = await import(pathToFileURL(resolve(repo, 'prototype/node_modules/vite/dist/node/index.js')).href);
const [{ createApp }, { AuthService }, { ConsentService }, { TaskService }, { parseProfileKey }, { createTestDatabase }] = await Promise.all([
  import(pathToFileURL(resolve(repo, 'backend/src/app.js')).href),
  import(pathToFileURL(resolve(repo, 'backend/src/services/auth-service.js')).href),
  import(pathToFileURL(resolve(repo, 'backend/src/services/consent-service.js')).href),
  import(pathToFileURL(resolve(repo, 'backend/src/services/task-service.js')).href),
  import(pathToFileURL(resolve(repo, 'backend/src/security/crypto.js')).href),
  import(pathToFileURL(resolve(repo, 'backend/test/helpers/database.js')).href),
]);

process.env.VITE_API_MODE = 'real';
process.env.VITE_CSRF_HEADER_NAME = 'X-CSRF-Token';
const origin = 'http://127.0.0.1:5177';
const report = { date: '2026-11-15 Asia/Shanghai', candidate: process.env.DAY2_SOURCE_SHA, layer: 'real React page + isolated PGlite + synthetic deferred model', steps: [] };
async function waitForModelRelease(previous) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (typeof releaseModel === 'function' && releaseModel !== previous) return;
    await new Promise(resolveWait => setTimeout(resolveWait, 20));
  }
  throw new Error('Synthetic model adapter did not start within 2 seconds');
}
let database, api, vite, browser;
let releaseModel, startedModel;
const modelStarted = new Promise(resolveStarted => { startedModel = resolveStarted; });
try {
  await mkdir(out, { recursive: true });
  database = await createTestDatabase();
  const authService = new AuthService(database, { profileKey: parseProfileKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=') });
  const consentService = new ConsentService();
  const modelAdapter = { respond() { startedModel(); return new Promise(resolveReply => { releaseModel = resolveReply; }); } };
  const taskService = new TaskService({ modelAdapter, consentService });
  api = createApp({ database, authService, consentService, taskService, modelAdapter, appOrigin: origin }).listen(0, '127.0.0.1');
  await new Promise((ready, fail) => { api.once('listening', ready); api.once('error', fail); });
  const apiOrigin = `http://127.0.0.1:${api.address().port}`;
  vite = await createServer({ configFile: false, root: resolve(repo, 'prototype'), server: { host: '127.0.0.1', port: 5177, strictPort: true, proxy: { '/api': { target: apiOrigin, changeOrigin: false } } } });
  await vite.listen();
  browser = await chromium.launch({ executablePath: process.env.EDGE_EXECUTABLE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  page.setDefaultTimeout(10000);
  await page.goto(origin, { waitUntil: 'networkidle' });
  report.initialBody = (await page.locator('body').innerText()).slice(0, 600);
  await page.screenshot({ path: resolve(out, 'browser-initial.png'), fullPage: true });

  async function registerAndLogin(label) {
    const name = `beta_d2_${label}_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
    const password = `Synthetic!${randomUUID()}`;
    await page.getByRole('button', { name: '注册', exact: true }).first().click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('登录名').fill(name);
    await dialog.getByLabel('密码', { exact: true }).fill(password);
    await dialog.getByLabel('确认密码').fill(password);
    const registration = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/register');
    await dialog.getByRole('button', { name: '创建账户' }).click();
    assert.equal((await registration).status(), 201);
    await dialog.getByRole('heading', { name: '登录' }).waitFor();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('登录名').fill(name);
    await dialog.getByLabel('密码', { exact: true }).fill(password);
    const login = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/login');
    await dialog.getByRole('button', { name: '登录', exact: true }).click();
    assert.equal((await login).status(), 200);
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: '退出登录' }).waitFor();
    return name;
  }

  await registerAndLogin('a');
  await page.evaluate(() => { location.hash = '#companion'; });
  await page.getByRole('heading', { name: '陪伴交流', level: 2 }).waitFor();
  await page.getByLabel('本次输入').fill('synthetic:换号前的在途内容');
  await page.getByLabel('同意将本次明确选择的内容发送给模型处理').check();
  const accepted = page.waitForResponse(response => new URL(response.url()).pathname === '/api/agent/tasks' && response.request().method() === 'POST');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  const acceptedResponse = await accepted;
  assert.equal(acceptedResponse.status(), 202);
  const oldRequestId = acceptedResponse.request().postDataJSON().requestId;
  await Promise.race([
    modelStarted,
    new Promise((_, rejectStart) => setTimeout(() => rejectStart(new Error('Synthetic model adapter did not start within 5 seconds')), 5000)),
  ]);
  report.steps.push({ name: 'A starts pending task in real page', acceptedStatus: 202, requestId: oldRequestId });

  await page.getByRole('button', { name: '退出登录' }).click();
  await page.getByRole('button', { name: '注册', exact: true }).waitFor();
  await registerAndLogin('b');
  releaseModel({ status: 'success', result: { content: 'synthetic:换号后迟到的旧回复', suggested_action: 'STAY', citations: [], uncertainty: null } });
  await new Promise(resolve => setImmediate(resolve));
  const oldTask = taskService.agentTasks.get(oldRequestId);
  const readFromB = await page.evaluate(async requestId => (await fetch(`/api/agent/tasks/${requestId}`, { credentials: 'include' })).status, oldRequestId);
  const oldReplyVisible = await page.getByText('synthetic:换号后迟到的旧回复').count();
  assert.equal(oldTask?.status, 'cancelled');
  assert.equal(oldTask?.result, undefined);
  assert.equal(readFromB, 404);
  assert.equal(oldReplyVisible, 0);
  report.steps.push({ name: 'B login after A logout; delayed result rejected', oldTaskStatus: oldTask.status, oldTaskHasResult: Boolean(oldTask.result), readFromB, oldReplyVisible });
  await page.screenshot({ path: resolve(out, 'browser-account-b-after-late-result.png'), fullPage: true });

  const previousRelease = releaseModel;
  await page.getByLabel('本次输入').fill('synthetic:手动取消前的在途内容');
  await page.getByLabel('同意将本次明确选择的内容发送给模型处理').check();
  const secondAccepted = page.waitForResponse(response => new URL(response.url()).pathname === '/api/agent/tasks' && response.request().method() === 'POST');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  const secondResponse = await secondAccepted;
  assert.equal(secondResponse.status(), 202);
  const cancelledRequestId = secondResponse.request().postDataJSON().requestId;
  await waitForModelRelease(previousRelease);
  await page.getByRole('button', { name: '停止本次请求' }).click();
  releaseModel({ status: 'success', result: { content: 'synthetic:手动取消后迟到的回复', suggested_action: 'STAY', citations: [], uncertainty: null } });
  for (let attempt = 0; attempt < 50 && taskService.agentTasks.get(cancelledRequestId)?.status !== 'cancelled'; attempt += 1) {
    await new Promise(resolveWait => setTimeout(resolveWait, 20));
  }
  const cancelledTask = taskService.agentTasks.get(cancelledRequestId);
  const cancelledReplyVisible = await page.getByText('synthetic:手动取消后迟到的回复').count();
  assert.equal(cancelledTask?.status, 'cancelled');
  assert.equal(cancelledTask?.result, undefined);
  assert.equal(cancelledReplyVisible, 0);
  report.steps.push({ name: 'B cancels pending task; delayed result rejected', taskStatus: cancelledTask.status, hasResult: Boolean(cancelledTask.result), lateReplyVisible: cancelledReplyVisible });
  await page.screenshot({ path: resolve(out, 'browser-after-manual-cancel.png'), fullPage: true });

  const serverLogout = await page.evaluate(async () => {
    const context = await (await fetch('/api/auth/context', { credentials: 'include' })).json();
    return (await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': context.data.csrfToken },
    })).status;
  });
  assert.equal(serverLogout, 204);
  await page.evaluate(() => {
    window.__day2AuthRequiredEvents = 0;
    window.addEventListener('404:auth-required', () => { window.__day2AuthRequiredEvents += 1; }, { once: true });
  });
  const staleRead = page.waitForResponse(response => ['/api/profile', '/api/preferences', '/api/profile/summary'].includes(new URL(response.url()).pathname) && response.request().method() === 'GET');
  await page.evaluate(() => { location.hash = '#settings'; });
  const staleReadStatus = (await staleRead).status();
  const authRequiredEvents = await page.evaluate(() => window.__day2AuthRequiredEvents);
  report.steps.push({ name: 'Private API stale read observed', staleReadStatus, authRequiredEvents });
  assert.equal(staleReadStatus, 401);
  assert.equal(authRequiredEvents, 1);
  await page.getByText('登录状态已失效，本机私密界面已清理。请重新登录后继续。').waitFor();
  await page.getByRole('button', { name: '登录', exact: true }).waitFor();
  report.steps.push({ name: 'Private API 401 clears stale page identity', serverLogout, reloginVisible: true });
  await page.screenshot({ path: resolve(out, 'browser-expired-session-recovery.png'), fullPage: true });
} catch (error) {
  report.error = { name: error.name, message: error.message };
  process.exitCode = 1;
} finally {
  await writeFile(resolve(out, 'browser-account-late-result.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  await vite?.close();
  if (api) await new Promise(resolveClose => api.close(resolveClose));
  await database?.close();
}
