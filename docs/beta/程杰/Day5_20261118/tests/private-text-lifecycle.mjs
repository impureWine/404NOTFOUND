import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../../..');
const evidenceDirectory = resolve(here, '../evidence');
const playwrightModule = process.env.PLAYWRIGHT_MODULE_PATH;
if (!playwrightModule) throw new Error('Set PLAYWRIGHT_MODULE_PATH to a Playwright ESM entry.');
const { chromium } = await import(pathToFileURL(resolve(playwrightModule)).href);
const { createServer } = await import(pathToFileURL(resolve(repo, 'prototype/node_modules/vite/dist/node/index.js')).href);
const port = Number(process.env.DAY5_PRIVATE_TEXT_PORT || 5192);
const result = { date: '2026-11-19 Asia/Shanghai', route: '#private-text', input: 'synthetic only', cases: [] };
let vite, browser;

async function canvasHasPixels(page) {
  return page.locator('canvas').evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    return data.some((value, index) => index % 4 === 3 && value > 0);
  });
}

try {
  await mkdir(evidenceDirectory, { recursive: true });
  vite = await createServer({ configFile: false, root: resolve(repo, 'prototype'), server: { host: '127.0.0.1', port, strictPort: true } });
  await vite.listen();
  browser = await chromium.launch({ executablePath: process.env.EDGE_EXECUTABLE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  page.setDefaultTimeout(10000);
  const networkRequests = [], consoleMessages = [];
  page.on('request', request => networkRequests.push({ url: request.url(), body: request.postData() || '' }));
  page.on('console', message => consoleMessages.push(message.text()));

  await page.goto(`http://127.0.0.1:${port}/#private-text`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '文字焚化与重力黑洞' }).waitFor();
  const marker = 'DAY5_SYNTHETIC_EXIT_CLEANUP_20261119';
  await page.evaluate(markerValue => {
    window.__day5IndexedDBMarkerWrites = [];
    for (const method of ['add', 'put']) {
      const original = IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method] = function (...args) {
        let serialized = '';
        try { serialized = JSON.stringify(args); } catch { serialized = '[unserializable]'; }
        if (serialized.includes(markerValue)) window.__day5IndexedDBMarkerWrites.push(method);
        return Reflect.apply(original, this, args);
      };
    }
    const originalUpdate = IDBCursor.prototype.update;
    IDBCursor.prototype.update = function (...args) {
      let serialized = '';
      try { serialized = JSON.stringify(args); } catch { serialized = '[unserializable]'; }
      if (serialized.includes(markerValue)) window.__day5IndexedDBMarkerWrites.push('cursor.update');
      return Reflect.apply(originalUpdate, this, args);
    };
  }, marker);
  const requestBaseline = networkRequests.length;
  const input = page.getByLabel('想放下的话');

  await input.fill(marker);
  await input.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  assert.equal(await input.inputValue(), '');
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    return [...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data].some((value, index) => index % 4 === 3 && value > 0);
  });
  assert.equal(await canvasHasPixels(page), true, 'synthetic animation should have painted before exit');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await page.waitForFunction(() => document.querySelector('textarea')?.value === '');
  assert.equal(await canvasHasPixels(page), false, 'pagehide should erase animation pixels');
  result.cases.push({ name: 'keyboard-triggered destroy works; pagehide clears input, pixels, and pending frame', passed: true });

  await input.fill(marker);
  await page.getByRole('button', { name: '销毁本页文字' }).click();
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    return [...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data].some((value, index) => index % 4 === 3 && value > 0);
  });
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
  await page.waitForFunction(() => document.querySelector('textarea')?.value === '');
  assert.equal(await canvasHasPixels(page), false, 'beforeunload should erase animation pixels');
  result.cases.push({ name: 'beforeunload clears input and animation pixels', passed: true });

  await page.evaluate(() => { window.__restoreCanvasContext = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = () => null; });
  await input.fill(marker);
  await page.getByRole('button', { name: '销毁本页文字' }).click();
  await page.getByRole('status').filter({ hasText: '动画不可用，输入内容已清空。' }).waitFor();
  assert.equal(await input.inputValue(), '');
  assert.equal(await page.getByRole('button', { name: '立即清空' }).isEnabled(), false);
  result.cases.push({ name: 'missing 2D context clears input and returns to an idle state', passed: true });
  await page.evaluate(() => { HTMLCanvasElement.prototype.getContext = window.__restoreCanvasContext; delete window.__restoreCanvasContext; });

  await page.evaluate(() => { window.__restoreFillText = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = () => { throw new Error('synthetic draw failure'); }; });
  await input.fill(marker);
  await page.getByRole('button', { name: '销毁本页文字' }).click();
  await page.getByRole('status').filter({ hasText: '动画已中断，输入内容已清空。' }).waitFor();
  assert.equal(await input.inputValue(), '');
  assert.equal(await page.getByRole('button', { name: '立即清空' }).isEnabled(), false);
  result.cases.push({ name: 'drawing exception clears input and returns to an idle state', passed: true });
  await page.evaluate(() => { CanvasRenderingContext2D.prototype.fillText = window.__restoreFillText; delete window.__restoreFillText; });

  await input.fill(marker);
  await page.getByRole('button', { name: '销毁本页文字' }).click();
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    return [...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data].some((value, index) => index % 4 === 3 && value > 0);
  });
  await page.evaluate(() => { window.__detachedCanvas = document.querySelector('canvas'); location.hash = '#games'; });
  await page.getByRole('heading', { name: '减压练习与小游戏' }).first().waitFor();
  assert.equal(await page.evaluate(() => {
    const data = window.__detachedCanvas.getContext('2d').getImageData(0, 0, window.__detachedCanvas.width, window.__detachedCanvas.height).data;
    return data.some((value, index) => index % 4 === 3 && value > 0);
  }), false, 'unmount should clear the detached canvas bitmap');
  await page.evaluate(() => { location.hash = '#private-text'; });
  await page.getByRole('heading', { name: '文字焚化与重力黑洞' }).waitFor();
  assert.equal(await page.getByLabel('想放下的话').inputValue(), '');
  result.cases.push({ name: 'SPA navigation unmount clears the old canvas and reentry stays empty', passed: true });

  await page.setViewportSize({ width: 320, height: 780 });
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  assert.equal(horizontalOverflow, false, 'private-text page should fit a 320px viewport without horizontal scrolling');
  result.cases.push({ name: '320px viewport has no horizontal overflow', passed: true });

  const storage = await page.evaluate(() => {
    const entries = store => Array.from({ length: store.length }, (_, index) => {
      const key = store.key(index);
      return [key, store.getItem(key)];
    });
    return { local: entries(localStorage), session: entries(sessionStorage), indexedDBMarkerWrites: window.__day5IndexedDBMarkerWrites };
  });
  assert.equal(JSON.stringify(networkRequests).includes(marker), false);
  assert.equal(networkRequests.length, requestBaseline, 'input and cleanup actions should not initiate network requests');
  assert.equal(storage.indexedDBMarkerWrites.length, 0);
  assert.equal(JSON.stringify(storage.local).includes(marker), false);
  assert.equal(JSON.stringify(storage.session).includes(marker), false);
  assert.equal(consoleMessages.some(message => message.includes(marker)), false);
  result.checks = { markerInNetworkRequests: false, markerInLocalOrSessionStorage: false, markerInIndexedDBWriteArguments: false, markerInConsole: false, networkRequestsDuringInputActions: 0, exitEventsWereDispatchedByTest: true };
} catch (error) {
  result.error = { name: error.name, message: error.message };
  process.exitCode = 1;
} finally {
  await writeFile(resolve(evidenceDirectory, 'private-text-lifecycle.json'), JSON.stringify(result, null, 2));
  await browser?.close();
  await vite?.close();
}
