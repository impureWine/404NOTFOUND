import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const modulePath = process.env.PLAYWRIGHT_MODULE_PATH;
if (!modulePath || !fs.existsSync(modulePath)) throw new Error('请设置 PLAYWRIGHT_MODULE_PATH 为本机 playwright-core/index.mjs 的绝对路径');
const { chromium } = await import(pathToFileURL(modulePath).href);
const output = path.join(root, 'docs/beta/曾俊涛/Trial_20261123/evidence');
fs.mkdirSync(output, { recursive: true });
const sourceCommit = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
const port = 5203;
const vite = spawn(process.execPath, [path.join(root, 'prototype/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: path.join(root, 'prototype'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let viteLog = '';
vite.stdout.on('data', chunk => viteLog += chunk);
vite.stderr.on('data', chunk => viteLog += chunk);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
let browser;

async function open(mode) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: 'Asia/Shanghai' });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  const state = { tasks: 0, cancel: [], cancelResponseStatus: null, requests: [], pageErrors: [] };
  page.on('pageerror', error => state.pageErrors.push(String(error)));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (!pathname.startsWith('/api/')) return route.continue();
    state.requests.push({ method: request.method(), path: pathname });
    const reply = async (data, status = 200) => {
      try { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status < 400 ? { data } : { error: data }) }); }
      catch { /* The browser may abort an in-flight polling request. */ }
    };
    if (pathname === '/api/auth/context') return reply({ authenticated: true, csrfToken: 'SYNTHETIC-ONLY' });
    if (pathname === '/api/profile') return reply({ nickname: '合成走查账号' });
    if (pathname === '/api/sessions') return reply({ sessionId: 'synthetic-session', activityId: 'synthetic-activity', sessionGeneration: 0, activityGeneration: 0, state: 'ready' });
    if (pathname === '/api/consents') return reply({ consentId: 'synthetic-consent' });
    if (pathname.endsWith('/actions')) return reply({ state: 'ended' });
    if (pathname.endsWith('/cancel')) {
      state.cancel.push({ path: pathname, body: request.postDataJSON() });
      state.cancelResponseStatus = mode === 'cancel-unknown' ? 503 : 200;
      return mode === 'cancel-unknown' ? reply({ code: 'SERVICE_UNAVAILABLE', message: '合成取消失败' }, 503) : reply({ status: 'cancelled' });
    }
    if (pathname === '/api/search/tasks' && request.method() === 'POST') { state.tasks++; return reply({ status: 'pending' }); }
    if (pathname.startsWith('/api/search/tasks/') && request.method() === 'GET') {
      if (mode === 'cancel-unknown') return reply({ status: 'pending' });
      return reply({ status: 'completed', requestId: `synthetic-${state.tasks}`, sources: state.tasks === 1 ? [] : [{ id: 'source-2', title: '调整问题后的合成来源', url: 'https://example.org/source', publisher: '合成发布者', snippet: '仅用于 U04 走查', retrievedAt: '2026-11-23T02:00:00Z', verificationState: 'PARTIAL' }] });
    }
    return reply({ items: [], nextCursor: null });
  });
  await page.goto(`http://127.0.0.1:${port}/#search`);
  try { await page.getByRole('heading', { name: '信息查询', level: 2 }).waitFor(); }
  catch (error) {
    fs.writeFileSync(path.join(output, 'startup-diagnostic.json'), JSON.stringify({ url: page.url(), body: (await page.locator('body').innerText()).slice(0, 2000), pageErrors: state.pageErrors, requests: state.requests }, null, 2));
    await context.close();
    throw error;
  }
  return { context, page, state };
}

async function submit(page, question) {
  await page.getByRole('textbox', { name: '具体问题' }).fill(question);
  const consent = page.getByRole('checkbox', { name: '同意将本次问题提交给 SerpAPI，用于 Bing 搜索' });
  if (!await consent.isChecked()) await consent.check();
  await page.getByRole('button', { name: '查询', exact: true }).click();
}

