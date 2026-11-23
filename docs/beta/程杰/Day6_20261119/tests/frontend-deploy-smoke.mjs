import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../../..');
const evidenceDirectory = resolve(here, '../evidence');
const playwrightModule = process.env.PLAYWRIGHT_MODULE_PATH;
if (!playwrightModule) throw new Error('Set PLAYWRIGHT_MODULE_PATH to a Playwright ESM entry.');

const { chromium } = await import(pathToFileURL(resolve(playwrightModule)).href);
const { createServer, preview } = await import(pathToFileURL(resolve(repo, 'prototype/node_modules/vite/dist/node/index.js')).href);
const port = Number(process.env.DAY6_PREVIEW_PORT || 4186);
const devPort = Number(process.env.DAY6_DEV_PORT || 4187);
const origin = `http://127.0.0.1:${port}`;
const result = {
  date: '2026-11-20 Asia/Shanghai',
  candidateSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
  api: 'synthetic responses only; no backend integration',
  cases: [],
};
let server, devServer, syntheticApi, browser;

try {
  await mkdir(evidenceDirectory, { recursive: true });
  server = await preview({
    configFile: resolve(repo, 'prototype/vite.config.js'),
    root: resolve(repo, 'prototype'),
    preview: { host: '127.0.0.1', port, strictPort: true },
  });
  browser = await chromium.launch({
    executablePath: process.env.EDGE_EXECUTABLE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  page.setDefaultTimeout(10000);
  const apiRequests = [], assetResponses = [], pageErrors = [];
  page.on('request', request => {
    const requestUrl = new URL(request.url());
    if (requestUrl.origin === origin && requestUrl.pathname.startsWith('/api/')) {
      apiRequests.push({ method: request.method(), path: requestUrl.pathname });
    }
  });
  page.on('response', response => {
    const request = response.request();
    if (new URL(response.url()).origin === origin && ['document', 'script', 'stylesheet', 'image', 'font'].includes(request.resourceType())) {
      assetResponses.push({ path: new URL(response.url()).pathname, status: response.status() });
    }
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/api/**', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'SYNTHETIC_DAY6_STUB', message: 'backend intentionally stubbed by smoke test' } }),
  }));

  const response = await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
  assert.equal(response.status(), 200);
  await page.waitForSelector('.current-home');
  await page.waitForFunction(() => document.querySelector('.home-topbar h1')?.textContent.trim() === '首页');
  result.cases.push({ name: 'built entry document mounts the React app', passed: true });

  const routes = [
    ['home', '首页'],
    ['companion', '陪伴交流'],
    ['search', '信息查询'],
    ['calendar', '情绪日历'],
    ['games', '减压练习与小游戏'],
    ['private-text', '文字焚化与黑洞'],
    ['settings', '个人主页与隐私设置'],
  ];
  for (const [route, title] of routes) {
    await page.evaluate(value => { location.hash = `#${value}`; }, route);
    await page.waitForFunction(expected => document.querySelector('.home-topbar h1')?.textContent.trim() === expected, title);
    assert.ok((await page.locator('.live-route').innerText()).trim().length > 0, `${route} should render page content`);
    result.cases.push({ name: `hash route #${route} renders ${title}`, passed: true });
  }

  const legacyPages = [['home.html', 'home'], ['games.html', 'games'], ['info-query.html', 'search']];
  for (const [pageName, route] of legacyPages) {
    const legacyResponse = await page.goto(`${origin}/${pageName}`, { waitUntil: 'domcontentloaded' });
    assert.equal(legacyResponse.status(), 200);
    await page.waitForFunction(expected => location.hash === `#${expected}`, route);
    await page.waitForSelector('.current-home');
    result.cases.push({ name: `legacy /${pageName} redirects to #${route}`, passed: true });
  }

  await page.waitForTimeout(250);
  assert.ok(assetResponses.some(asset => asset.path.endsWith('.js') && asset.status === 200), 'built JavaScript asset should load');
  assert.ok(assetResponses.some(asset => asset.path.endsWith('.css') && asset.status === 200), 'built stylesheet should load');
  assert.deepEqual(assetResponses.filter(asset => asset.status >= 400), [], 'same-origin app resources should not fail');
  assert.deepEqual(pageErrors, [], 'browser should not report uncaught page errors');
  assert.ok(apiRequests.every(request => request.path.startsWith('/api/')));
  result.checks = {
    sameOriginApiPathsOnly: true,
    apiRequestCount: apiRequests.length,
    apiRequests,
    appResourceCount: assetResponses.length,
    failedAppResources: 0,
    pageErrors: 0,
    backendResponsesWereSynthetic: true,
  };

  syntheticApi = createHttpServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ method: request.method, url: request.url }));
  });
  await new Promise((resolveListen, rejectListen) => {
    syntheticApi.once('error', rejectListen);
    syntheticApi.listen(0, '127.0.0.1', resolveListen);
  });
  const syntheticPort = syntheticApi.address().port;
  const previousApiProxyTarget = process.env.API_PROXY_TARGET;
  process.env.API_PROXY_TARGET = `http://127.0.0.1:${syntheticPort}`;
  try {
    devServer = await createServer({
      configFile: resolve(repo, 'prototype/vite.config.js'),
      root: resolve(repo, 'prototype'),
      server: { host: '127.0.0.1', port: devPort, strictPort: true },
    });
    await devServer.listen();
    const proxyResponse = await fetch(`http://127.0.0.1:${devPort}/api/day6-proxy-check?source=smoke`);
    const proxyPayload = await proxyResponse.json();
    assert.equal(proxyResponse.status, 200);
    assert.deepEqual(proxyPayload, { method: 'GET', url: '/api/day6-proxy-check?source=smoke' });
    result.cases.push({ name: 'Vite dev /api proxy forwards to the configured API_PROXY_TARGET', passed: true });
    result.checks.devProxyTarget = `local synthetic server on 127.0.0.1:${syntheticPort}`;
    result.checks.devProxyPathPreserved = true;
  } finally {
    await devServer?.close();
    devServer = null;
    if (previousApiProxyTarget === undefined) delete process.env.API_PROXY_TARGET;
    else process.env.API_PROXY_TARGET = previousApiProxyTarget;
    await new Promise(resolveClose => syntheticApi.close(resolveClose));
    syntheticApi = null;
  }
} catch (error) {
  result.error = { name: error.name, message: error.message };
  process.exitCode = 1;
} finally {
  await writeFile(resolve(evidenceDirectory, 'frontend-deploy-smoke.json'), JSON.stringify(result, null, 2));
  await browser?.close();
  await devServer?.close();
  if (syntheticApi?.listening) await new Promise(resolveClose => syntheticApi.close(resolveClose));
  await server?.close();
}
