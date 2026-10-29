const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const out = path.resolve(__dirname, '..');
const shots = path.join(out, 'screenshots');
fs.mkdirSync(shots, { recursive: true });
const report = {
  checkedAt: new Date().toISOString(), timezone: 'Asia/Shanghai',
  baseUrl: process.env.UX_BASE_URL || 'http://127.0.0.1:5187',
  authFixtureUrl: process.env.UX_AUTH_FIXTURE_URL || 'http://127.0.0.1:5188',
  scope: '本地浏览器交互走查；正式首页在 mock 模式，组件使用合成数据；忙碌态通过拦截认证请求模拟，不是服务端验收。',
  checks: [], screenshots: [], errors: [], businessRequests: [], interceptedAuth: [], status: 'running',
};
const check = name => { report.checks.push(name); console.log('PASS', name); };
const sceneUrl = (name, state = 'normal') => `${report.baseUrl}/ux-components.html?page=${name}&state=${state}`;
async function capture(page, file, evidenceType, locator) {
  const target = path.join(shots, file);
  if (locator) await locator.screenshot({ path: target });
  else await page.screenshot({ path: target, fullPage: true });
  const bytes = fs.readFileSync(target);
  report.screenshots.push({ file: `screenshots/${file}`, url: page.url(), evidenceType,
    viewport: page.viewportSize(), crop: !!locator, bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
}
async function noOverflow(page, width) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `page overflow at ${width}`);
  const dialog = page.locator('dialog[open]');
  if (await dialog.count()) {
    const box = await dialog.boundingBox();
    assert.ok(box.x >= -1 && box.x + box.width <= width + 1, `dialog overflow at ${width}`);
    assert.ok(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1));
  }
}
(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) report.businessRequests.push(new URL(request.url()).pathname); });
    await page.goto(report.baseUrl, { waitUntil: 'networkidle' });
    await capture(page, '01-formal-home.png', '正式首页运行；mock 配置，未认证');
    const trigger = page.getByRole('button', { name: '登录', exact: true }).last();
    await trigger.click();
    const dialog = page.locator('dialog.auth-dialog');
    assert.equal(await dialog.isVisible(), true);
    assert.equal(await page.evaluate(() => document.activeElement.name), 'loginName');
    assert.equal(await dialog.getAttribute('aria-labelledby'), 'auth-dialog-title');
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab');
      assert.equal(await page.evaluate(() => !!document.activeElement.closest('dialog')), true);
    }
    await page.keyboard.press('Escape');
    assert.equal(await dialog.count(), 0);
    assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
    check('formal auth dialog starts at login name, contains Tab focus, Escape closes and restores trigger');
    await trigger.click();
    await dialog.locator('[name="loginName"]').fill('a'.repeat(64));
    assert.equal((await dialog.locator('[name="loginName"]').inputValue()).length, 64);
    await dialog.locator('[name="password"]').fill('😀'.repeat(129));
    await dialog.getByRole('button', { name: '登录', exact: true }).click();
    assert.equal(await dialog.locator('#auth-password-error').isVisible(), true);
    assert.equal(await dialog.locator('[name="password"]').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement.name), 'password');
    assert.equal(Array.from(await dialog.locator('[name="password"]').inputValue()).length, 129);
    await capture(page, '02-formal-login-overlimit.png', '正式认证表单本地边界反馈；虚构输入');
    await dialog.locator('[name="password"]').fill('😀'.repeat(128));
    await dialog.getByRole('button', { name: '登录', exact: true }).click();
    await dialog.getByText('认证 API 未连接，当前不会模拟成功。', { exact: true }).waitFor();
    assert.equal(await dialog.locator('#auth-password-error').count(), 0);
    assert.equal(Array.from(await dialog.locator('[name="password"]').inputValue()).length, 128);
    await capture(page, '03-formal-login-disconnected.png', '正式认证表单；API 未连接的实际本地反馈');
    await capture(page, '03b-formal-login-form.png', '正式认证表单局部；API 未连接', dialog.locator('form'));
    check('64-character login name and 128-code-point password accepted locally; 129 blocked without truncation; no mock login success');
    await dialog.getByRole('button', { name: '还没有账户？创建账户' }).click();
    assert.equal(await dialog.locator('[name="loginName"]').inputValue(), '');
    assert.equal(await dialog.locator('[name="password"]').inputValue(), '');
    assert.equal(await dialog.locator('[name="confirmPassword"]').inputValue(), '');
    await dialog.locator('[name="loginName"]').fill('ux_demo');
    await dialog.locator('[name="password"]').fill('😀'.repeat(11));
    await dialog.locator('[name="confirmPassword"]').fill('😀'.repeat(11));
    await dialog.getByRole('button', { name: '创建账户', exact: true }).click();
    assert.ok((await dialog.locator('#auth-password-error').textContent()).includes('至少需要 12'));
    await dialog.locator('[name="password"]').fill('😀'.repeat(12));
    await dialog.getByRole('button', { name: '创建账户', exact: true }).click();
    assert.equal(await dialog.locator('#auth-confirm-error').isVisible(), true);
    assert.equal(await page.evaluate(() => document.activeElement.name), 'confirmPassword');
    await dialog.locator('[name="confirmPassword"]').fill('😀'.repeat(12));
    await dialog.getByRole('button', { name: '创建账户', exact: true }).click();
    await dialog.getByText('认证 API 未连接，当前不会模拟成功。', { exact: true }).waitFor();
    assert.equal(await dialog.locator('#auth-confirm-error').count(), 0);
    check('mode change clears all fields; registration 11 code points blocked, 12 accepted, mismatch points to confirmation field');
    await page.keyboard.press('Escape');
    await trigger.click();
    await page.mouse.click(3, 3);
    assert.equal(await dialog.count(), 0);
    assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
    check('formal auth backdrop click closes and restores the opening control');
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(report.baseUrl, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: '登录', exact: true }).last().click();
      await dialog.getByRole('button', { name: '还没有账户？创建账户' }).click();
      await noOverflow(page, width);
      await dialog.getByRole('button', { name: '创建账户', exact: true }).scrollIntoViewIfNeeded();
      assert.equal(await dialog.getByRole('button', { name: '创建账户', exact: true }).isVisible(), true);
      await capture(page, `04-formal-register-${width}.png`, '正式注册表单；窄屏运行');
      await page.keyboard.press('Escape');
      check(`formal registration fits ${width}px with operable action and Escape`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(sceneUrl('save'), { waitUntil: 'networkidle' });
    const preview = page.getByRole('button', { name: '预览保存范围', exact: true });
    assert.equal(await preview.isDisabled(), true);
    assert.equal(await page.getByText('请至少选择一条片段，再预览保存范围。', { exact: true }).isVisible(), true);
    await page.locator('.save-message-option input').first().check();
    await page.locator('#record-save-title').fill('   ');
    assert.equal(await page.locator('#record-title-error').isVisible(), true);
    assert.ok((await page.locator('#record-save-title').getAttribute('aria-describedby')).includes('record-title-error'));
    await page.locator('#record-save-title').fill('😀'.repeat(81));
    assert.ok((await page.locator('#record-title-error').textContent()).includes('超过 80'));
    assert.equal(await preview.isDisabled(), true);
    await capture(page, '05-save-title-error.png', '组件状态演示；合成片段和边界输入', page.locator('.save-editor-panel'));
    await page.locator('#record-save-title').fill('给今天留一句话');
    assert.equal(await page.locator('#record-title-error').count(), 0);
    assert.equal(await preview.isEnabled(), true);
    await capture(page, '06-save-selection.png', '组件状态演示；主动选择片段', page.locator('.save-editor-panel'));
    await preview.click();
    await capture(page, '07-save-confirmation.png', '组件状态演示；单次范围确认', page.getByRole('dialog'));
    await page.keyboard.press('Escape');
    check('save missing-selection guidance and blank/81-code-point errors are visible and linked; correcting title restores preview');
    await page.goto(sceneUrl('history'), { waitUntil: 'networkidle' });
    await page.locator('#history-kind').selectOption('QUERY');
    await capture(page, '08-history-filter-empty.png', '组件状态演示；当前筛选无匹配', page.locator('.history-list-panel'));
    await page.getByRole('button', { name: '清除筛选，查看全部', exact: true }).click();
    assert.equal(await page.locator('#history-kind').inputValue(), 'ALL');
    assert.equal(await page.locator('.history-records li').count(), 2);
    await capture(page, '09-history-list.png', '组件状态演示；仅元数据列表', page.locator('.history-list-panel'));
    await page.goto(sceneUrl('history', 'empty'));
    assert.equal(await page.getByRole('button', { name: '去选择保存内容', exact: true }).isVisible(), true);
    await page.goto(sceneUrl('history', 'error'));
    assert.equal(await page.getByRole('button', { name: '清除筛选，查看全部', exact: true }).count(), 0);
    await page.getByRole('button', { name: '重试读取示例历史', exact: true }).click();
    assert.equal(await page.locator('.history-records li').count(), 2);
    await page.locator('.history-record-button').first().click();
    await page.getByRole('button', { name: '清除这条示例记录', exact: true }).click();
    await capture(page, '10-record-clear-confirmation.png', '组件状态演示；清除默认为保留', page.getByRole('dialog'));
    await page.keyboard.press('Escape');
    check('filtered empty resets to ALL; true empty starts saving; read failure retries without being presented as empty');
    await page.goto(sceneUrl('chat'));
    await page.locator('#demo-message').fill('虚构的待编辑草稿');
    await page.getByRole('button', { name: '结束演示', exact: true }).click();
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), '继续留在这里');
    await capture(page, '11-chat-end-confirmation.png', '组件状态演示；安全默认焦点', page.getByRole('dialog'));
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#demo-message').inputValue(), '虚构的待编辑草稿');
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), '结束演示');
    await page.getByRole('button', { name: '结束演示', exact: true }).click();
    await page.getByRole('button', { name: '结束并清空', exact: true }).click();
    assert.equal(await page.locator('#demo-message').inputValue(), '');
    assert.equal(await page.locator('.message').count(), 0);
    check('chat ending starts on keep; Escape preserves draft and trigger; explicit ending clears draft and messages');
    for (const [scene, state, selector, filename] of [
      ['home', 'empty', '.recent-panel', '12-home-empty.png'], ['home', 'error', '.recent-panel', '13-home-error.png'],
      ['chat', 'timeout', '.chat-error', '14-chat-timeout.png'], ['sources', 'normal', '.search-result', '15-sources.png'],
      ['emotion', 'normal', '.emotion-layout', '16-emotion.png'], ['training', 'normal', '.training-panel', '17-training.png'],
    ]) {
      await page.goto(sceneUrl(scene, state), { waitUntil: 'networkidle' });
      await capture(page, filename, '组件状态演示；固定示例数据', page.locator(selector));
    }
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      for (const scene of ['home', 'chat', 'sources', 'emotion', 'training', 'save', 'history', 'record-detail']) {
        await page.goto(sceneUrl(scene), { waitUntil: 'networkidle' });
        await noOverflow(page, width);
        check(`${scene} normal scene remains within ${width}px viewport`);
      }
    }
    assert.deepEqual(report.businessRequests, []);
    check('mock formal UI and synthetic component walkthrough made no business API requests');
    const authPage = await context.newPage();
    authPage.on('pageerror', error => report.errors.push(error.message));
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    await authPage.route('**/api/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (!pathname.startsWith('/api/')) return route.continue();
      report.interceptedAuth.push({ method: route.request().method(), path: pathname, intercepted: true });
      if (pathname === '/api/auth/context') return route.fulfill({ json: { data: { authenticated: false, csrfToken: 'local-test-only' } } });
      assert.equal(pathname, '/api/auth/login');
      await pending;
      return route.fulfill({ status: 401, json: { error: { code: 'AUTH_FAILED', message: '登录未成功，请检查输入后重试。' } } });
    });
    await authPage.setViewportSize({ width: 1440, height: 1000 });
    await authPage.goto(report.authFixtureUrl, { waitUntil: 'networkidle' });
    await authPage.getByRole('button', { name: '登录', exact: true }).last().click();
    const authDialog = authPage.locator('dialog.auth-dialog');
    await authDialog.locator('[name="loginName"]').fill('fixture_user');
    await authDialog.locator('[name="password"]').fill('fixture-only-value');
    const request = authPage.waitForRequest('**/api/auth/login');
    await authDialog.getByRole('button', { name: '登录', exact: true }).click();
    await request;
    assert.equal(await authDialog.locator('[name="loginName"]').isDisabled(), true);
    assert.equal(await authDialog.locator('[name="password"]').isDisabled(), true);
    assert.equal(await authDialog.getByRole('button', { name: '还没有账户？创建账户' }).isDisabled(), true);
    assert.equal(await authDialog.locator('form').getAttribute('aria-busy'), 'true');
    await capture(authPage, '18-auth-loading-fixture.png', '正式组件＋拦截请求的忙碌态测试；未连接真实认证服务', authDialog);
    release();
    await authDialog.getByText('登录未成功，请检查输入后重试。', { exact: true }).waitFor();
    assert.equal(await authDialog.locator('[name="loginName"]').isEnabled(), true);
    assert.equal(await authDialog.getByRole('button', { name: '还没有账户？创建账户' }).isEnabled(), true);
    await capture(authPage, '19-auth-failure-fixture.png', '正式组件＋拦截的 401 测试响应；不是服务端验收', authDialog);
    check('intercepted pending auth request locks fields/mode and reports busy; intercepted 401 restores controls and shows retry feedback');
    assert.deepEqual(report.errors, []);
    check('no browser page errors');
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.failure = error.stack; console.error(error.stack); process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(out, '浏览器验证与截图清单.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(`RESULT ${report.status}: ${report.checks.length} check groups; ${report.screenshots.length} screenshots`);
  }
})();
