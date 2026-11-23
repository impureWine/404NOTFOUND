import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const playwrightPath = process.env.PLAYWRIGHT_MODULE_PATH;
if (!playwrightPath) throw new Error('Set PLAYWRIGHT_MODULE_PATH to a Playwright Core ESM entry.');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, '../../../../..');
const prototype = path.join(root, 'prototype');
const port = Number(process.env.DAY4_BROWSER_PORT || 5191);
const vite = spawn(process.execPath, [path.join(prototype, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: prototype, windowsHide: true, stdio: 'ignore',
});

let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.equal(ready, true, 'Vite did not become ready');

  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('console', message => { if (message.type() === 'error') console.error(`[browser:error] ${message.text()}`); });
  page.on('pageerror', error => console.error(`[pageerror] ${error.stack}`));

  let account = 'account-a';
  let taskIndex = 0;
  const tasks = new Map();
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();
    const data = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ data: value }) });
    if (!pathname.startsWith('/api/')) return route.continue();

    if (pathname === '/api/auth/context' && method === 'GET') return data({ authenticated: Boolean(account), csrfToken: 'SYNTHETIC-CSRF' });
    if (pathname === '/api/auth/profile' || pathname === '/api/profile') return data({ nickname: account || 'Guest', loginName: account || 'guest', version: 1, bio: '', avatarKey: 'DEFAULT' });
    if (pathname === '/api/auth/login' && method === 'POST') { account = 'account-b'; return data({ accountId: account }); }
    if (pathname === '/api/auth/logout' && method === 'POST') { account = null; return route.fulfill({ status: 204 }); }
    if (pathname === '/api/profile/summary') return data({ counts: {} });
    if (pathname === '/api/preferences') return data({ version: 1, offerHistorySave: false });
    if (pathname === '/api/capabilities') return data({ entryPoint: 'WEB', modelConfigured: false, searchProvider: 'SERPAPI', wechatConfigured: false });
    if (pathname === '/api/consents' && method === 'POST') return data({ consentId: 'synthetic-consent' }, 201);
    if (pathname === '/api/sessions' && method === 'POST') return data({ sessionId: `session-${account}`, activityId: `activity-${account}`, sessionGeneration: 0, activityGeneration: 0, state: 'ready' }, 201);
    if (/^\/api\/sessions\/[^/]+\/actions$/.test(pathname)) return data({ sessionId: `session-${account}`, activityId: `activity-${account}`, sessionGeneration: 1, activityGeneration: 1, state: 'ended' });
    if (pathname === '/api/search/tasks' && method === 'POST') {
      const requestBody = request.postDataJSON();
      const id = requestBody.requestId;
      taskIndex += 1;
      tasks.set(id, { pending: requestBody.question.startsWith('cancel-'), account, index: taskIndex });
      return data({ requestId: id, status: 'pending' }, 202);
    }
    if (/^\/api\/search\/tasks\/[^/]+\/cancel$/.test(pathname) && method === 'POST') return data({ status: 'cancelled' });
    if (pathname.startsWith('/api/search/tasks/') && method === 'GET') {
      const id = pathname.split('/').at(-1);
      const task = tasks.get(id);
      if (!task) return data({ code: 'NOT_FOUND', message: 'Task not found' }, 404);
      if (task.pending) return data({ requestId: id, status: 'pending' });
      return data({ requestId: id, status: 'completed', uncertaintyNote: `合成不确定性说明 ${task.account}`, partial: false, hasConflict: false, sources: [{ id: `source-${task.account}`, title: `Synthetic source ${task.account}`, url: 'https://example.org/source', publisher: 'Example', sourceTier: 'S2', quality: 'UNKNOWN', publishedAt: null, retrievedAt: '2026-11-17T00:00:00.000Z', verificationState: 'PARTIAL', snippet: 'Synthetic excerpt' }] });
    }
    return data({ items: [], nextCursor: null });
  });

  await page.goto(`http://127.0.0.1:${port}/#search`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '信息查询', exact: true, level: 2 }).waitFor();
  const submitQuery = async question => {
    await page.getByRole('textbox', { name: '具体问题', exact: true }).fill(question);
    await page.getByRole('checkbox', { name: '同意将本次问题提交给 SerpAPI，用于 Bing 搜索', exact: true }).check();
    await page.getByRole('button', { name: '查询', exact: true }).click();
  };

  await submitQuery('account-a-question');
  await page.getByRole('link', { name: 'Synthetic source account-a', exact: true }).waitFor();
  assert.ok((await page.getByRole('note').innerText()).includes('合成不确定性说明 account-a'));

  await page.evaluate(() => { window.location.hash = '#settings'; });
  await page.getByRole('heading', { name: '个人主页与隐私设置', exact: true, level: 2 }).waitFor();
  await page.getByRole('button', { name: '退出登录', exact: true }).first().click();
  await page.getByRole('button', { name: '登录账户', exact: true }).waitFor();
  await page.getByRole('button', { name: '登录账户', exact: true }).click();
  await page.locator('dialog input[name="loginName"]').fill('synthetic-b');
  await page.locator('dialog input[name="password"]').fill('synthetic-password');
  await page.locator('dialog button[type="submit"]').click();
  await page.getByText('登录成功，身份与个人资料已从认证服务读取。', { exact: true }).waitFor();
  await page.evaluate(() => { window.location.hash = '#search'; });
  await page.getByRole('heading', { name: '信息查询', exact: true, level: 2 }).waitFor();
  assert.equal(await page.getByText('Synthetic source account-a', { exact: true }).count(), 0, 'account A result remained after switching identity');

  await submitQuery('account-b-question');
  await page.getByRole('link', { name: 'Synthetic source account-b', exact: true }).waitFor();
  await submitQuery('cancel-account-b-query');
  await page.getByRole('button', { name: '取消查询', exact: true }).waitFor();
  await page.getByRole('button', { name: '取消查询', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '服务器取消状态待确认' }).waitFor();
  await new Promise(resolve => setTimeout(resolve, 800));
  assert.equal(await page.getByText('Synthetic source account-b', { exact: true }).count(), 0, 'cancelled query result remained visible');
  assert.equal((await page.getByRole('textbox', { name: '具体问题', exact: true }).inputValue()), 'cancel-account-b-query');
  console.log(JSON.stringify({ accountSwitchClearedOldResult: true, cancelClearedResult: true, cancelMessage: await page.getByRole('alert').innerText(), syntheticTasks: taskIndex }, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close();
  vite.kill();
}
