/**
 * Latest-main browser smoke: shipped Vite proxy + real auth + static companion entry.
 * Synthetic accounts only. No request rewrite, real model call, or private content.
 * Requires DAY3_REPO_ROOT and PLAYWRIGHT_MODULE_PATH when outside this workspace.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(here, '../../../..');
const repo = resolve(process.env.DAY3_REPO_ROOT ?? workspace);
const output = resolve(process.env.DAY3_OUTPUT_DIR ?? resolve(here, '..'));
if (!process.env.PLAYWRIGHT_MODULE_PATH) throw new Error('Set PLAYWRIGHT_MODULE_PATH to an installed playwright-core/index.mjs');
const playwrightPath = resolve(process.env.PLAYWRIGHT_MODULE_PATH);
const importFromRepo = relative => import(pathToFileURL(resolve(repo, relative)).href);

process.env.VITE_API_MODE = 'real';
process.env.VITE_CSRF_HEADER_NAME = 'X-CSRF-Token';
process.env.API_PROXY_TARGET = 'http://127.0.0.1:3000';

const [{ chromium }, { createServer }, { createApp }, { AuthService }, { parseProfileKey }, { createTestDatabase }] = await Promise.all([
  import(pathToFileURL(playwrightPath).href),
  importFromRepo('prototype/node_modules/vite/dist/node/index.js'),
  importFromRepo('backend/src/app.js'),
  importFromRepo('backend/src/services/auth-service.js'),
  importFromRepo('backend/src/security/crypto.js'),
  importFromRepo('backend/test/helpers/database.js'),
]);

const origin = 'http://127.0.0.1:5173';
const report = {
  source: 'GitHub main@6e699103ac5fb2c1cbcc74dfd1bb61d7df642fe0; changed product blobs verified',
  browser: 'local Microsoft Edge headless',
  data: 'ephemeral PGlite and synthetic account',
  requestRewrite: false,
  steps: [],
};
const database = await createTestDatabase();
const authService = new AuthService(database, { profileKey: parseProfileKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=') });
let api;
let vite;
let browser;

try {
  api = createApp({ database, authService, appOrigin: origin }).listen(3000, '127.0.0.1');
  await new Promise((yes, no) => { api.once('listening', yes); api.once('error', no); });
  vite = await createServer({
    configFile: resolve(repo, 'prototype/vite.config.js'),
    root: resolve(repo, 'prototype'),
    mode: 'development',
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
  });
  await vite.listen();
  browser = await chromium.launch({ executablePath: process.env.EDGE_EXECUTABLE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const page = await context.newPage();
  const apiResponses = [];
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/')) apiResponses.push({ path: url.pathname, status: response.status() });
  });
  await page.goto(origin, { waitUntil: 'networkidle' });
  const contextResponse = apiResponses.find(item => item.path === '/api/auth/context');
  assert.equal(contextResponse?.status, 200);
  report.steps.push({ name: 'shipped Vite config reaches backend context', status: contextResponse.status });

  const loginName = `qa_day3_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const password = `T3st!Aa${randomUUID()}`;
  await page.getByRole('button', { name: '创建账户' }).first().click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('登录名').fill(loginName);
  await dialog.getByLabel('密码', { exact: true }).fill(password);
  await dialog.getByLabel('确认密码').fill(password);
  const registration = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/register');
  await dialog.getByRole('button', { name: '创建账户' }).click();
  const registrationStatus = (await registration).status();
  assert.equal(registrationStatus, 201);
  await dialog.getByRole('heading', { name: '登录' }).waitFor();

  dialog = page.getByRole('dialog');
  await dialog.getByLabel('登录名').fill(loginName);
  await dialog.getByLabel('密码', { exact: true }).fill(password);
  const loginResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/login');
  await dialog.getByRole('button', { name: '登录', exact: true }).click();
  const loginStatus = (await loginResponse).status();
  assert.equal(loginStatus, 200);
  await dialog.waitFor({ state: 'hidden' });
  await page.locator('.state-switch').getByText(`已登录：${loginName}`, { exact: false }).waitFor();
  const profile = await page.evaluate(async () => (await fetch('/api/profile', { credentials: 'include' })).status);
  assert.equal(profile, 200);
  report.steps.push({ name: 'register, login, profile without proxy or request rewrite', registrationStatus, loginStatus, profileStatus: profile });
  await page.screenshot({ path: resolve(output, 'browser-05-main-login-success-6e69910.png'), fullPage: true });

  const beforeCompanion = apiResponses.length;
  await page.getByRole('link', { name: '陪伴交流' }).first().click();
  await page.waitForURL('**/companion.html');
  await page.waitForLoadState('networkidle');
  const companionApi = apiResponses.slice(beforeCompanion);
  report.steps.push({
    name: 'companion navigation after real login',
    urlPath: new URL(page.url()).pathname,
    pageTitle: await page.title(),
    apiResponses: companionApi,
    businessApiCalled: companionApi.some(item => /\/api\/(agent|naming-card|trainings)/.test(item.path)),
  });
  await page.screenshot({ path: resolve(output, 'browser-06-main-companion-entry-6e69910.png'), fullPage: true });

  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.locator('.state-switch').getByRole('button', { name: '退出登录' }).click();
  await page.locator('.state-switch').getByRole('button', { name: '登录账户' }).waitFor();
  const afterLogout = await page.evaluate(async () => (await fetch('/api/profile', { credentials: 'include' })).status);
  assert.equal(afterLogout, 401);
  report.steps.push({ name: 'logout invalidates profile access', profileStatusAfterLogout: afterLogout });
} catch (error) {
  report.error = { name: error.name, message: error.message };
  process.exitCode = 1;
} finally {
  await writeFile(resolve(output, 'browser-day3-main-6e69910.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  await vite?.close();
  if (api) await new Promise(done => api.close(done));
  await database.close();
}
