import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [repoRoot, outputDir] = process.argv.slice(2);
if (!repoRoot || !outputDir || !process.env.PLAYWRIGHT_MODULE_PATH) {
  throw new Error('Usage: PLAYWRIGHT_MODULE_PATH=... node day6-multi-screen-runtime-capture.mjs <repoRoot> <outputDir>');
}
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const port = Number(process.env.DAY6_PREVIEW_PORT ?? 5193);
const origin = `http://127.0.0.1:${port}`;
const preview = spawn(process.execPath, [path.join(repoRoot, 'prototype/node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: path.join(repoRoot, 'prototype'), stdio: 'ignore', windowsHide: true,
});
let browser;
try {
  let ready = false;
  for (let i = 0; i < 80; i += 1) {
    if (preview.exitCode !== null) throw new Error(`preview exited: ${preview.exitCode}`);
    try { ready = (await fetch(origin)).ok; } catch { /* startup */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  if (!ready) throw new Error('preview not ready');
  await mkdir(outputDir, { recursive: true });
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const scenes = [
    ['首页', '/'],
    ['组件首页', '/ux-components.html?page=home&state=normal'],
    ['登录演示', '/ux-components.html?page=login&state=normal'],
    ['聊天超时演示', '/ux-components.html?page=chat&state=timeout'],
    ['来源展示', '/ux-components.html?page=sources&state=normal'],
    ['训练演示', '/ux-components.html?page=training&state=normal'],
  ];
  const results = [];
  for (let i = 0; i < scenes.length; i += 1) {
    const [scene, route] = scenes[i];
    const page = await context.newPage();
    const errors = []; let apiRequests = 0;
    page.on('pageerror', error => errors.push(error.message.slice(0, 180)));
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests += 1; });
    const response = await page.goto(origin + route, { waitUntil: 'networkidle' });
    const filename = `${String(i + 1).padStart(2, '0')}-${['home', 'ux-home', 'ux-login', 'ux-chat-timeout', 'ux-sources', 'ux-training'][i]}.png`;
    await page.screenshot({ path: path.join(outputDir, filename), fullPage: true });
    results.push({ scene, route, status: response?.status() ?? null, title: await page.title(), bodyTextLength: (await page.locator('body').innerText()).length, pageErrors: errors, apiRequests, filename, boundary: '浏览器实际打开的本地构建；UX 场景为模拟数据' });
    await page.close();
  }
  await writeFile(path.join(outputDir, 'runtime-capture.json'), JSON.stringify({ source: 'main@7824d0c executable reconstruction from 19ad7eb plus new test', browser: 'Edge headless', results }, null, 2));
  if (results.some(item => item.status !== 200 || item.pageErrors.length)) process.exitCode = 1;
  console.log(JSON.stringify({ pages: results.length, ok: results.filter(item => item.status === 200 && item.pageErrors.length === 0).length }));
} finally {
  await browser?.close();
  preview.kill();
}
