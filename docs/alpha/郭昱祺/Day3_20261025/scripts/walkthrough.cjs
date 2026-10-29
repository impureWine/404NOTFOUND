const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const out = path.resolve(__dirname, '..');
const shotsDir = path.join(out, 'screenshots');
fs.mkdirSync(shotsDir, { recursive: true });
const scenes = [['login', 'LG'], ['home', 'HP'], ['chat', 'CH'], ['sources', 'SR'], ['emotion', 'EC'], ['training', 'TR']];
const states = [['normal', 'N'], ['loading', 'L'], ['empty', 'E'], ['error', 'F']];
const report = { checkedAt: new Date().toISOString(), timezone: 'Asia/Shanghai', baseUrl: process.env.UX_BASE_URL || 'http://127.0.0.1:5184', errors: [], checks: [], screenshots: [] };
const apiRequests = [];
const url = (scene, state) => `${report.baseUrl}/ux-components.html?page=${scene}&state=${state}`;
function check(name) { report.checks.push(name); console.log('PASS', name); }
async function capture(page, file) {
  const fullPath = path.join(shotsDir, file);
  await page.screenshot({ path: fullPath, fullPage: false });
  const data = fs.readFileSync(fullPath);
  report.screenshots.push({ file: `screenshots/${file}`, url: page.url(), viewport: page.viewportSize(), fullPage: false, size: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') });
}
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
    const page = await context.newPage();
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url()); });
    page.on('pageerror', e => report.errors.push(e.message));
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      for (const [scene, prefix] of scenes) {
        for (const [state, suffix] of (['chat', 'sources'].includes(scene) ? [...states, ['timeout', 'T']] : states)) {
          await page.goto(url(scene, state), { waitUntil: 'networkidle', timeout: 30000 });
          await page.locator('.state-id').waitFor();
          assert.equal(await page.locator('.state-id').textContent(), `${prefix}-${suffix}`);
          assert.equal(await page.locator('[aria-label="展示状态"] button[aria-pressed=true]').count(), 1);
          const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
          assert.ok(dimensions.document <= dimensions.viewport, `${scene}/${state}/${width} overflows: ${JSON.stringify(dimensions)}`);
          if (scene === 'login') {
            assert.equal(await page.locator('#demo-login-name').isDisabled(), state === 'loading');
            assert.equal(await page.locator('#demo-password').isDisabled(), state === 'loading');
          }
          if (width === 1440 || (width === 390 && state === 'normal')) await capture(page, `${prefix}-${suffix}_${scene}_${width}.png`);
          check(`${scene}/${state} width=${width}`);
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(url('login', 'empty'));
    await page.getByRole('button', { name: '演示登录', exact: true }).click();
    assert.equal(await page.locator('.field-error').count(), 2);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'demo-login-name');
    await page.locator('#demo-login-name').fill('demo_a');
    await page.locator('#demo-password').fill('demo_only_2026');
    await page.getByRole('button', { name: '显示演示密码' }).click();
    assert.equal(await page.locator('#demo-password').getAttribute('type'), 'text');
    await page.getByRole('button', { name: '演示登录', exact: true }).click();
    assert.equal(await page.locator('#demo-password').inputValue(), '');
    assert.ok((await page.locator('.preview-notice').textContent()).includes('未创建真实登录会话'));
    check('login validation, focus, visibility and local-only submit');
    await page.goto(url('chat', 'error'));
    await page.getByRole('button', { name: '取回快照编辑' }).click();
    assert.equal(await page.locator('#demo-message').inputValue(), '我想先从最容易的一件事开始。');
    await page.getByRole('button', { name: '结束演示', exact: true }).click();
    assert.equal(await page.locator('dialog').isVisible(), true);
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), '继续留在这里');
    await page.getByRole('button', { name: '结束并清空' }).click();
    assert.equal(await page.locator('#demo-message').inputValue(), '');
    assert.equal(await page.locator('.message').count(), 0);
    check('chat failure restore and end confirmation');
    await page.goto(url('sources', 'normal'));
    await page.getByRole('button', { name: '定位来源 2' }).click();
    assert.equal(await page.locator('#source-demo-source-2 .source-details').isVisible(), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'source-demo-source-2');
    check('source citation expands and focuses current source');
    await page.goto(url('home', 'error'));
    await page.getByRole('button', { name: '重试读取示例记录' }).click();
    assert.equal(await page.locator('.record-item').count(), 2);
    await page.locator('.home-nav').getByRole('link', { name: '陪伴交流', exact: true }).click();
    assert.ok(page.url().includes('page=chat'));
    check('home retry and shared sidebar preview navigation');
    await page.goto(url('home', 'normal'));
    const previewStyles = await page.evaluate(() => {
      const styles = selector => { const style = getComputedStyle(document.querySelector(selector)); return [style.width, style.height, style.fontSize, style.color, style.backgroundColor, style.borderRadius]; };
      return { sidebar: styles('.home-sidebar'), brand: styles('.home-brand'), topbar: styles('.home-topbar'), primary: styles('.guest-hero .button-primary'), tool: styles('.tool-card') };
    });
    await page.goto(`${report.baseUrl}/`, { waitUntil: 'networkidle' });
    const referenceStyles = await page.evaluate(() => {
      const styles = selector => { const style = getComputedStyle(document.querySelector(selector)); return [style.width, style.height, style.fontSize, style.color, style.backgroundColor, style.borderRadius]; };
      return { sidebar: styles('.home-sidebar'), brand: styles('.home-brand'), topbar: styles('.home-topbar'), primary: styles('.guest-hero .button-primary'), tool: styles('.tool-card') };
    });
    assert.deepEqual(previewStyles, referenceStyles);
    check('sidebar, brand, header, hero button and tools match reference computed styles');
    await capture(page, 'reference-home_1440.png');
    await page.locator('.account-pill').click();
    assert.equal(await page.getByRole('dialog').isVisible(), true);
    await capture(page, 'reference-login_1440.png');
    await page.getByRole('button', { name: '还没有账户？创建账户' }).click();
    assert.equal(await page.locator('input[name=confirmPassword]').isVisible(), true);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    assert.equal(await page.getByRole('dialog').count(), 0);
    check('original homepage login and register still open and close');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(url('home', 'normal'));
    await page.getByRole('button', { name: '打开导航菜单' }).click();
    assert.equal(await page.locator('.home-sidebar').isVisible(), true);
    await page.locator('.home-nav').getByRole('link', { name: '陪伴交流', exact: true }).click();
    assert.equal(await page.locator('.home-sidebar').isVisible(), false);
    assert.ok(page.url().includes('page=chat'));
    check('mobile shared menu navigates and closes');

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(url('emotion', 'empty'));
    assert.equal(await page.getByRole('button', { name: '预览命名卡', exact: true }).isDisabled(), true);
    for (const word of ['有点累', '紧张', '平静']) {
      await page.getByRole('button', { name: word, exact: true }).click();
    }
    assert.equal(await page.locator('.emotion-words button[aria-pressed=true]').count(), 3);
    assert.equal(await page.getByRole('button', { name: '委屈', exact: true }).isDisabled(), true);
    await page.locator('#emotion-description').fill('这句话需要我明确选择后才能带走');
    await page.getByRole('button', { name: '预览命名卡', exact: true }).click();
    assert.equal(await page.getByRole('checkbox').isChecked(), false);
    await capture(page, 'EC-word-choice.png');
    await page.getByRole('button', { name: '把选定内容带到聊天草稿' }).click();
    assert.equal(await page.locator('.message').count(), 0);
    assert.equal(await page.locator('#demo-message').inputValue(), '此刻我感到：有点累、紧张、平静。');
    assert.ok(!page.url().includes('有点累'));
    check('emotion requires a choice, caps three words and carries only selected words without sending');
    await page.goto(url('emotion', 'empty'));
    await page.locator('#emotion-description').fill('只带上我自己写的一句话');
    await page.getByRole('button', { name: '预览命名卡', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '把选定内容带到聊天草稿' }).isDisabled(), true);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: '把选定内容带到聊天草稿' }).click();
    assert.equal(await page.locator('#demo-message').inputValue(), '只带上我自己写的一句话');
    assert.equal(await page.locator('.message').count(), 0);
    await capture(page, 'EC-explicit-carry-draft.png');
    await page.reload();
    assert.equal(await page.locator('#demo-message').inputValue(), '');
    check('description-only carry needs explicit checkbox and is memory-only');
    await page.goto(url('emotion', 'empty'));
    await page.locator('#emotion-description').fill('😀'.repeat(4000));
    assert.equal(await page.getByRole('button', { name: '预览命名卡', exact: true }).isDisabled(), false);
    await page.locator('#emotion-description').fill('😀'.repeat(4001));
    assert.equal(await page.getByRole('button', { name: '预览命名卡', exact: true }).isDisabled(), true);
    assert.equal(await page.locator('#emotion-description').getAttribute('aria-invalid'), 'true');
    check('emotion validates Unicode code points at 4000/4001 without truncation');
    await page.goto(url('chat', 'timeout'));
    await page.locator('#demo-message').fill('准备下一句但不自动发送');
    assert.equal(await page.getByRole('button', { name: '发送演示', exact: true }).isDisabled(), true);
    assert.ok((await page.locator('.timeout-notice').textContent()).includes('结果待确认'));
    await capture(page, 'CH-timeout-unknown.png');
    const messageCount = await page.locator('.message').count();
    await page.getByRole('button', { name: '查看明确失败示例' }).click();
    assert.equal(await page.locator('.message').count(), messageCount);
    await page.getByRole('button', { name: '取回快照编辑' }).click();
    assert.equal(await page.locator('#demo-message').inputValue(), '我想先从最容易的一件事开始。');
    check('chat timeout is unresolved, blocks duplicate send and preserves submitted snapshot');
    await page.goto(url('sources', 'timeout'));
    const retainedQuestion = await page.locator('#demo-question').inputValue();
    assert.equal(await page.locator('.claim-item').count(), 0);
    assert.equal(await page.getByRole('button', { name: '结果待确认', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: '查看明确失败示例' }).click();
    assert.equal(await page.locator('#demo-question').inputValue(), retainedQuestion);
    await page.getByRole('button', { name: '重试查询示例' }).click();
    assert.equal(await page.locator('.claim-item').count(), 2);
    await page.goto(url('sources', 'empty'));
    assert.ok((await page.locator('.async-state').textContent()).includes('EMPTY'));
    await page.getByRole('button', { name: '清空', exact: true }).click();
    assert.ok((await page.locator('.async-state').textContent()).includes('尚未查询'));
    await capture(page, 'SR-initial-empty.png');
    check('query timeout, explicit failure, successful EMPTY and initial empty remain distinct');
    await page.goto(url('training', 'empty'));
    await page.getByRole('button', { name: '开始练习', exact: true }).click();
    await page.getByRole('button', { name: '完成本步', exact: true }).click();
    assert.equal(await page.locator('.training-progress li[aria-current=step]').textContent(), '2看看身边');
    await page.getByRole('button', { name: '暂停练习', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '完成本步', exact: true }).count(), 0);
    await page.waitForTimeout(250);
    assert.equal(await page.locator('.training-progress li[aria-current=step]').textContent(), '2看看身边');
    await capture(page, 'TR-paused-step.png');
    await page.getByRole('button', { name: '继续练习', exact: true }).click();
    await page.getByRole('button', { name: '完成本步', exact: true }).click();
    await page.getByRole('button', { name: '完成本步', exact: true }).click();
    assert.ok((await page.locator('.training-step').textContent()).includes('本次练习已完成'));
    await capture(page, 'TR-completed.png');
    await page.getByRole('button', { name: '重新开始', exact: true }).click();
    await page.getByRole('button', { name: '退出练习', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '完成本步', exact: true }).count(), 0);
    await page.getByRole('button', { name: '重新开始', exact: true }).click();
    assert.equal(await page.locator('.training-progress li[aria-current=step]').textContent(), '1先安顿下来');
    check('training starts, pauses without advancing, resumes, completes, exits and resets');
    await page.goto(url('home', 'normal'));
    const links = await page.locator('.tool-card').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
    assert.equal(links.length, 8);
    assert.ok(links.every(link => link.endsWith('.html')));
    await page.locator('.tool-card').filter({ hasText: '情绪命名卡' }).click();
    assert.ok(page.url().includes('page=emotion'));
    await page.locator('[aria-label="展示场景"]').getByRole('button', { name: '训练操作', exact: true }).click();
    assert.ok(page.url().includes('page=training'));
    check('homepage tools and six-scene navigation reach Day3 components');
    report.apiRequestCount = apiRequests.length;
    assert.deepEqual(apiRequests, []);
    check('local component walkthrough makes zero API requests');
    assert.deepEqual(report.errors, []);
    report.sourceFingerprints = {};
    const repoRoot = path.resolve(out, '../../../..');
    for (const item of ['prototype/src/App.jsx', 'prototype/src/components/SiteChrome.jsx', 'prototype/src/current-home.css', 'prototype/src/ux-showcase/main.jsx', 'prototype/src/ux-showcase/components.jsx', 'prototype/src/ux-showcase/pages.jsx', 'prototype/src/ux-showcase/data.js', 'prototype/src/ux-showcase/showcase.css', 'prototype/src/ux-showcase/Day3Components.jsx', 'prototype/src/ux-showcase/Day3Previews.jsx']) {
      report.sourceFingerprints[item] = crypto.createHash('sha256').update(fs.readFileSync(path.join(repoRoot, item))).digest('hex');
    }
    report.result = 'passed';
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(out, '验证与截图清单.json'), JSON.stringify(report, null, 2));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
