/** Browser UI for real authentication; record actions use explicit same-origin fetch, not product UI buttons. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(process.env.DAY6_REPO_ROOT ?? resolve(here, '../../../../..'));
const out = resolve(process.env.DAY6_OUTPUT_DIR ?? resolve(here, '..'));
const sourceSha = process.env.DAY6_SOURCE_SHA ?? '19ad7eb';
if (!process.env.PLAYWRIGHT_MODULE_PATH) throw new Error('Set PLAYWRIGHT_MODULE_PATH to playwright-core/index.mjs');
const imported = relative => import(pathToFileURL(resolve(repo, relative)).href);
const [{ chromium }, { createServer }, { createApp }, { AuthService }, { ConsentService }, { RecordService }, { RecordRepository }, { parseProfileKey }, { createTestDatabase }] = await Promise.all([
  import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE_PATH)).href),
  imported('prototype/node_modules/vite/dist/node/index.js'), imported('backend/src/app.js'),
  imported('backend/src/services/auth-service.js'), imported('backend/src/services/consent-service.js'),
  imported('backend/src/services/record-service.js'), imported('backend/src/repositories/record-repository.js'),
  imported('backend/src/security/crypto.js'), imported('backend/test/helpers/database.js'),
]);
process.env.VITE_API_MODE = 'real';
process.env.VITE_CSRF_HEADER_NAME = 'X-CSRF-Token';
const apiPort = Number(process.env.DAY6_API_PORT ?? 3012);
const webPort = Number(process.env.DAY6_WEB_PORT ?? 5190);
if (![apiPort, webPort].every(port => Number.isInteger(port) && port >= 1024 && port <= 65535) || apiPort === webPort) {
  throw new Error('DAY6_API_PORT and DAY6_WEB_PORT must be distinct valid local ports');
}
process.env.API_PROXY_TARGET = `http://127.0.0.1:${apiPort}`;
const origin = `http://127.0.0.1:${webPort}`;
const key = parseProfileKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
const report = { source: `main@${sourceSha}`, date: '2026-10-28 Asia/Shanghai', layer: 'real UI registration/login/logout; QA script directly calls record API from browser', uiRecordBinding: false, syntheticAccounts: true, requestRewrite: false, steps: [] };
let database, api, vite, browser;
try {
  database = await createTestDatabase();
  const authService = new AuthService(database, { profileKey: key });
  const consentService = new ConsentService();
  const recordService = new RecordService(new RecordRepository(database), { encryptionKey: key, consentService });
  api = createApp({ database, authService, consentService, recordService, appOrigin: origin }).listen(apiPort, '127.0.0.1');
  await new Promise((yes, no) => { api.once('listening', yes); api.once('error', no); });
  vite = await createServer({ configFile: resolve(repo, 'prototype/vite.config.js'), root: resolve(repo, 'prototype'), mode: 'development', server: { host: '127.0.0.1', port: webPort, strictPort: true } });
  await vite.listen();
  browser = await chromium.launch({ executablePath: process.env.EDGE_EXECUTABLE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const page = await context.newPage();
  const apiResponses = [];
  page.on('response', response => { const url = new URL(response.url()); if (url.pathname.startsWith('/api/')) apiResponses.push({ path: url.pathname, status: response.status() }); });
  await page.goto(origin, { waitUntil: 'networkidle' });
  async function registerAndLogin(suffix) {
    const name = `d4_${suffix}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const password = `Synthetic!${randomUUID()}`;
    await page.getByRole('button', { name: '创建账户' }).first().click();
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
    await page.locator('.state-switch').getByText(`已登录：${name}`, { exact: false }).waitFor();
    return name;
  }
  await registerAndLogin('a');
  const first = await page.evaluate(async () => {
    const context = await (await fetch('/api/auth/context', { credentials: 'include' })).json();
    const csrf = context.data.csrfToken;
    const post = async (path, body) => { const response = await fetch(path, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(body) }); return { status: response.status, data: (await response.json()).data }; };
    const payload = { kind: 'CONVERSATION', content: { title: 'synthetic:browser-Day6-title', body: 'synthetic:browser-Day6-body' } };
    const consent = await post('/api/consents', { requestId: crypto.randomUUID(), purpose: 'SAVE', operation: 'RECORD_CREATE', payload });
    const saved = await post('/api/records', { requestId: crypto.randomUUID(), consentId: consent.data.consentId, ...payload });
    const listResponse = await fetch('/api/records', { credentials: 'include' });
    const list = await listResponse.json();
    const detail = await fetch(`/api/records/${saved.data.id}`, { credentials: 'include' });
    const detailData = (await detail.json()).data;
    return { consentStatus: consent.status, saveStatus: saved.status, listStatus: listResponse.status, listCount: list.data.items.length, detailStatus: detail.status, readableBody: JSON.stringify(detailData).includes(payload.content.body), ciphertextExposed: Boolean(detailData?.titleCiphertext || detailData?.details?.messages?.[0]?.contentCiphertext), recordId: saved.data.id };
  });
  assert.deepEqual([first.consentStatus, first.saveStatus, first.listStatus, first.listCount, first.detailStatus], [201, 201, 200, 1, 200]);
  report.steps.push({ name: 'A login UI, then QA same-origin API consent/save/list/detail', ...first });
  await page.screenshot({ path: resolve(out, 'day6-browser-account-a-api-assisted.png'), fullPage: true });
  await page.locator('.state-switch').getByRole('button', { name: '退出登录' }).click();
  await page.locator('.state-switch').getByRole('button', { name: '登录账户' }).waitFor();
  const loggedOut = await page.evaluate(async () => (await fetch('/api/records', { credentials: 'include' })).status);
  assert.equal(loggedOut, 401);
  report.steps.push({ name: 'A logout', recordsStatus: loggedOut });
  await registerAndLogin('b');
  const second = await page.evaluate(async recordId => {
    const list = await fetch('/api/records', { credentials: 'include' });
    const data = await list.json();
    const denied = await fetch(`/api/records/${recordId}`, { credentials: 'include' });
    return { listStatus: list.status, listCount: data.data.items.length, readAStatus: denied.status };
  }, first.recordId);
  assert.deepEqual(second, { listStatus: 200, listCount: 0, readAStatus: 404 });
  report.steps.push({ name: 'B login UI and QA API isolation', ...second });
  await page.screenshot({ path: resolve(out, 'day6-browser-account-b-api-assisted.png'), fullPage: true });
  report.apiResponses = apiResponses;
} catch (error) {
  report.error = { name: error.name, message: error.message };
  process.exitCode = 1;
} finally {
  await writeFile(resolve(out, `day6-browser-api-assisted-20261028-main${sourceSha}.json`), JSON.stringify(report, null, 2));
  await browser?.close();
  await vite?.close();
  if (api) await new Promise(yes => api.close(yes));
  await database?.close();
}



