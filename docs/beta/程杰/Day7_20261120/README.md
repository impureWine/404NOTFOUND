# Beta Day7｜程杰前端复测与交付

执行日期：2026-11-20（Asia/Shanghai）。复测基线为 `origin/main@840360477688e9766f201ed989ed55f706fbe16f`。本日处理已清除历史内容仍被选择时的前端恢复问题，复跑前端测试与构建，并整理页面演示和桌面能力说明。

关联交付 [Issue #194](https://github.com/impureWine/404NOTFOUND/issues/194)。

本交付对应七天分工中程杰的“修复剩余关键前端问题并提交复测；整理启动步骤、页面演示和桌面能力说明”。当前代码仍是 Beta 候选和演示原型，不能据此判定生产发布验收完成。

## 修订与验证

| 项目 | 结果 |
| --- | --- |
| 已清除历史引用 | 陪伴/事情整理/排练任务创建前重新读取本轮选择的历史记录。发现 404 时移除失效选择，保留本次输入并说明未发送；记录状态无法核实时停止请求并提示检查连接。 |
| 定向前端用例 | `prototype` 中 `business-task-errors.test.js`：15/15 通过，覆盖有效记录、已清除记录和记录读取失败。 |
| 前端全量测试 | `prototype`：65/65 通过。 |
| 生产构建 | Vite 6.4.4 构建通过，1601 个模块转换。 |
| 浏览器复测 | 本日独立 Edge 脚本 3/3 场景通过：应用构建入口；清除后选择自动移除且不创建许可/任务；320px 日历无横向溢出，移动菜单 Escape 关闭并归还焦点。资源加载失败 0，页面异常 0。 |
| 接口层次 | 浏览器脚本拦截外部请求，使用合成认证、记录响应和 404；未调用真实后端、模型或检索服务。前置读取不能消除读取之后并发清除产生的竞态，服务端仍须做最终校验。 |

结果和截图归档在 [evidence](evidence/frontend-final-smoke.json) 中。本轮证据记录执行时的源码基线 SHA；提交后需要以交付提交 SHA 重新运行，报告才对应最终提交内容。

## 启动与页面演示

环境要求 Node.js 20.19 或 22.12 及以上。仓库根目录安装锁定依赖并启动 Vite：

```powershell
cd prototype
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

浏览器打开 `http://127.0.0.1:5173/`。页面在单页 React 应用中使用 hash 路由，直接访问演示路径时保留在同一个入口。

| 演示内容 | 路由 |
| --- | --- |
| 首页 | `/#home` |
| 陪伴交流 | `/#companion` |
| 事情整理 | `/#things` |
| 对话排练 | `/#rehearsal` |
| 信息查询 | `/#search` |
| 情绪日历 | `/#calendar` |
| 主动保存与历史 | `/#notes` |
| 压力练习 | `/#games`、`/#training`、`/#breathing` |
| 文字焚化与黑洞 | `/#private-text` |
| 个人主页与隐私设置 | `/#settings` |

业务 API 使用同源 `/api`。本地开发代理目标由 `API_PROXY_TARGET` 配置，默认 `http://127.0.0.1:3000`。前端不会在真实模式下自动退回模拟成功；后端、数据库和环境变量依照仓库的真实服务运行指南配置。启动页面或构建通过不等于真实 API、生产环境或发布门禁验收通过。

## 桌面入口能力

桌面实现位于 `prototype/electron/`。源码提供紧凑桌宠窗口、受白名单限制的工作台入口、收起/恢复快捷键 `Alt+Shift+P`、点击穿透、窗口边界约束和本机呼吸练习生命周期控制。桌宠窗口与 Web 工作台使用隔离的 Electron 窗口配置；工作台路由使用固定白名单。

启动前需有可运行的 Electron 二进制，并先按 Web/API 配置启动服务：

```powershell
cd prototype
$env:DESKTOP_APP_URL='http://127.0.0.1:5173'
npm run electron:dev
```

当前环境的 `prototype/node_modules/electron/dist/electron.exe` 不存在；Day6 记录的运行时下载也曾因网络失败。因此本日验证覆盖 Electron 控制逻辑的自动化替身测试，不包含原生桌面窗口、系统级点击穿透或目标电脑显示器适配实测。源码能力不等于原生桌面验收完成。

## 浏览器复测复现

先执行 `npm test` 和 `npm run build`，再配置本机 Edge 与 Playwright Core：

```powershell
$env:PLAYWRIGHT_MODULE_PATH = '本机 playwright-core/index.mjs 的绝对路径'
$env:EDGE_EXECUTABLE_PATH = '本机 msedge.exe 的绝对路径'
$env:DAY7_FRONTEND_PORT = '4198'
node docs/beta/程杰/Day7_20261120/tests/frontend-final-smoke.mjs
```

浏览器结果写入本目录的 `evidence/`。脚本使用本机临时预览和合成 API，端口 4198 需空闲。前端单元测试命令为 `npm test`，构建命令为 `npm run build`，两者均在 `prototype/` 目录运行。
