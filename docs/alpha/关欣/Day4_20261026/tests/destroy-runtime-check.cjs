/**
 * Day 4 文字销毁（REQ14）运行时取证脚本。
 *
 * 两段式：
 *   1) 可达性探测 —— 在构建产物中查找"文本销毁"入口（导航、工具卡、候选 URL）；
 *   2) 若可达 —— 执行完整交互：输入合成正文 → 销毁 → 检查网络/存储/控制台/重开页面；
 *      若不可达 —— 记录入口缺失事实，不伪造交互结果。
 *
 * 使用方式（NODE_PATH 指向 prototype/node_modules）：
 *   $env:NODE_PATH = "...\404NOTFOUND-repo\prototype\node_modules"
 *   node destroy-runtime-check.cjs <baseUrl> <outputJsonPath>
 *
 * 边界：
 * - 只覆盖当前构建产物与本次交互路径，不构成系统级"绝对无痕"结论。
 * - 不覆盖操作系统、输入法、录屏、剪贴板与设备取证。
 * - 正文只使用 synthetic: 前缀的合成标记，不含真实用户内容。
 */
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5199';
const outputPath = process.argv[3] ?? path.join(__dirname, '..', 'evidence', 'destroy-runtime-check.json');
const marker = `synthetic:D4-DESTROY-${crypto.randomUUID()}`;
const candidatePaths = ['/destroy', '/text-destroy.html', '/destroy.html', '/?page=destroy', '/#destroy'];

const containsMarker = (value) => typeof value === 'string' && value.includes(marker);

