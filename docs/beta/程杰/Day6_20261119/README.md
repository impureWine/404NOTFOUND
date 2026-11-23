# Beta Day6｜前端候选构建与部署入口核验

执行人：程杰。计划日期：2026-11-19；实际补充执行：2026-11-20（Asia/Shanghai）。基线候选为 `origin/main@8aa020f`。此记录只说明本地前端候选和可用运行条件，不代表整版发布验收或生产系统完成。

关联 [Issue #111](https://github.com/impureWine/404NOTFOUND/issues/111)（B08，程杰协作）。实现与证据提交：`3f37765`；推送分支：`chengjie/beta-day6-frontend-deploy`。

## 处理结果

- 核对 API 配置时发现 `prototype/README.md` 声称默认使用 mock，与 `src/api/client.js` 的固定真实 API 模式不一致；`.env.example` 中的 `VITE_API_MODE` 实际未被读取。已去掉无效变量并澄清：运行时使用同源 `/api`，CSRF 头名通过 `VITE_CSRF_HEADER_NAME` 配置；`API_PROXY_TARGET` 只服务 Vite 开发代理，生产同源部署由后端提供 `/api`。
- 未发现需要修改业务路由或构建资源引用的回归。新增浏览器烟测覆盖构建入口、7 个 hash 路由、3 个旧 HTML 跳转、JS/CSS 资源加载及同源 API 路径；另以本机合成服务确认 Vite `/api` 开发代理会转发至配置的 `API_PROXY_TARGET` 并保留路径。
- 候选源码中 Electron 桌宠能力有 9 项替身/状态测试。实际执行 `npm run electron:dev` 后，Electron 启动器尝试获取 45.0.0 运行时，但下载报 `TypeError: fetch failed`；环境内仍无 `electron.exe`，因此没有原生窗口可供实测。原始阻塞记录见 [evidence/desktop-runtime-check.json](evidence/desktop-runtime-check.json)。正式数据库、后端部署配置和真实 API 连通也未在此环境验证。

## 验证结果

执行环境：Windows、Node.js `v24.16.0`、npm `11.13.0`、Vite `6.4.4`。本地 `prototype` 全量测试 `46/46` 通过，其中桌面替身/计时测试 9 项；`npm run build` 通过，转换 `1599` 个模块；浏览器部署烟测 12 项通过；Vite `/api` 代理以本地合成服务复核通过。结果见 [evidence/frontend-deploy-smoke.json](evidence/frontend-deploy-smoke.json)。自动化 API 响应使用合成 503/200，仅用于验证前端与代理行为，不算真实后端验收。

复跑命令：

```powershell
cd prototype
npm test
npm run build
cd ..
$qaRoot = Join-Path $env:TEMP '404notfound-day5-qa'
$env:PLAYWRIGHT_MODULE_PATH = Join-Path $qaRoot 'node_modules/playwright-core/index.mjs'
$env:DAY6_PREVIEW_PORT = '4186'
$env:DAY6_DEV_PORT = '4187'
node docs/beta/程杰/Day6_20261119/tests/frontend-deploy-smoke.mjs
```

## 未完成的目标环境验收

本次仅检查源码配置、构建产物和本机浏览器预览；本机 `127.0.0.1:3000` 没有 backend 服务，`backend/.env` 与 backend 依赖也未配置；没有读取或提交任何 `.env` 密钥。若要把 Day6 整版候选判为可部署，还需在约定目标环境核验 backend 健康状态、同源 `/api` 与 CSRF/会话行为、正式 PostgreSQL 迁移与恢复；另需在可运行 Electron 的目标电脑补桌宠展开、隐藏恢复、工作台入口与窗口退出复核。未验证项保持阻塞，不据此关闭团队发布检查项。
