/**
 * Day6 文字销毁「异常与退出」浏览器观察（关欣）。
 *
 * 与曾俊涛 Day5 的正常路径脚本互补：这里只测异常与退出，不重复正常销毁流程。
 * 受测页面：#private-text（PrivateText），真实 React 页面 + Vite dev server + 本机 Chrome。
 * 合成标记只存在于本次浏览器上下文；不上传、不写库、不调用真实供应商。
 *
 * 运行：
 *   PLAYWRIGHT_MODULE_PATH=/tmp/pw/node_modules/playwright-core/index.mjs \
 *   node docs/beta/关欣/Day6_20261119/tests/browser-destroy-exit.mjs
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../../..');
const out = resolve(here, '../evidence');
if (!process.env.PLAYWRIGHT_MODULE_PATH) throw new Error('Set PLAYWRIGHT_MODULE_PATH');
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE_PATH)).href);
const { createServer } = await import(pathToFileURL(resolve(repo, 'prototype/node_modules/vite/dist/node/index.js')).href);

const CHROME = process.env.CHROME_EXECUTABLE_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MARKER = 'DAY6_SYNTHETIC_PRIVATE_DO_NOT_SAVE_31c9';
const result = { candidate: process.env.DAY6_SOURCE_SHA ?? 'working-tree', date: '2026-11-19 Asia/Shanghai', page: '#private-text', cases: [] };
let vite, browser;

const collect = (page) => {
  const apiRequests = [], consoleEcho = [], pageErrors = [];
  page.on('request', (request) => { if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push({ path: new URL(request.url()).pathname, body: request.postData() }); });
  page.on('console', (message) => consoleEcho.push(message.text()));
  page.on('pageerror', (error) => pageErrors.push(String(error?.message ?? error)));
  return { apiRequests, consoleEcho, pageErrors };
};

const leaks = (page, marker) => page.evaluate((needle) => JSON.stringify({
  local: { ...localStorage }, session: { ...sessionStorage },
}).includes(needle), marker);

try {
  await mkdir(out, { recursive: true });
  vite = await createServer({
    configFile: false,
    root: resolve(repo, 'prototype'),
    server: { host: '127.0.0.1', port: 5186, strictPort: true },
  });
  await vite.listen();
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });

  // 用例 1：销毁动画进行中触发 pagehide
  {
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const { apiRequests, consoleEcho, pageErrors } = collect(page);
    await page.goto('http://127.0.0.1:5186/#private-text', { waitUntil: 'networkidle' });
    await page.getByLabel('想放下的话').fill(MARKER);
    await page.getByRole('button', { name: '销毁本页文字' }).click();
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.waitForTimeout(2000);
    const value = await page.getByLabel('想放下的话').inputValue();
    await page.screenshot({ path: resolve(out, '01-pagehide-mid-destroy.png'), fullPage: true });
    const caseResult = {
      name: 'pagehide-mid-destroy',
      inputCleared: value === '',
      markerInApi: JSON.stringify(apiRequests).includes(MARKER),
      markerInStorage: await leaks(page, MARKER),
      markerInConsole: consoleEcho.some((line) => line.includes(MARKER)),
      pageErrors,
      newApiRequests: apiRequests.length,
      apiPaths: apiRequests.map((item) => item.path),
    };
    assert.equal(caseResult.inputCleared, true, 'pagehide 后输入区应为空');
    assert.equal(caseResult.markerInStorage, false, '标记不得进入存储');
    assert.equal(caseResult.markerInConsole, false, '标记不得进入控制台');
    assert.equal(caseResult.markerInApi, false, '标记不得进入请求体');
    result.cases.push(caseResult);
    await page.close();
  }

  // 用例 2：销毁动画中切路由再返回
  {
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const { apiRequests, pageErrors } = collect(page);
    await page.goto('http://127.0.0.1:5186/#private-text', { waitUntil: 'networkidle' });
    await page.getByLabel('想放下的话').fill(MARKER);
    await page.getByRole('button', { name: '销毁本页文字' }).click();
    await page.evaluate(() => { location.hash = '#home'; });
    await page.waitForTimeout(600);
    await page.screenshot({ path: resolve(out, '02-route-away-mid-destroy.png'), fullPage: true });
    await page.goto('http://127.0.0.1:5186/#private-text', { waitUntil: 'networkidle' });
    const value = await page.getByLabel('想放下的话').inputValue();
    const caseResult = {
      name: 'route-away-mid-destroy',
      inputCleared: value === '',
      markerInApi: JSON.stringify(apiRequests).includes(MARKER),
      markerInStorage: await leaks(page, MARKER),
      pageErrors,
    };
    assert.equal(caseResult.inputCleared, true, '切路由再返回后输入区应为空');
    assert.equal(caseResult.markerInStorage, false);
    result.cases.push(caseResult);
    await page.close();
  }

  // 用例 3：空输入与动画中重复点击
  {
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const { apiRequests, pageErrors } = collect(page);
    await page.goto('http://127.0.0.1:5186/#private-text', { waitUntil: 'networkidle' });
    const emptyDisabled = await page.getByRole('button', { name: '销毁本页文字' }).isDisabled();
    if (!emptyDisabled) await page.getByRole('button', { name: '销毁本页文字' }).click();
    await page.getByLabel('想放下的话').fill(MARKER);
    await page.getByRole('button', { name: '销毁本页文字' }).click();
    await page.getByRole('button', { name: '销毁本页文字' }).click({ force: true });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(out, '03-repeat-click.png'), fullPage: true });
    await page.waitForTimeout(1700);
    const value = await page.getByLabel('想放下的话').inputValue();
    const caseResult = {
      name: 'empty-and-repeat-click',
      emptyInputDisablesButton: emptyDisabled,
      inputCleared: value === '',
      pageErrors,
      markerInApi: JSON.stringify(apiRequests).includes(MARKER),
    };
    assert.equal(caseResult.pageErrors.length, 0, '重复点击不得产生未捕获异常');
    assert.equal(caseResult.inputCleared, true);
    result.cases.push(caseResult);
    await page.close();
  }

  // 用例 4：canvas 取不到 2D context 时销毁
  {
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = () => null;
    });
    const { apiRequests, pageErrors } = collect(page);
    await page.goto('http://127.0.0.1:5186/#private-text', { waitUntil: 'networkidle' });
    await page.getByLabel('想放下的话').fill(MARKER);
    await page.getByRole('button', { name: '销毁本页文字' }).click();
    await page.waitForTimeout(1200);
    const value = await page.getByLabel('想放下的话').inputValue();
    await page.screenshot({ path: resolve(out, '04-canvas-context-missing.png'), fullPage: true });
    const caseResult = {
      name: 'canvas-context-missing',
      inputCleared: value === '',
      pageErrors,
      markerInApi: JSON.stringify(apiRequests).includes(MARKER),
      markerInStorage: await leaks(page, MARKER),
    };
    assert.equal(caseResult.pageErrors.length, 0, 'canvas 异常不得冒泡为未捕获异常');
    assert.equal(caseResult.inputCleared, true, 'canvas 异常时文字仍应清空');
    assert.equal(caseResult.markerInStorage, false);
    result.cases.push(caseResult);
    await page.close();
  }

  result.verdict = 'pass';
  await writeFile(resolve(out, 'browser-destroy-exit.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  result.verdict = 'fail';
  result.error = String(error?.message ?? error);
  await mkdir(out, { recursive: true }).catch(() => {});
  await writeFile(resolve(out, 'browser-destroy-exit.json'), JSON.stringify(result, null, 2));
  console.error('FAILED:', result.error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await vite?.close();
}