async function findDestroyEntry(page) {
  const candidates = [];
  const controls = await page.locator('a,button').all();
  for (const control of controls) {
    const text = (await control.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    if (text && /销毁|焚化|黑洞/.test(text)) {
      candidates.push({ text: text.slice(0, 60), tag: await control.evaluate((el) => el.tagName.toLowerCase()) });
    }
  }
  return candidates;
}

async function probeUrls(context) {
  const results = [];
  for (const candidate of candidatePaths) {
    const page = await context.newPage();
    try {
      const response = await page.goto(`${baseUrl}${candidate}`, { waitUntil: 'networkidle' });
      const hasDestroyUi = await page
        .getByText('文本销毁 / 黑洞演示')
        .first()
        .isVisible()
        .catch(() => false);
      const hasTextarea = (await page.locator('textarea').count()) > 0;
      results.push({
        path: candidate,
        status: response ? response.status() : null,
        hasDestroyUi,
        hasTextarea,
        title: await page.title(),
      });
    } catch (error) {
      results.push({ path: candidate, error: error.message.slice(0, 120) });
    } finally {
      await page.close();
    }
  }
  return results;
}

(async () => {
  const evidence = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    browser: 'msedge (headless, Playwright channel)',
    markerKind: 'synthetic: 前缀 UUID，不含真实用户内容',
    reachability: {},
    steps: {},
    violations: [],
  };

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await context.newPage();

  const requests = [];
  const consoleMessages = [];
  const pageErrors = [];
  page.on('request', (request) => {
    requests.push({
      method: request.method(),
      url: request.url(),
      hasMarker: containsMarker(request.url()) || containsMarker(request.postData() ?? ''),
    });
  });
  page.on('console', (message) => consoleMessages.push({ type: message.type(), hasMarker: containsMarker(message.text()) }));
  page.on('pageerror', (error) => pageErrors.push({ hasMarker: containsMarker(error.message) }));

  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const entryCandidates = await findDestroyEntry(page);
    const urlProbes = await probeUrls(context);
    const reachable = entryCandidates.length > 0 || urlProbes.some((item) => item.hasDestroyUi);

    evidence.reachability = {
      homeEntryCandidates: entryCandidates,
      urlProbes,
      reachable,
      note: reachable
        ? '构建产物中存在可用入口，继续执行交互检查'
        : '构建产物中未发现"文本销毁"入口，交互检查无法执行',
    };

    if (!reachable) {
      // 不可达时仍记录一次首页截图与请求清单，作为"无入口"的客观证据。
      await page.screenshot({ path: path.join(path.dirname(outputPath), 'home-no-destroy-entry.png') });
      evidence.steps = {
        interactionExecuted: false,
        reason: '未找到"文本销毁"入口，未执行销毁交互',
        homeRequestCount: requests.length,
        homeConsoleErrors: consoleMessages.filter((item) => item.type === 'error').length,
        pageErrors: pageErrors.length,
      };
      // 缺入口不作为安全违规（没有通路即没有泄露面），但必须显式记录为功能缺口。
      evidence.functionalGap = 'REQ14 文字销毁页在当前构建产物中没有入口，运行时隐私取证无法执行';
    } else {
      // 可达分支：完整交互检查。
      if (entryCandidates.length > 0) {
        await page.getByText(entryCandidates[0].text, { exact: false }).first().click().catch(() => {});
        await page.waitForTimeout(600);
      }
      const textarea = page.locator('textarea').first();
      await textarea.waitFor({ state: 'visible', timeout: 10000 });
      await textarea.fill(marker);
      const typedVisible = (await textarea.inputValue()) === marker;
      await page.getByRole('button', { name: '销毁文本' }).first().click();
      await page.getByText('已从当前演示界面清除').first().waitFor({ state: 'visible' });
      const afterDestroyValue = await textarea.inputValue();

      const storage = await page.evaluate(async () => {
        const dump = (store) => {
          const out = {};
          for (let i = 0; i < store.length; i += 1) {
            const key = store.key(i);
            out[key] = store.getItem(key);
          }
          return out;
        };
        const databases = typeof indexedDB?.databases === 'function'
          ? (await indexedDB.databases()).map((item) => item.name)
          : 'unavailable';
        return {
          localStorage: dump(window.localStorage),
          sessionStorage: dump(window.sessionStorage),
          indexedDbDatabases: databases,
          cookie: document.cookie,
        };
      });

      await page.reload({ waitUntil: 'networkidle' });
      const reopenedHtml = await page.content();

      evidence.steps = {
        interactionExecuted: true,
        typedVisible,
        afterDestroyValueEmpty: afterDestroyValue === '',
        requestCount: requests.length,
        requestsWithMarker: requests.filter((item) => item.hasMarker).length,
        localStorageHasMarker: JSON.stringify(storage.localStorage).includes(marker),
        sessionStorageHasMarker: JSON.stringify(storage.sessionStorage).includes(marker),
        cookieHasMarker: storage.cookie.includes(marker),
        indexedDbDatabases: storage.indexedDbDatabases,
        localStorageKeys: Object.keys(storage.localStorage),
        sessionStorageKeys: Object.keys(storage.sessionStorage),
        consoleMessagesWithMarker: consoleMessages.filter((item) => item.hasMarker).length,
        consoleMessageCount: consoleMessages.length,
        pageErrors: pageErrors.length,
        reopenedHtmlContainsMarker: reopenedHtml.includes(marker),
      };

      if (!typedVisible) evidence.violations.push('输入未正确写入文本框');
      if (afterDestroyValue !== '') evidence.violations.push('销毁后文本框仍有内容');
      if (evidence.steps.requestsWithMarker > 0) evidence.violations.push('存在携带合成正文的网络请求');
      if (evidence.steps.localStorageHasMarker) evidence.violations.push('localStorage 中出现正文');
      if (evidence.steps.sessionStorageHasMarker) evidence.violations.push('sessionStorage 中出现正文');
      if (evidence.steps.cookieHasMarker) evidence.violations.push('Cookie 中出现正文');
      if (evidence.steps.consoleMessagesWithMarker > 0) evidence.violations.push('控制台输出中出现正文');
      if (evidence.steps.reopenedHtmlContainsMarker) evidence.violations.push('重开页面后 DOM 中仍存在正文');
    }

    evidence.requestList = requests.map((item) => ({ method: item.method, url: item.url }));
  } catch (error) {
    evidence.error = error.message.slice(0, 400);
    evidence.violations.push(`执行异常：${error.message.slice(0, 200)}`);
  } finally {
    await context.close();
    await browser.close();
  }

  evidence.verdict = evidence.violations.length === 0
    ? (evidence.reachability?.reachable ? 'PASS' : 'NOT-EXECUTED')
    : 'FAIL';
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    verdict: evidence.verdict,
    reachable: evidence.reachability?.reachable,
    functionalGap: evidence.functionalGap ?? null,
    violations: evidence.violations,
    output: outputPath,
  }, null, 2));
  process.exitCode = evidence.violations.length === 0 ? 0 : 1;
})();
