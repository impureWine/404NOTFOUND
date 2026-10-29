// Checks the packaged build, not the Vite development server or backend.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.UX_PLAYWRIGHT_MODULE || 'playwright');
const delivery = path.resolve(__dirname, '..');
const output = path.join(delivery, '成品验证');
const base = process.env.UX_DEMO_URL || 'http://127.0.0.1:5190';
const scenes = { login:[], home:[], chat:['timeout'], sources:['timeout'], emotion:[], training:[], save:['timeout','success','expired'], history:['expired'], 'record-detail':['expired','unavailable','conflict'] };
const report = { executedAt:new Date().toISOString(), target:base, mode:'packaged-static-mock', states:[], checks:[], screenshots:[], javascriptErrors:[], businessRequests:[], externalRequests:[] };
const browserOptions = { headless:true };
if (process.env.UX_BROWSER_PATH) browserOptions.executablePath = process.env.UX_BROWSER_PATH;
async function main() {
  fs.mkdirSync(output, { recursive:true });
  const browser = await chromium.launch(browserOptions);
  const context = await browser.newContext({ viewport:{ width:1440, height:960 }, deviceScaleFactor:1 });
  const page = await context.newPage();
  page.on('pageerror', e => report.javascriptErrors.push(e.message));
  await context.route('**/*', route => {
    const url = route.request().url();
    if (/^https?:/.test(url) && new URL(url).origin !== new URL(base).origin) { report.externalRequests.push(url); return route.abort(); }
    if (new URL(url).pathname.startsWith('/api/')) report.businessRequests.push(url);
    return route.continue();
  });
  const check = (name, data = {}) => report.checks.push({ name, status:'passed', ...data });
  async function shot(name) {
    await page.screenshot({ path:path.join(output, name), fullPage:true });
    report.screenshots.push({ file:name, url:page.url(), capturedAt:new Date().toISOString() });
  }
  async function go(scene, state='normal') {
    const response = await page.goto(`${base}/site/ux-components.html?page=${scene}&state=${state}`);
    assert.equal(response.status(), 200);
    await page.locator('#preview-content').waitFor();
    await page.waitForFunction(({ scene, state }) => {
      const params = new URLSearchParams(location.search);
      return params.get('page') === scene && params.get('state') === state && !!document.querySelector('.state-switch button.selected');
    }, { scene, state });
    assert.ok((await page.locator('#preview-content').innerText()).trim().length > 20);
  }
  try {
    await page.goto(base);
    const links = await page.locator('a').evaluateAll(nodes => nodes.map(n => n.href));
    for (const url of links) assert.equal((await context.request.get(url)).status(), 200, url);
    check('导航页15个本地链接可达', { count:links.length });
    await shot('01-演示导航.png');
    for (const [scene, extra] of Object.entries(scenes)) {
      for (const state of ['normal','loading','empty','error',...extra]) {
        await go(scene, state);
        report.states.push({ scene, state, status:'passed', url:page.url(), title:await page.title() });
      }
    }
    check('9场景45个预置状态可打开', { count:report.states.length, scope:'HTTP200、已选状态与非空组件；不代替逐项交互验收' });
    await page.goto(`${base}/site/index.html`);
    await page.getByRole('button', { name:'登录', exact:true }).last().click();
    let auth = page.getByRole('dialog');
    await auth.getByLabel('登录名', { exact:true }).fill('day6_demo_user');
    await auth.getByLabel('密码', { exact:true }).fill('FictionalDemoOnly123!');
    await auth.getByRole('button', { name:'登录', exact:true }).click();
    await auth.getByText('认证 API 未连接，当前不会模拟成功。', { exact:true }).waitFor();
    await shot('06-登录断连提示.png');
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    check('打包正式首页认证断连保持未登录且Escape关闭');
    await go('chat');
    await page.locator('#demo-message').fill('Day6 虚构草稿，仅验收取消操作。');
    await page.getByRole('button', { name:'结束演示', exact:true }).click();
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), '继续留在这里');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#demo-message').inputValue(), 'Day6 虚构草稿，仅验收取消操作。');
    check('聊天结束确认安全默认焦点且Escape保留草稿');
    await go('sources');
    await page.getByRole('button', { name:'定位来源 1', exact:true }).first().click();
    await page.locator('#source-detail-demo-source-1').waitFor({ state:'visible' });
    assert.match(await page.locator('#source-detail-demo-source-1').innerText(), /发布时间：未知/);
    assert.match(await page.locator('#source-detail-demo-source-1').innerText(), /未抓取/);
    check('引用编号展开来源且保留未知时间');
    await shot('02-来源定位与不确定性.png');
    await go('save');
    await page.locator('#record-save-title').fill('Day6 打包验收用虚构记录');
    await page.locator('.save-message-option input').first().check();
    await page.getByRole('button', { name:'预览保存范围', exact:true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), '返回修改');
    assert.equal(await dialog.getByRole('button', { name:'确认加入示例历史', exact:true }).isDisabled(), true);
    await dialog.getByRole('checkbox', { name:'我确认仅保存以上内容' }).check();
    await shot('03-保存范围确认.png');
    await dialog.getByRole('button', { name:'确认加入示例历史', exact:true }).click();
    await page.getByRole('heading', { name:'已加入本次示例历史', exact:true }).waitFor();
    await page.getByRole('button', { name:'查看本人历史', exact:true }).click();
    await page.getByRole('button', { name:/Day6 打包验收用虚构记录/ }).click();
    await page.getByRole('button', { name:'清除这条示例记录', exact:true }).click();
    dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), '保留记录');
    await shot('04-清除安全默认.png');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name:'清除这条示例记录', exact:true }).waitFor();
    await page.getByRole('button', { name:'清除这条示例记录', exact:true }).click();
    await page.getByRole('button', { name:'确认清除示例记录', exact:true }).click();
    await page.getByRole('list', { name:'本人历史记录' }).waitFor();
    assert.equal(await page.getByRole('button', { name:/Day6 打包验收用虚构记录/ }).count(), 0);
    check('保存确认→历史→详情→取消清除→确认清除连续操作通过', { persistence:'page-memory-only', safeDefaultFocus:true });
    await go('home', 'error');
    await page.setViewportSize({ width:390, height:844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await shot('05-窄屏首页失败.png');
    check('390px首页失败态无全页横向溢出');
    await page.goto(pathToFileURL(path.join(delivery, '演示包', '备用截图.html')).href);
    await page.locator('img').last().waitFor({ state:'attached' });
    await page.locator('img').evaluateAll(nodes => nodes.forEach(n => { n.loading = 'eager'; }));
    await page.waitForFunction(() => [...document.images].every(img => img.complete));
    const images = await page.locator('img').evaluateAll(nodes => nodes.map(n => ({ source:n.getAttribute('src'), ok:n.complete && n.naturalWidth > 0 })));
    assert.equal(images.length, 30);
    assert.equal(images.every(i => i.ok), true);
    check('file协议离线图册30张图片全部加载', { count:images.length });
    for (const [url, expected, method] of [['/api/demo',404,'GET'], ['/',405,'POST'], ['/%2e%2e%5csecret',403,'GET']]) {
      const response = await context.request.fetch(base + url, { method });
      assert.equal(response.status(), expected);
    }
    check('静态服务API404、POST405、反斜杠目录穿越403');
    assert.equal(report.javascriptErrors.length, 0);
    assert.equal(report.businessRequests.length, 0);
    assert.equal(report.externalRequests.length, 0);
    check('浏览器0脚本错误、0业务API请求、0外部请求');
    report.status = 'passed';
  } catch (error) { report.status = 'failed'; report.failure = String(error.stack || error); throw error; }
  finally {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(output, '演示包冒烟报告.json'), JSON.stringify(report, null, 2));
    await browser.close();
    console.log(JSON.stringify({ status:report.status, states:report.states.length, checks:report.checks.length, screenshots:report.screenshots.length, failure:report.failure || null }));
  }
}
main().catch(() => { process.exitCode = 1; });
