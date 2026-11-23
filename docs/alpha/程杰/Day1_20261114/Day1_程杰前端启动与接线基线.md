# Beta Day1｜程杰前端启动与接线基线

日期：2026-11-14  
负责人：程杰（前端）  
候选仓库：`https://github.com/impureWine/404NOTFOUND.git`  
工作分支：`chengjie/day7-frontend-final-handoff`  
检查基线：`0db494338a9201801979431671f2f3abbc7509c0`  
基线确认 Issue：[#117](https://github.com/impureWine/404NOTFOUND/issues/117)。Beta 功能待办沿用已有 [#104](https://github.com/impureWine/404NOTFOUND/issues/104)、[#105](https://github.com/impureWine/404NOTFOUND/issues/105)、[#106](https://github.com/impureWine/404NOTFOUND/issues/106)、[#107](https://github.com/impureWine/404NOTFOUND/issues/107)、[#108](https://github.com/impureWine/404NOTFOUND/issues/108)、[#110](https://github.com/impureWine/404NOTFOUND/issues/110)、[#111](https://github.com/impureWine/404NOTFOUND/issues/111)；不重复创建同范围 Issue。

## 1. 启动与验证

| 项目 | 本次结果 | 验收边界 |
|---|---|---|
| Node.js / npm | `v24.16.0` / `11.13.0` | 本机环境记录 |
| React 测试 | `npm test` 通过，12/12 | Node 单测，不是浏览器端到端或真实服务测试 |
| 生产构建 | `npm run build` 通过；Vite `6.4.4`，1592 modules | 不代表后端或桌面入口已验收 |
| React 首页 | `http://127.0.0.1:5173/` 返回 HTTP 200 | Vite 开发服务正在运行；默认 API 模式为 mock |
| UX 组件展示 | `/ux-components.html?page=home&state=normal` 返回 HTTP 200 | 合成数据状态展示，不调用业务 API |
| 静态 Web 原型 | `web-prototype/` 下 24 个 HTML 页面返回 24/24 HTTP 200 | 使用 `http://127.0.0.1:5188/home.html`；该目录没有根首页，`/` 返回 404 属预期 |
| Electron 源码 | 主进程、preload、renderer 的 `node --check` 均通过 | 仅语法检查 |
| Electron 桌面入口 | Electron `v45.0.0` 启动后，系统观察到窗口“404NOTFOUND 桌宠样机”及有效窗口句柄 | 仅确认进程创建了窗口；本次未截图或逐项操作，透明、置顶效果、拖动、穿透、快捷键恢复、DPI、多屏与退出行为仍未验收 |

起初 `prototype/node_modules` 缺少 Vite 命令；按锁文件执行 `npm ci --ignore-scripts` 后测试与构建正常。安装过程未修改 `package-lock.json`。仓库自带 Electron 下载在本机因 `fetch failed` 未完成；启动时临时复用了同版本的本地 Electron 二进制，并通过 `ELECTRON_OVERRIDE_DIST_PATH` 指向该缓存，没有改动缓存仓库或提交内容。

复测命令：

```powershell
cd prototype
npm test
npm run build
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Electron 下载失败时，本次复用的本机缓存路径为 `D:\大学\companion-prototype\404NOTFOUND-main\prototype\node_modules\electron\dist`；需设置 `ELECTRON_OVERRIDE_DIST_PATH` 后再运行 `npm run electron:dev`。该路径依赖另一个本地克隆存在，不是干净环境的可移植启动方案。

React 服务目前监听 `5173`；静态原型曾用独立 `5188` 服务检查，检查后已停止。两者是不同入口；运行中的桌面窗口基于本分支源码。

## 2. 页面与 API 对照

| 入口/页面 | 当前实现 | API 接线与状态 |
|---|---|---|
| React 首页 `/` | `prototype/src/App.jsx` | 页面主体、访客说明、REQ14 临时输入区和记录模块。默认 `apiMode=mock`；不存在本地 `.env`，登录等请求不会伪装成功 |
| 登录/注册/账户显示 | `src/auth/useAuth.js`、`AuthDialog.jsx` | 真实模式下调用 `GET /api/auth/context`、注册、登录、`GET /api/profile`、退出；登录目标为 `HOME`。需要运行中的服务及 CSRF 配置；资料编辑尚未接入 |
| 主动保存/本人历史 | `src/records/RecordVault.jsx`、`useRecordVault.js` | 真实模式调用用途确认、记录创建/列表/详情、两阶段清除确认与清除。当前保存类型固定为 `CONVERSATION`；详情只显示元数据，不解密正文。访客与 mock 模式不会请求或显示虚构历史 |
| REQ14 临时文字区 | `src/req14/TextDestructionTool.jsx`、`useTextDestructionState.js` | 当前本地状态处理，不调用业务 API；本次没有做浏览器 Network/Storage/遥测运行时扫描 |
| UX 状态展示 `/ux-components.html` | `src/ux-showcase/` | 预设正常、等待、空、失败等展示状态，使用合成数据，不调用认证、模型、检索或记录 API |
| 陪伴、查询、情绪卡、训练及记录等旧入口 | 首页导航链接到 `web-prototype/*.html` | 当前是静态/本地交互原型。页面可打开、状态可操作不等于真实模型、检索、训练或存储接入 |
| Electron 桌宠 | `prototype/electron/main.cjs`、`renderer.html`、`preload.cjs` | 独立本地窗口样机；不加载账号 Cookie，不接入业务 API，不等同已完成桌面业务入口 |

Vite 配置将 `/api` 代理至 `API_PROXY_TARGET`（默认 `http://127.0.0.1:3000`）。`.env.example` 提供 real 模式及 CSRF 配置示例；真实模式开关只会尝试请求服务，不证明后端可用或联调通过。

## 3. 取消与换号检查

| 场景 | 代码位置 | 当前行为与差异 |
|---|---|---|
| 初始认证上下文卸载 | `src/auth/useAuth.js` | 初始化 `getAuthContext/getProfile` 使用 `AbortController`，组件卸载时中止本地请求 |
| 登出与切换身份 | `useAuth.js`、`App.jsx`、`useRecordVault.js` | 登出先清内存 CSRF、资料和私密界面并递增 `identityKey`；记录组件随身份 key 变化卸载，清列表/详情/待确认状态并 abort 在途浏览器请求。之后再向服务端核实退出；网络失败时标记待核实，可重试核实 |
| 换账号 | `useAuth.js` | 需先退出再登录；若认证上下文已登录，登录提交会读取当前资料而不是直接切换账户。没有自动迁移游客或旧账号内容的路径 |
| 保存/清除中的本地取消 | `useRecordVault.js` | 保存确认提交前可取消；保存请求开始后不提供远程取消，结果未知时保留同一请求标识并禁止改换载荷。清除需先申请一次性确认，最终清除发出后结果未知则保留待核实状态 |
| 陪伴/查询任务取消与切换 | `src/api/client.js` | 有会话动作、任务读取和 `cancelAgentTask/cancelSearchTask` 适配器方法，但 `src` 的页面代码没有调用任务创建、轮询、取消或会话切换方法。现有流程没有真实任务生命周期或迟到响应回填控制 |

`AbortController.abort()` 只停止/中止浏览器侧请求接收，不证明服务端任务已取消；当前任务取消 API 未接到交互页面，因此不能将本地停止、关闭窗口或换号写成服务端取消/终止。

## 4. Day1 结论与待办

- 已完成 Web/React 启动、测试、构建和页面/API 盘点；静态演示与 API 已接线部分分开登记。
- Electron 主窗口已启动，但因本机 Electron 包下载失败采用同版本缓存；尚缺窗口截图和透明/置顶/拖动/穿透/退出等逐项交互证据。
- `FE-D1-01`：待后端与 AI 契约确认后，接入陪伴/查询/训练任务、用途授权、轮询、服务端取消、会话代次和迟到回复丢弃；验收覆盖取消、切换模式、换号及结果迟到。对应现有 [#104](https://github.com/impureWine/404NOTFOUND/issues/104)、[#106](https://github.com/impureWine/404NOTFOUND/issues/106)、[#107](https://github.com/impureWine/404NOTFOUND/issues/107)、[#108](https://github.com/impureWine/404NOTFOUND/issues/108)。负责人/协作及独立复核按各 Issue 记录执行。
- `FE-D1-02`：在不依赖其他克隆目录的环境完成 Electron 二进制安装/启动；按能力矩阵补窗口行为实测及截图。沿用 [#110](https://github.com/impureWine/404NOTFOUND/issues/110) 与 [#111](https://github.com/impureWine/404NOTFOUND/issues/111)，不重复创建；当前不修改 Electron 依赖或系统 ACL。
- `FE-D1-03`：真实认证、记录、模型和检索服务需使用团队指定的隔离环境及合成账号联调；认证/记录/新环境条件沿用 [#104](https://github.com/impureWine/404NOTFOUND/issues/104)、[#105](https://github.com/impureWine/404NOTFOUND/issues/105)、[#111](https://github.com/impureWine/404NOTFOUND/issues/111)。本次未修改后端契约、数据库或其他成员文件。
- `FE-D1-04`：确认程杰后续前端实现采用的候选分支/SHA，并同步修正路径与交接；由新建 [#117](https://github.com/impureWine/404NOTFOUND/issues/117) 跟踪。确认前不切换或重写其他成员分支。

本记录只反映本机候选分支及本次运行结果，不代表生产发布、真实服务验收或团队非作者复核完成。
