/** QA harness for existing DestroyPage; synthetic marker, fresh browser storage, no backend. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(process.env.DAY4_REPO_ROOT ?? resolve(here, '../../../../..'));
const out = resolve(process.env.DAY4_OUTPUT_DIR ?? resolve(here, '..'));
const sourceSha = process.env.DAY4_SOURCE_SHA ?? '2c756cf';
if (!process.env.PLAYWRIGHT_MODULE_PATH) throw new Error('Set PLAYWRIGHT_MODULE_PATH to an installed playwright-core/index.mjs');
const [{ chromium }, { createServer }] = await Promise.all([
  import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE_PATH)).href),
  import(pathToFileURL(resolve(repo, 'prototype/node_modules/vite/dist/node/index.js')).href),
]);
const marker = `synthetic:day4-destroy-${randomUUID()}`;
const report = {
  source: `main@${sourceSha}; QA-only isolated harness in local mirror`,
  date: '2026-10-26 Asia/Shanghai',
  markerHashPrefix: createHash('sha256').update(marker).digest('hex').slice(0, 12),
  scope: 'React DestroyPage in fresh Edge context, no backend; checks observable network, DOM and browser storage only',
  steps: [],
};
let vite, browser;
try {
  vite = await createServer({ configFile: resolve(repo, 'prototype/vite.config.js'), root: resolve(repo, 'prototype'), mode: 'development', server: { host: '127.0.0.1', port: 5175, strictPort: true } });
  await vite.listen();
  browser = await chromium.launch({ executablePath: process.env.EDGE_EXECUTABLE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const page = await context.newPage();
  const requests = [], consoles = [];
  page.on('request', request => requests.push({ url: request.url(), method: request.method(), body: request.postData() }));
  page.on('console', message => consoles.push(message.text()));
  await page.goto('http://127.0.0.1:5175/day4-privacy-qa.html', { waitUntil: 'networkidle' });
  const input = page.getByRole('textbox', { name: '输入演示文本' });
  await input.fill(marker);
  assert.equal(await input.inputValue(), marker);
  await page.screenshot({ path: resolve(out, 'day4-destroy-before-synthetic.png'), fullPage: true });
  await page.getByRole('button', { name: '销毁文本' }).click();
  assert.equal(await input.inputValue(), '');
  await page.getByText('已从当前演示界面清除').waitFor();
  assert.equal((await page.locator('body').innerText()).includes(marker), false);
  await page.screenshot({ path: resolve(out, 'day4-destroy-after-synthetic.png'), fullPage: true });
  const store = await page.evaluate(async () => ({
    local: Object.fromEntries(Object.entries(localStorage)),
    session: Object.fromEntries(Object.entries(sessionStorage)),
    indexedDbNames: (await indexedDB.databases()).map(item => item.name),
    cacheNames: await caches.keys(),
  }));
  assert.equal(JSON.stringify(store).includes(marker), false);
  report.steps.push({ action: 'enter and destroy synthetic text', textareaEmpty: true, domMarkerAbsent: true, storageMarkerAbsent: true, browserStorage: store });
  await input.fill(marker);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal((await page.locator('body').innerText()).includes(marker), false);
  assert.equal((await page.getByRole('textbox', { name: '输入演示文本' }).inputValue()).includes(marker), false);
  report.steps.push({ action: 'reload while text was present', markerAbsentAfterReload: true });
  const apiRequests = requests.filter(item => new URL(item.url).pathname.startsWith('/api/'));
  const markerRequests = requests.filter(item => item.url.includes(marker) || item.body?.includes(marker));
  assert.equal(apiRequests.length, 0); assert.equal(markerRequests.length, 0);
  assert.equal(consoles.join('\n').includes(marker), false);
  report.network = { observedRequests: requests.length, apiRequests: 0, markerInUrlOrBody: 0, markerInConsole: false };
} catch (error) {
  report.error = { name: error.name, message: error.message };
  process.exitCode = 1;
} finally {
  await writeFile(resolve(out, `day4-destroy-browser-20261026-main${sourceSha}.json`), JSON.stringify(report, null, 2));
  await browser?.close();
  await vite?.close();
}
