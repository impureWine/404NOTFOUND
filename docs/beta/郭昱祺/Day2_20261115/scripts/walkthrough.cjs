const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require('playwright');
const root = process.cwd();
const dest = path.join(root, 'docs/beta/郭昱祺/Day2_20261115');
const evidence = path.join(dest, 'evidence');
fs.mkdirSync(evidence, { recursive: true });
const baseline = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
const vite = spawn(process.execPath, [path.join(root, 'prototype/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5179', '--strictPort'], { cwd: path.join(root, 'prototype'), windowsHide: true, stdio: ['ignore','pipe','pipe'] });
let serverLog = ''; vite.stdout.on('data', d => serverLog += d); vite.stderr.on('data', d => serverLog += d);
const results = [];
let browser;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fixture(mode, hash) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); page.on('pageerror',e=>console.log('PAGEERROR',e.message)); page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
  const state = { calls: [], dialogCount: 0, releaseSave: null, cancelled: false };
  page.on('dialog', async d => { state.dialogCount++; await d.accept(); });
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname, method = req.method();
    if (!p.startsWith('/api/')) return route.continue(); state.calls.push({ method, path: p });
    const reply = async (data, status = 200) => { try { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status < 400 ? { data } : { error: data }) }); } catch {} };
    if (p === '/api/auth/context') return reply({ authenticated: true, csrfToken: 'SYNTHETIC-ONLY' });
    if (p === '/api/profile') return reply({ nickname: 'UX合成账号', loginName: 'synthetic-user' });
    if (p === '/api/sessions') return reply({ sessionId: '00000000-0000-4000-8000-000000000001', activityId: '00000000-0000-4000-8000-000000000002', sessionGeneration: 0, activityGeneration: 0, state: 'ready' });
    if (p === '/api/consents') return reply({ consentId: '00000000-0000-4000-8000-000000000003' });
    if (/\/cancel$/.test(p)) { state.cancelled = true; return mode === 'cancel-fail' ? reply({ code: 'SERVICE_UNAVAILABLE', message: '合成取消接口失败' }, 503) : reply({ status: 'cancelled' }); }
    if (/\/actions$/.test(p)) return reply({ sessionId: '00000000-0000-4000-8000-000000000001', activityId: '00000000-0000-4000-8000-000000000002', sessionGeneration: 0, activityGeneration: 0, state: 'ended' });
    if (/\/tasks$/.test(p) && method === 'POST') return reply({ status: 'pending' });
    if (/\/tasks\//.test(p) && method === 'GET') {
      if (mode === 'auth') return reply({ code: 'AUTH_REQUIRED', message: '登录已失效，请重新登录。' }, 401);
      if (mode === 'complete' || mode === 'save') return reply({ status: 'completed', result: { userMessageId: 'synthetic-user-message', replyMessageId: 'synthetic-reply', text: '合成测试回复，仅用于界面走查。' } });
      return reply({ status: state.cancelled ? 'cancelled' : 'pending' });
    }
    if (p === '/api/records' && method === 'POST') { await new Promise(r => state.releaseSave = r); return reply({ id: 'synthetic-record' }); }
    return reply([]);
  });
  await page.goto('http://127.0.0.1:5179/#' + hash);
  await page.waitForTimeout(1500);  await page.locator('main').waitFor({timeout:5000});
  await page.waitForTimeout(150);
  return { page, context, state };
}
async function send(page) {
  await page.getByRole('textbox', { name: '本次输入' }).fill('合成走查输入，不含真实个人信息。');
  await page.getByRole('checkbox', { name: '同意将本次明确选择的内容发送给模型处理' }).check();
  await page.getByRole('button', { name: '发送', exact: true }).click();
}
async function record(id, title, expected, observed, passed, f) {
  const screenshot = `${id}.jpg`;
  await f.page.screenshot({ path: path.join(evidence, screenshot), fullPage: true, type: 'jpeg', quality: 75 });
  results.push({ id, title, expected, observed, status: passed ? 'PASS' : 'FAIL', screenshot: `evidence/${screenshot}`, requests: f.state.calls });
}
async function scenario(body) { const f = await fixture(...body.args); try { await body.run(f); } finally { if (f.state.releaseSave) f.state.releaseSave(); await f.context.close(); } }
(async () => {
  for (let i=0;i<60;i++) { try { if ((await fetch('http://127.0.0.1:5179/')).ok) break; } catch {} if (i===59) throw new Error('Vite startup failed'); await sleep(200); }
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
  await scenario({ args: ['pending','companion'], run: async f => {
    await send(f.page); await f.page.getByRole('button', { name: '停止本次请求' }).waitFor();
    const disabled = await f.page.getByRole('button',{name:'发送',exact:true}).isDisabled();
    await f.page.waitForTimeout(200);
    const creates = f.state.calls.filter(c => c.method === 'POST' && c.path === '/api/agent/tasks').length;
    await record('UI01','等待中防重复提交','发送禁用；仅创建一个任务；停止入口可达',`发送禁用=${disabled}；任务创建=${creates}`,disabled && creates === 1,f);
    const states = await f.page.locator('section [role="status"], section [aria-busy="true"]').allTextContents();
    await record('UI02','等待反馈与读屏状态','正文区有等待文案和可感知忙碌状态',`等待状态节点=${JSON.stringify(states)}；只有停止按钮提示请求进行中`,states.length > 0,f);
  }});
  await scenario({ args: ['pending','companion'], run: async f => {
    await send(f.page); await f.page.waitForTimeout(200); await f.page.getByRole('button',{name:'停止本次请求'}).click();
    await f.page.getByRole('alert').filter({hasText:'已停止等待'}).waitFor();
    const draft = await f.page.getByRole('textbox',{name:'本次输入'}).inputValue();
    await record('UI03','停止等待后的输入恢复','取消接口被调用；停止等待；保留本次输入可手动再次发送',`取消请求=${f.state.cancelled}；草稿=${draft}；发送可用=${await f.page.getByRole('button',{name:'发送',exact:true}).isEnabled()}`,f.state.cancelled && !!draft,f);
  }});
  await scenario({ args: ['cancel-fail','search'], run: async f => {
    await f.page.getByRole('textbox',{name:'具体问题'}).fill('合成查询问题');
    await f.page.getByRole('checkbox',{name:'同意将本次问题提交给 SerpAPI，用于 Bing 搜索'}).check();
    await f.page.getByRole('button',{name:'查询',exact:true}).click(); await f.page.waitForTimeout(150);
    await f.page.getByRole('button',{name:'取消查询'}).click();
    await f.page.getByRole('alert').waitFor(); const text=await f.page.getByRole('alert').innerText();
    await record('UI04','取消接口失败的真实性','取消503后仅提示本机停止等待、服务器状态待确认',`取消接口503；页面提示：${text}`,!text.includes('查询已取消'),f);
  }});
  await scenario({ args: ['auth','companion'], run: async f => {
    await send(f.page); await f.page.getByRole('alert').waitFor();
    const draft=await f.page.getByRole('textbox',{name:'本次输入'}).inputValue();
    const login=await f.page.getByRole('button',{name:'发送',exact:true}).isDisabled();
    const account=await f.page.locator('body').innerText().then(text => text.includes('UX合成账号'));
    await record('UI05','会话失效后的阻断与身份清理','401停止私密操作，锁定旧上下文，提供重新登录且不自动重发',`401后旧账号仍显示=${account}；发送禁用=${login}；旧草稿仍在=${!!draft}`,login && !account,f);
  }});
  await scenario({ args: ['complete','companion'], run: async f => {
    await send(f.page); await f.page.getByText('合成测试回复，仅用于界面走查。',{exact:false}).waitFor();
    const before=f.state.dialogCount; await f.page.getByRole('button',{name:'结束并清空',exact:true}).click();
    await f.page.getByRole('status').filter({hasText:'已完成：结束并清空'}).waitFor();
    const dialogs=f.state.dialogCount-before;
    await record('UI06','结束前确认与恢复机会','清空未保存内容前说明影响，允许继续交流',`确认对话框=${dialogs}；点击后直接END并清空；清空后仍停留本页`,dialogs > 0,f);
  }});
  await scenario({ args: ['save','companion'], run: async f => {
    await send(f.page); await f.page.getByText('合成测试回复，仅用于界面走查。',{exact:false}).waitFor();
    await f.page.getByRole('button',{name:'主动保存本次对话'}).click();
    for(let i=0;i<30 && !f.state.releaseSave;i++) await f.page.waitForTimeout(50);
    const stop=f.page.getByRole('button',{name:'停止本次请求'}); const visible=await stop.isVisible();
    await stop.click(); await f.page.waitForTimeout(150);
    const remains=await f.page.getByRole('button',{name:'主动保存本次对话'}).isDisabled();
    await record('UI07','保存请求与取消按钮语义','保存中显示保存进度，不用模型控制器冒充保存取消',`保存中显示停止本次请求=${visible}；点击后保存仍忙碌=${remains}`,!visible,f);
    f.state.releaseSave(); await f.page.getByRole('status').filter({hasText:'已由服务端确认保存'}).waitFor();
  }});
  await scenario({ args: ['pending','training'], run: async f => {
    await f.page.getByRole('button',{name:'开始练习',exact:true}).click();
    const box=f.page.getByRole('textbox',{name:'可选填写，也可以只在心中完成'}); await box.fill('合成观察内容');
    await f.page.getByRole('button',{name:'暂停',exact:true}).click();
    const disabled=await box.isDisabled(); await f.page.getByRole('button',{name:'继续',exact:true}).click();
    const retained=(await box.inputValue())==='合成观察内容';
    await record('UI08','训练暂停与主动恢复','暂停禁用填写，继续后保留步骤与填写',`暂停禁用=${disabled}；继续保留填写=${retained}`,disabled && retained,f);
    const before=f.state.dialogCount; await f.page.getByRole('button',{name:'退出练习',exact:true}).click();
    await f.page.getByRole('heading',{name:'减压练习与小游戏',exact:true}).first().waitFor();
    await record('UI09','训练退出确认','有草稿退出前二次确认并返回练习入口',`确认对话框=${f.state.dialogCount-before}；已返回练习入口`,f.state.dialogCount>before,f);
  }});
  await scenario({ args: ['pending','companion'], run: async f => {
    await send(f.page); await f.page.getByRole('button',{name:'停止本次请求'}).waitFor();
    const consentDisabled=await f.page.getByRole('checkbox',{name:'同意将本次明确选择的内容发送给模型处理'}).isDisabled();
    const revoke=await f.page.getByRole('button',{name:/撤回|撤销许可/}).count();
    await record('UI10','外发许可撤回入口','提供与取消区分的许可撤回说明与入口；结果只承诺可确认范围',`等待时同意框禁用=${consentDisabled}；撤回按钮数=${revoke}`,revoke>0,f);
  }});
  fs.writeFileSync(path.join(evidence,'browser-results.json'),JSON.stringify({date:'2026-11-15',baseline,environment:'Microsoft Edge headless + Vite source app; every /api response intercepted with synthetic data; no real account, database, model or search used',total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results},null,2)+'\n');
  console.log(JSON.stringify({total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results:results.map(({id,status,observed})=>({id,status,observed}))},null,2));
})().catch(e=>{fs.writeFileSync(path.join(evidence,'browser-run-error.txt'),String(e.stack));console.error(e);process.exitCode=1;}).finally(async()=>{if(browser) await browser.close();vite.kill();fs.writeFileSync(path.join(evidence,'vite-output.txt'),serverLog.replace(/\u001b\[[0-9;]*m/g,''));});
