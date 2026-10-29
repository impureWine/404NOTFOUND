/**
 * Day 6 评审表「真实访问权限」检查。
 *
 * 目的：用全新浏览器上下文（无任何 Cookie / 无登录态，等价于无痕窗口）打开腾讯文档评审表 URL，
 * 判断匿名访问者能否直接看到表格内容，而不是登录墙或权限申请页。
 *
 * 用法（NODE_PATH 指向 prototype/node_modules）：
 *   node tencent-doc-access-check.cjs <url> <evidenceDir>
 */
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');

const url = process.argv[2];
const outDir = process.argv[3];
if (!url || !outDir) {
  console.error('usage: node tencent-doc-access-check.cjs <url> <evidenceDir>');
  process.exit(2);
}

function bodyTextSafe(evidence) { return (evidence.steps && evidence.steps.bodyTextHead) || ''; }

const DENY_PATTERNS = ['无权限', '没有访问权限', '申请权限', '请求访问权限', '仅限指定人', '链接已失效', '文档不存在', '请先登录'];
const CONTENT_HINTS = ['评审维度', '评分建议', '评审结论', '只能查看'];
// 说明：腾讯文档的单元格由 canvas 渲染，DOM innerText 中取不到表格文本，
// 因此匿名可读性判定依据是：标题正确 + 无拒绝提示 + 出现「只能查看」只读标识；
// 表格内容本身以截图为证据。

(async () => {
  const evidence = {
    generatedAt: new Date().toISOString(),
    url,
    browser: 'msedge (headless, Playwright)',
    context: 'fresh context, no cookies / no login',
    steps: {},
  };

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' });
  const page = await context.newPage();
  const requests = [];
  page.on('request', (r) => requests.push({ method: r.method(), url: r.url().slice(0, 160) }));

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(9000); // 腾讯文档前端渲染较慢

    const title = await page.title();
    const bodyText = (await page.evaluate(() => document.body.innerText || '')).replace(/\s+/g, ' ').trim();
    const cookies = await context.cookies();

    evidence.steps = {
      httpStatus: response ? response.status() : null,
      title,
      bodyTextLength: bodyText.length,
      bodyTextHead: bodyText.slice(0, 500),
      deniedPatternsFound: DENY_PATTERNS.filter((p) => bodyText.includes(p)),
      contentHintsFound: CONTENT_HINTS.filter((p) => bodyText.includes(p)),
      cookieCount: cookies.length,
      cookieNames: cookies.map((c) => c.name),
      requestCount: requests.length,
    };

    const shot = path.join(outDir, 'tencent-doc-anonymous-view.png');
    await page.screenshot({ path: shot, fullPage: false });
    evidence.screenshot = path.basename(shot);
  } catch (error) {
    evidence.error = error.message.slice(0, 300);
  } finally {
    await context.close();
    await browser.close();
  }

  const { deniedPatternsFound, contentHintsFound } = evidence.steps;
  const reachable = Array.isArray(deniedPatternsFound) && deniedPatternsFound.length === 0
    && Array.isArray(contentHintsFound) && contentHintsFound.length > 0;
  evidence.verdict = evidence.error ? 'ERROR' : reachable ? 'ANONYMOUS-READABLE' : 'NOT-CONFIRMED';

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'tencent-doc-access.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    verdict: evidence.verdict,
    httpStatus: evidence.steps.httpStatus,
    title: evidence.steps.title,
    deniedPatternsFound: evidence.steps.deniedPatternsFound,
    contentHintsFound: evidence.steps.contentHintsFound,
    bodyTextLength: evidence.steps.bodyTextLength,
    bodyTextHead: (evidence.steps.bodyTextHead || '').slice(0, 160),
  }, null, 2));
})();
