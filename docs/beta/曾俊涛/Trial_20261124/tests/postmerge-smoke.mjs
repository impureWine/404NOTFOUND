import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../../..');
const evidence = resolve(here, '../evidence');
const playwrightModule = process.env.PLAYWRIGHT_MODULE_PATH;
if (!playwrightModule) throw new Error('Set PLAYWRIGHT_MODULE_PATH to a Playwright ESM entry.');

const { chromium } = await import(pathToFileURL(resolve(playwrightModule)).href);
const { preview } = await import(pathToFileURL(resolve(repo, 'prototype/node_modules/vite/dist/node/index.js')).href);
const port = Number(process.env.TRIAL_FRONTEND_PORT || 4199);
const origin = `http://127.0.0.1:${port}`;
const result = {
  date: '2026-11-24 Asia/Shanghai',
  candidateSha: execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  layer: 'Vite production preview + Edge + synthetic API responses',
  backendIntegration: false,
  cases: [],
};
let server, browser;

async function installSyntheticApi(page, calls, pageErrors) {
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();

    calls.push({ method: request.method(), path: url.pathname, query: url.search });
    if (url.pathname === '/api/auth/context' && request.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { authenticated: true, csrfToken: 'synthetic-day24-csrf' } }) });
    }
    if (url.pathname === '/api/profile' && request.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { accountId: 'synthetic-day24-account', nickname: '合成测试账号' } }) });
    }
    if (url.pathname === '/api/sessions' && request.method() === 'POST') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: {
        sessionId: 'synthetic-day24-session', activityId: 'synthetic-day24-activity',
        sessionGeneration: 0, activityGeneration: 0, mode: 'LISTEN', state: 'ready',
      } }) });
    }
    if (url.pathname === '/api/records' && request.method() === 'GET') {
      const items = url.searchParams.get('kind') === 'CONVERSATION'
        ? [{ id: 'synthetic-cleared-record', kind: 'CONVERSATION', version: 1, title: '合成已清除记录' }]
        : [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { items, nextCursor: null } }) });
    }
    if (url.pathname === '/api/records/synthetic-cleared-record' && request.method() === 'GET') {
      return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }) });
    }
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNEXPECTED_SYNTHETIC_REQUEST', message: 'Synthetic API did not expect this request.' } }) });
  });
}

try {
  await mkdir(evidence, { recursive: true });
  server = await preview({
    configFile: resolve(repo, 'prototype/vite.config.js'),
    root: resolve(repo, 'prototype'),
    preview: { host: '127.0.0.1', port, strictPort: true },
  });
  browser = await chromium.launch({
    executablePath: process.env.EDGE_EXECUTABLE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
  });

  const desktop = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  const desktopCalls = [], pageErrors = [], failedAssets = [];
  desktop.on('response', response => {
    if (new URL(response.url()).origin === origin && ['document', 'script', 'stylesheet', 'image', 'font'].includes(response.request().resourceType()) && response.status() >= 400) {
      failedAssets.push({ path: new URL(response.url()).pathname, status: response.status() });
    }
  });
  await installSyntheticApi(desktop, desktopCalls, pageErrors);
  const homeResponse = await desktop.goto(origin, { waitUntil: 'domcontentloaded' });
  assert.equal(homeResponse.status(), 200);
  await desktop.getByRole('heading', { name: '首页', level: 1 }).waitFor();
  await desktop.screenshot({ path: resolve(evidence, '01-home-desktop.png'), fullPage: true });
  result.cases.push({ name: 'built production entry mounts the current React application', passed: true });

  await desktop.evaluate(() => { location.hash = '#companion'; });
  await desktop.getByRole('heading', { name: '陪伴交流', level: 1 }).waitFor();
  await desktop.getByRole('button', { name: '选择本人已保存的对话' }).click();
  const savedRecord = desktop.getByLabel('本轮携带：合成已清除记录');
  await savedRecord.waitFor();
  await savedRecord.check();
  await desktop.getByLabel('本次输入').fill('合成复测输入：请勿提交给模型。');
  await desktop.getByLabel('同意将本次明确选择的内容发送给模型处理').check();
  await desktop.getByRole('button', { name: '发送', exact: true }).click();
  const staleMessage = desktop.getByRole('alert');
  await staleMessage.waitFor();
  assert.match(await staleMessage.innerText(), /历史内容已不可用/);
  assert.equal(await savedRecord.count(), 0, 'cleared selection should be removed from the page');
  assert.equal(desktopCalls.some(call => call.path === '/api/consents'), false, 'stale context must not create consent');
  assert.equal(desktopCalls.some(call => call.path === '/api/agent/tasks'), false, 'stale context must not create an AI task');
  assert.equal(await desktop.getByRole('log').innerText(), '', 'no task result or cleared body should be rendered');
  await desktop.screenshot({ path: resolve(evidence, '02-cleared-context-blocked.png'), fullPage: true });
  result.cases.push({ name: 'cleared selected context is removed and blocks consent/task creation', passed: true });

  const mobile = await browser.newPage({ viewport: { width: 320, height: 844 } });
  const mobileCalls = [];
  await installSyntheticApi(mobile, mobileCalls, pageErrors);
  await mobile.goto(`${origin}/#home`, { waitUntil: 'domcontentloaded' });
  await mobile.getByRole('heading', { name: '首页', level: 1 }).waitFor();
  const menu = mobile.getByRole('button', { name: '切换导航' });
  await menu.click();
  assert.equal(await menu.getAttribute('aria-expanded'), 'true');
  await mobile.keyboard.press('Escape');
  assert.equal(await menu.getAttribute('aria-expanded'), 'false');
  assert.equal(await menu.evaluate(element => element === document.activeElement), true, 'Escape returns focus to the menu toggle');
  await mobile.evaluate(() => { location.hash = '#calendar'; });
  await mobile.getByRole('heading', { name: '情绪日历', level: 1 }).waitFor();
  const width = await mobile.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }));
  assert.ok(width.document <= width.viewport + 1, `unexpected horizontal overflow at 320px: ${JSON.stringify(width)}`);
  await mobile.screenshot({ path: resolve(evidence, '03-calendar-mobile-320.png'), fullPage: true });
  result.cases.push({ name: '320px calendar and mobile navigation keyboard recovery', passed: true, detail: width });

  assert.deepEqual(failedAssets, [], 'local production assets should load without errors');
  assert.deepEqual(pageErrors, [], 'browser should not report uncaught page errors');
  result.checks = {
    backendResponsesSynthetic: true,
    externalRequestsBlocked: true,
    failedLocalAssets: failedAssets,
    pageErrors,
    staleRecordReadCount: desktopCalls.filter(call => call.path === '/api/records/synthetic-cleared-record').length,
    staleRecordConsentOrTaskRequests: desktopCalls.filter(call => ['/api/consents', '/api/agent/tasks'].includes(call.path)).length,
  };
} catch (error) {
  result.error = { name: error.name, message: error.message };
  process.exitCode = 1;
} finally {
  await writeFile(resolve(evidence, 'frontend-final-smoke.json'), JSON.stringify(result, null, 2));
  await browser?.close();
  await server?.close();
}
