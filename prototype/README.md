# React 前端 Day 1 交付

本目录是独立的 React/Vite 演示实现，与 `../web-prototype/` 的静态网页原型不自动同步。静态网页首页仍为 `../web-prototype/home.html`。

## 启动

环境要求：Node.js 20.19 或 22.12 及以上版本。

```powershell
cd prototype
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

访问 `http://localhost:5173/`。生产构建使用 `npm run build`，前端适配器单测使用 `npm run test`。

## UX 组件与状态展示（2026-10-24）

独立入口：`http://localhost:5173/ux-components.html?page=home&state=normal`。提供登录、首页、聊天、来源展示的正常／加载／空／失败状态切换；全部采用本地模拟数据。`npm run build` 同时构建现有首页和展示入口。

源码位于 `src/ux-showcase/`，复用 `src/ui.jsx` 中的 Button 与 Panel；[完整交付说明及状态截图](../docs/alpha/郭昱祺/组件展示页交付_20261024/README.md) 记录运行范围与待接入内容。页面装配、认证、模型、检索及保存接口仍待前端整合，演示成功不等于正式接口已完成。

本次工作区也在 `http://localhost:4173/` 启动了开发预览。4174端口提供原有静态首页预览；两个地址对应不同实现。

## API 适配骨架

入口：`src/api/client.js`。当前默认 `VITE_API_MODE=mock`（未设置时也是模拟模式），所有 API 方法会明确报 `API_NOT_CONNECTED`，不会伪造成功或发出请求。

适配器已按接口表提供上下文、能力、认证、资料、会话、陪伴任务、查询任务和记录方法。真实模式使用同源 `/api`、JSON、`credentials: include` 和 `no-store`；写请求需要内存中的当前 CSRF token，以及由共享契约配置的 `VITE_CSRF_HEADER_NAME`。代码不猜 CSRF 头名。认证上下文失效或身份操作结束时清除内存 token。

本地真实模式可复制 `.env.example`，Vite 会将 `/api` 代理到 `API_PROXY_TARGET`（默认 `http://127.0.0.1:3000`）。登录目标使用共享契约枚举 `HOME`。代理和契约测试通过只表示联调条件已准备，不代表浏览器人工流程或正式环境验收已经完成。

当前没有后端联调；设置真实模式只会启用适配调用，不表示后端可用或接口验收通过。

## Day 2 认证与 Electron 样机

首页已接入真实模式下的 `/api/auth/context`、`/api/auth/register`、`/api/auth/login`、`/api/profile` 和 `/api/auth/logout` 适配。默认仍为 mock；未连接时会明确显示 `API_NOT_CONNECTED`，不会伪造登录成功。退出先清理本机私密界面，网络失败时保留“服务器状态待确认”。认证联调的实际执行范围见 `../docs/第三次作业_程杰/07_第二天认证联调记录与Electron样机_20261024.md`。

`electron/` 提供本地透明置顶桌面窗口样机和受限 preload。启动需要已安装 Electron 二进制：

```powershell
npm run electron:dev
```

当前交付记录将 Electron 源码完成与桌面运行验收分开；没有安装二进制时不能把样机写成运行通过。

## 模拟项清单

| 编号 | 页面/数据 | 当前状态 | 重置或边界 |
| --- | --- | --- | --- |
| MOCK-AUTH-01 | 登录、注册、个人主页、演示账户 | 默认浏览器内存模拟；真实模式按认证 API 接线但需服务可用 | 刷新或关闭演示；真实模式以服务端会话为准 |
| MOCK-HOME-01 | 首页最近使用记录 | 固定示例，与用户历史分开 | 隐藏示例或刷新 |
| MOCK-COMPANION-01 | 陪伴交流回复 | 本地预设，不连接模型服务 | 离开页面或刷新 |
| MOCK-SEARCH-01 | 查询摘要、来源与结果状态 | 固定内容，不执行检索；来源仅为示例 | 清空查询或刷新 |
| MOCK-EXERCISE-01 | 练习引导语、排练角色回复 | 静态/预设内容，不调用训练或智能体 API | 退出、重来或刷新 |
| MOCK-RECORDS-01 | 日历、物件、暂存、表达备忘 | 浏览器内存模拟，未接入记录持久化 API | 原型清除操作或刷新 |
| MOCK-REQ14-01 | 文本销毁页面 | 初始句为固定课堂示例；输入正文只在该页面私有内存，不进入通用状态、网络、存储或遥测 | 清空、销毁、路由离开、页面关闭或组件卸载 |
| MOCK-ENTRY-01 | 桌宠与微信入口 | 桌宠为浏览器演示；微信未接入；Electron原生能力未验证 | 无真实入口连接 |

机器可读清单位于 `src/api/mock-data-manifest.js`。以上均为模拟或未接入状态，不代表真实服务已实现或验收通过。
