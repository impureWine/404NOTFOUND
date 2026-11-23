import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../../..');
const out = resolve(here, '../evidence/postmerge/core');
if (!process.env.PLAYWRIGHT_MODULE_PATH) throw new Error('Set PLAYWRIGHT_MODULE_PATH');
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE_PATH)).href);
const { createServer } = await import(pathToFileURL(resolve(repo, 'prototype/node_modules/vite/dist/node/index.js')).href);
const [{ createApp }, { AuthService }, { ConsentService }, { TaskService }, { TrainingService }, { parseProfileKey }, { createTestDatabase }] = await Promise.all([
  'backend/src/app.js', 'backend/src/services/auth-service.js', 'backend/src/services/consent-service.js',
  'backend/src/services/task-service.js', 'backend/src/services/training-service.js',
  'backend/src/security/crypto.js', 'backend/test/helpers/database.js',
].map(path => import(pathToFileURL(resolve(repo, path)).href)));

process.env.VITE_API_MODE = 'real';
process.env.VITE_CSRF_HEADER_NAME = 'X-CSRF-Token';
const origin = 'http://127.0.0.1:5196';
const result = { candidate: process.env.POSTMERGE_SOURCE_SHA, date: '2026-11-21 Asia/Shanghai', layer: 'React + local HTTP/PGlite + synthetic model/search', cases: [] };
let database, api, vite, browser;
try {
  await mkdir(out, { recursive: true });
  database = await createTestDatabase();
  const authService = new AuthService(database, { profileKey: parseProfileKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=') });
  const consentService = new ConsentService();
  const modelAdapter = { respond: async () => ({ status: 'success', result: { content: '合成陪伴回复：先停下来，再看最紧要的一件事。', suggested_action: 'STAY', citations: [], uncertainty: null } }) };
  const searchProvider = { search: async () => ({ searchState: 'SUCCESS', sources: [{ id: randomUUID(), title: '合成来源', url: 'https://example.org/day4', snippet: '仅供测试的摘录', publisher: 'Example', sourceTier: 'S3', quality: 'UNKNOWN', publishedAt: null, retrievedAt: new Date().toISOString(), verificationState: 'PARTIAL' }], partial: false, hasConflict: false, claims: [] }) };
  const taskService = new TaskService({ modelAdapter, consentService, searchProvider });
  api = createApp({ database, authService, consentService, taskService, trainingService: new TrainingService(), modelAdapter, appOrigin: origin }).listen(0, '127.0.0.1');
  await new Promise((yes, no) => { api.once('listening', yes); api.once('error', no); });
  vite = await createServer({ configFile: false, root: resolve(repo, 'prototype'), server: { host: '127.0.0.1', port: 5196, strictPort: true, proxy: { '/api': { target: `http://127.0.0.1:${api.address().port}`, changeOrigin: false } } } });
  await vite.listen();
  browser = await chromium.launch({ executablePath: process.env.EDGE_EXECUTABLE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  page.setDefaultTimeout(10000);
  await page.goto(origin, { waitUntil: 'networkidle' });
  const user = `beta_postmerge_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
  const password = `Synthetic!${randomUUID()}`;
  await page.getByRole('button', { name: '注册', exact: true }).first().click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('登录名').fill(user);
  await dialog.getByLabel('密码', { exact: true }).fill(password);
  await dialog.getByLabel('确认密码').fill(password);
  await dialog.getByRole('button', { name: '创建账户' }).click();
  await dialog.getByRole('heading', { name: '登录' }).waitFor();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('登录名').fill(user);
  await dialog.getByLabel('密码', { exact: true }).fill(password);
  await dialog.getByRole('button', { name: '登录', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });

  await page.evaluate(() => { location.hash = '#companion'; });
  await page.getByLabel('本次输入').fill('合成输入：今天有点紧张');
  await page.getByLabel('同意将本次明确选择的内容发送给模型处理').check();
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await page.getByText('合成陪伴回复：先停下来，再看最紧要的一件事。').waitFor();
  result.cases.push({ name: 'companion reply', passed: true, provider: 'synthetic model' });
  await page.screenshot({ path: resolve(out, '01-companion.png'), fullPage: true });

  await page.evaluate(() => { location.hash = '#search'; });
  await page.getByLabel('具体问题').fill('合成问题：如何准备课堂表达？');
  await page.getByLabel('同意将本次问题提交给 SerpAPI，用于 Bing 搜索').check();
  await page.getByRole('button', { name: '查询', exact: true }).click();
  await page.getByRole('link', { name: '合成来源' }).waitFor();
  assert.match(await page.locator('body').innerText(), /仅供测试的摘录/);
  result.cases.push({ name: 'query source display', passed: true, provider: 'synthetic search' });
  await page.screenshot({ path: resolve(out, '02-search.png'), fullPage: true });

  await page.evaluate(() => { location.hash = '#training'; });
  await page.getByRole('button', { name: '开始练习' }).click();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByText('已暂停', { exact: true }).first().waitFor();
  await page.screenshot({ path: resolve(out, '03-training-paused.png'), fullPage: true });
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByText('进行中', { exact: true }).first().waitFor();
  result.cases.push({ name: 'five-senses start/pause/resume', passed: true, provider: 'local controller' });
  await page.screenshot({ path: resolve(out, '04-training-resumed.png'), fullPage: true });
  await page.evaluate(() => { location.hash = '#notes'; });
  await page.getByRole('heading', { name: '主动保存与历史' }).waitFor();
  await page.getByLabel('正文').fill('Day7 合成内容：只核对保存确认焦点，不提交记录。');
  await page.getByRole('button', { name: '检查并选择保存' }).click();
  await page.getByRole('heading', { name: '保存前确认' }).waitFor();
  const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
  assert.equal(focused, '保存前确认');
  result.cases.push({ name: 'save review focus on current candidate', passed: true, focus: focused });
  await page.screenshot({ path: resolve(out, '05-record-review-focus.png'), fullPage: true });
} catch (error) {
  result.error = { name: error.name, message: error.message };
  process.exitCode = 1;
} finally {
  await writeFile(resolve(out, 'browser-core.json'), JSON.stringify(result, null, 2));
  await browser?.close();
  await vite?.close();
  if (api) await new Promise(done => api.close(done));
  await database?.close();
}
