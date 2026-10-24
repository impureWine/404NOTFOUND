import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '../../day2-browser-tools/node_modules/playwright-core/index.mjs';
import { createServer } from 'vite';
import baseViteConfig from './vite.config.js';
import { createApp } from '../backend/src/app.js';
import { parseProfileKey } from '../backend/src/security/crypto.js';
import { AuthService } from '../backend/src/services/auth-service.js';
import { createTestDatabase } from '../backend/test/helpers/database.js';

const outputDir = process.env.TEST_OUTPUT_DIR || process.cwd();
const appOrigin = 'http://127.0.0.1:5173';
const report = { source: 'GitHub main@230293d text files, blob hashes verified', browser: 'local Microsoft Edge headless', data: 'ephemeral PGlite, synthetic accounts only', phases: [] };
process.env.VITE_API_MODE = 'real';
process.env.VITE_CSRF_HEADER_NAME = 'X-CSRF-Token';

const database = await createTestDatabase();
const authService = new AuthService(database, { profileKey: parseProfileKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=') });
const api = createApp({ database, authService, appOrigin }).listen(3000, '127.0.0.1');
await new Promise((ready, fail) => { api.once('listening', ready); api.once('error', fail); });

let vite;
let browser;
async function startVite(proxy) {
  vite = await createServer({
    ...baseViteConfig,
    configFile: false,
    server: {
      ...baseViteConfig.server,
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      ...(proxy ? { proxy: { '/api': 'http://127.0.0.1:3000' } } : {}),
    },
  });
  await vite.listen();
}
async function register(page, loginName, password) {
  await page.getByRole('button', { name: '创建账户' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('登录名').fill(loginName);
  await dialog.getByLabel('密码', { exact: true }).fill(password);
  await dialog.getByLabel('确认密码').fill(password);
  const responsePromise = page.waitForResponse(r => new URL(r.url()).pathname === '/api/auth/register');
  await dialog.getByRole('button', { name: '创建账户' }).click();
  const response = await responsePromise;
  await dialog.getByRole('heading', { name: '登录' }).waitFor();
  return response.status();
}
async function login(page, loginName, password) {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('登录名').fill(loginName);
  await dialog.getByLabel('密码', { exact: true }).fill(password);
  const responsePromise = page.waitForResponse(r => new URL(r.url()).pathname === '/api/auth/login');
  await dialog.getByRole('button', { name: '登录', exact: true }).click();
  return (await responsePromise).status();
}
async function conditionalTargetRewrite(page) {
  await page.route('**/api/auth/login', async route => {
    const body = route.request().postDataJSON();
    await route.continue({ postData: JSON.stringify({ ...body, target: 'HOME' }) });
  });
}

try {
  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  await startVite(false);
  const baselinePage = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  const baselineApi = [];
  baselinePage.on('response', r => { if (new URL(r.url()).pathname.startsWith('/api/')) baselineApi.push({ path: new URL(r.url()).pathname, status: r.status(), contentType: r.headers()['content-type'] }); });
  await baselinePage.goto(appOrigin, { waitUntil: 'networkidle' });
  const baselineBody = await baselinePage.locator('body').innerText();
  report.phases.push({ name: 'shipped Vite config, real mode', api: baselineApi, authUnavailableVisible: baselineBody.includes('认证服务暂不可用') });
  await baselinePage.screenshot({ path: resolve(outputDir, 'browser-01-original-no-proxy.png'), fullPage: true });
  await baselinePage.close();
  await vite.close();
  vite = null;

  await startVite(true);
  const contextA = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const pageA = await contextA.newPage();
  await pageA.goto(appOrigin, { waitUntil: 'networkidle' });
  const nameA = `qa_a_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const passwordA = `T3st!Aa${randomUUID()}`;
  const registerAStatus = await register(pageA, nameA, passwordA);
  const shippedLoginStatus = await login(pageA, nameA, passwordA);
  const shippedLoginError = await pageA.getByRole('alert').first().innerText();
  report.phases.push({ name: 'test-only proxy, unmodified application login', registerStatus: registerAStatus, loginStatus: shippedLoginStatus, loginError: shippedLoginError, privateVisible: (await pageA.locator('body').innerText()).includes(`已登录：${nameA}`) });
  await pageA.screenshot({ path: resolve(outputDir, 'browser-02-original-login-rejected.png'), fullPage: true });

  await conditionalTargetRewrite(pageA);
  const fixedLoginAStatus = await login(pageA, nameA, passwordA);
  await pageA.getByRole('dialog').waitFor({ state: 'hidden' });
  const aState = await pageA.locator('.state-switch').innerText();
  const aProfile = await pageA.evaluate(async () => { const r = await fetch('/api/profile', { credentials: 'include' }); return { status: r.status, data: (await r.json()).data }; });
  await pageA.screenshot({ path: resolve(outputDir, 'browser-03-conditional-account-a.png'), fullPage: true });

  const contextB = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const pageB = await contextB.newPage();
  await conditionalTargetRewrite(pageB);
  await pageB.goto(appOrigin, { waitUntil: 'networkidle' });
  const nameB = `qa_b_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const passwordB = `T3st!Bb${randomUUID()}`;
  const registerBStatus = await register(pageB, nameB, passwordB);
  const fixedLoginBStatus = await login(pageB, nameB, passwordB);
  await pageB.getByRole('dialog').waitFor({ state: 'hidden' });
  const bState = await pageB.locator('.state-switch').innerText();
  const bProfile = await pageB.evaluate(async () => { const r = await fetch('/api/profile', { credentials: 'include' }); return { status: r.status, data: (await r.json()).data }; });
  await pageB.screenshot({ path: resolve(outputDir, 'browser-04-conditional-account-b.png'), fullPage: true });

  await pageA.locator('.state-switch').getByRole('button', { name: '退出登录' }).click();
  await pageA.locator('.state-switch').getByRole('button', { name: '登录账户' }).waitFor();
  const afterLogoutA = await pageA.evaluate(async () => (await fetch('/api/profile', { credentials: 'include' })).status);
  const stillLoggedB = await pageB.evaluate(async () => (await fetch('/api/profile', { credentials: 'include' })).status);
  report.phases.push({
    name: 'conditional target rewrite only; original app source unchanged',
    rewrite: "login request target 'home' -> 'HOME' at browser route",
    accountA: { registerStatus: registerAStatus, loginStatus: fixedLoginAStatus, stateContainsOwnName: aState.includes(nameA), profileStatus: aProfile.status, profileNicknameMatches: aProfile.data?.nickname === nameA },
    accountB: { registerStatus: registerBStatus, loginStatus: fixedLoginBStatus, stateContainsOwnName: bState.includes(nameB), profileStatus: bProfile.status, profileNicknameMatches: bProfile.data?.nickname === nameB },
    isolation: { aDidNotShowB: !aState.includes(nameB), bDidNotShowA: !bState.includes(nameA), distinctProfiles: aProfile.data?.nickname !== bProfile.data?.nickname, afterLogoutA, stillLoggedB },
  });
} catch (error) {
  report.error = { name: error.name, message: error.message };
  process.exitCode = 1;
} finally {
  await writeFile(resolve(outputDir, 'browser-day2-integrated-230293d.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser?.close();
  await vite?.close();
  await new Promise(resolveClose => api.close(resolveClose));
  await database.close();
}
