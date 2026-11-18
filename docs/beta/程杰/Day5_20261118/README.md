# Beta Day5｜文字销毁与前端资源清理

执行人：程杰。计划日期：2026-11-18；实际补充实现与验证：2026-11-19（Asia/Shanghai）。关联现有 [Issue #109](https://github.com/impureWine/404NOTFOUND/issues/109)，不重复创建 Issue。B07 日历/桌面扩展按中期收敛安排暂缓，本次聚焦 B06 文字销毁清理。

## 交付范围

- 修订 `prototype/src/live/Games.jsx` 的 `PrivateText` 页面：清空输入时取消动画帧、释放动画文本引用和粒子引用，并清除画布像素。
- 页面离开和组件卸载时清理运行时状态；卸载清理使用已捕获的旧 canvas 引用，覆盖 SPA 切页时 React ref 已清空的情况。
- 画布 2D context 缺失或绘制/动画启动异常时清空输入并回到空闲状态，向用户给出可见提示。
- 新增 `prototype/src/req14/private-text-runtime.js` 与生命周期单测；增加可重复执行的 Playwright 烟测。

## 验证

实际结果：`prototype` 全量测试 50/50 通过；Vite 构建通过（1600 modules）；浏览器烟测 6/6 通过；`git diff --check` 与脚本语法检查通过。原始浏览器结果见 [evidence/private-text-lifecycle.json](evidence/private-text-lifecycle.json)。

复跑命令：

```powershell
cd prototype
npm test
npm run build
cd ..
$qaRoot = Join-Path $env:TEMP '404notfound-day5-qa'
npm install --prefix $qaRoot --no-save --package-lock=false --no-audit --no-fund playwright-core@1.65.1
$env:PLAYWRIGHT_MODULE_PATH = Join-Path $qaRoot 'node_modules/playwright-core/index.mjs'
$env:DAY5_PRIVATE_TEXT_PORT = '5193'
node docs/beta/程杰/Day5_20261118/tests/private-text-lifecycle.mjs
```

浏览器烟测使用合成标记 `DAY5_SYNTHETIC_EXIT_CLEANUP_20261119`，覆盖键盘触发销毁、`pagehide`、`beforeunload`、缺失 2D context、SPA 卸载/重进及 320px 视口；同时观察本次操作期间的全部网络请求、local/session storage、IndexedDB 写入参数和控制台。结果为操作期间网络请求 0，未观察到标记进入网络、local/session storage、被监测到的 IndexedDB 写入参数或控制台。

`pagehide` 与 `beforeunload` 是测试脚本在页面内派发的事件，不等价于真实关闭浏览器/操作系统退出。观察范围是该浏览器测试上下文及事件，不证明浏览器缓存、系统截图、备份或物理介质已彻底擦除；这是交互原型的内存与画布资源清理，不是生产系统的安全擦除保证。

## 交接

本交付为前端协作修订，不代替 Issue 负责人关欣的独立安全验收。提交 SHA、远端分支与 Issue 评论将在推送完成后补记；不预先标记该 Issue 已验收或关闭。