async function check(id, mode, run) {
  const fixture = await open(mode);
  try {
    const observed = await run(fixture);
    const passed = observed.pass && fixture.state.pageErrors.length === 0;
    const screenshot = `${id}.png`;
    await fixture.page.screenshot({ path: path.join(output, screenshot), fullPage: true });
    results.push({ id, status: passed ? 'PASS' : 'FAIL', observed, screenshot, requests: fixture.state.requests, pageErrors: fixture.state.pageErrors });
  } catch (error) {
    results.push({ id, status: 'FAIL', error: String(error.stack || error), requests: fixture.state.requests, pageErrors: fixture.state.pageErrors });
  } finally { await fixture.context.close(); }
}

try {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch { /* Start-up wait. */ }
    if (attempt === 59) throw new Error('Vite did not start');
    await sleep(200);
  }
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  await check('U04-empty-adjust', 'empty-then-result', async ({ page, state }) => {
    await submit(page, '合成问题一');
    await page.getByText('没有检索结果，请调整问题。', { exact: true }).waitFor();
    const emptyHadError = await page.getByRole('alert').count() > 0;
    const emptyHadSave = await page.getByRole('button', { name: '主动保存本次来源与摘录' }).count() > 0;
    await page.screenshot({ path: path.join(output, 'U04-empty.png'), fullPage: true });
    await submit(page, '合成问题二：调整后的查询');
    await page.getByRole('link', { name: '调整问题后的合成来源' }).waitFor();
    return { pass: state.tasks === 2 && !emptyHadError && !emptyHadSave, tasks: state.tasks, emptyHadError, emptyHadSave, adjustedQuestion: await page.getByRole('textbox', { name: '具体问题' }).inputValue() };
  });
  await check('U04-cancel-unknown', 'cancel-unknown', async ({ page, state }) => {
    await submit(page, '合成等待查询');
    await page.getByText('正在检索来源，你可以停止本次等待。', { exact: true }).waitFor();
    for (let attempt = 0; state.tasks === 0 && attempt < 30; attempt++) await sleep(100);
    if (state.tasks !== 1) throw new Error('查询任务未被接受，不能检查取消已接受任务');
    await page.getByRole('button', { name: '取消查询' }).click();
    await page.getByRole('alert').getByText('本机已停止等待；服务器取消状态待确认。').waitFor();
    for (let attempt = 0; state.cancel.length === 0 && attempt < 30; attempt++) await sleep(100);
    await page.waitForTimeout(1000);
    const cancelPath = state.cancel[0]?.path || '';
    const alert = await page.getByRole('alert').innerText();
    const refill = await page.getByText('调整问题后的合成来源').count();
    const enabled = await page.getByRole('button', { name: '查询', exact: true }).isEnabled();
    return { pass: state.tasks === 1 && state.cancel.length === 1 && state.cancelResponseStatus === 503 && /^\/api\/search\/tasks\/[^/]+\/cancel$/.test(cancelPath) && alert.includes('服务器取消状态待确认') && refill === 0 && enabled, tasks: state.tasks, cancelRequests: state.cancel.length, cancelResponseStatus: state.cancelResponseStatus, cancelPath, alert, lateRefill: refill, queryEnabled: enabled };
  });
} catch (error) {
  results.push({ id: 'RUN', status: 'FAIL', error: String(error.stack || error) });
} finally {
  await browser?.close();
  vite.kill();
  const report = { executedDate: '2026-11-23', sourceCommit, environment: 'Edge headless + local Vite; all APIs are synthetic; no real participants, provider or server', total: results.length, passed: results.filter(item => item.status === 'PASS').length, results };
  fs.writeFileSync(path.join(output, 'u04-results.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'vite-output.txt'), viteLog.replace(/\u001b\[[0-9;]*m/g, ''));
  console.log(JSON.stringify({ sourceCommit, total: report.total, passed: report.passed, results: results.map(({ id, status, observed, error }) => ({ id, status, observed, error })) }, null, 2));
  if (report.passed !== report.total) process.exitCode = 1;
}
