// Day 7 静态前端冒烟：使用精确构建产物，不触发账号或业务 API。
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [repoRoot, outputDir, sourceRevision = '19ad7eb6eccebdc8a68f0c3763048c91f2b4d34c'] = process.argv.slice(2);
const shortRevision = sourceRevision.slice(0, 7);
if (!repoRoot || !outputDir || !process.env.PLAYWRIGHT_MODULE_PATH) {
  throw new Error('Usage: PLAYWRIGHT_MODULE_PATH=<playwright-core/index.mjs> node day7-static-browser-smoke.mjs <repoRoot> <outputDir>');
}
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const viteCli = path.join(repoRoot, 'prototype/node_modules/vite/bin/vite.js');
const port = Number(process.env.DAY7_PREVIEW_PORT ?? 5191);
const preview = spawn(process.execPath, [viteCli, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: path.join(repoRoot, 'prototype'),
  stdio: 'ignore',
  windowsHide: true,
});
let browser;
const base = `http://127.0.0.1:${port}`;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (preview.exitCode !== null) throw new Error(`Vite preview exited: ${preview.exitCode}`);
    try { ready = (await fetch(base)).ok; } catch { /* wait for startup */ }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error('Vite preview did not become ready');

  await mkdir(outputDir, { recursive: true });
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pages = [
    { name: 'home', url: `${base}/`, screenshot: `day7-home-main${shortRevision}.png` },
    { name: 'ux-demo', url: `${base}/ux-components.html?page=home&state=normal`, screenshot: `day7-ux-demo-main${shortRevision}.png` },
  ];
  const results = [];
  for (const item of pages) {
    const page = await context.newPage();
    const pageErrors = [];
    const apiRequests = [];
    page.on('pageerror', (error) => pageErrors.push(error.message.slice(0, 160)));
    page.on('request', (request) => { if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url()); });
    const response = await page.goto(item.url, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(outputDir, item.screenshot), fullPage: true });
    results.push({ name: item.name, url: item.url, status: response?.status() ?? null, title: await page.title(), bodyTextLength: (await page.locator('body').innerText()).length, pageErrors, apiRequestCount: apiRequests.length, screenshot: item.screenshot, note: '静态构建冒烟；页面中的演示内容不代表业务 API 联调' });
    await page.close();
  }
  await context.close();
  const report = { sourceRevision, browser: 'msedge headless', results };
  await writeFile(path.join(outputDir, `day7-static-browser-smoke-main${shortRevision}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report));
} finally {
  if (browser) await browser.close();
  preview.kill();
}
