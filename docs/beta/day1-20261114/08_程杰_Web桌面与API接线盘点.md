# 程杰｜Web、桌面入口与 API 接线盘点

## 启动结果

- React：`npm ci`、`npm test`、`npm run build` 成功；46项测试通过，Vite产物生成于 `prototype/dist/`。
- 桌面：源码入口为 `npm run electron:dev`，本次未启动可视窗口；桌面相关自动化 12项（测试18—29）通过，只证明受测逻辑。
- HTML：`web-prototype/` 为独立评审原型，不与 React 或真实 API 自动同步。

## 页面/API 对应

| 页面能力 | 前端调用 | 后端入口 | Day1状态 |
| --- | --- | --- | --- |
| 登录、退出、换号 | `/api/auth/*`、`/api/profile` | `backend/src/app.js` 认证与资料路由 | 已接线；真实页面链待浏览器复测 |
| 命名、陪伴 | naming-card、sessions、agent/tasks、consents | 同名 `/api` 路由 | 已接线；真实供应商未配置 |
| 查询与来源 | search/tasks、saved-queries | 查询任务及受控保存路由 | 已接线；真实搜索未配置 |
| 训练 | trainings 创建、读取、动作 | `/api/trainings*` | 已接线；四类本地控制器测试通过 |
| 历史与清除 | records、clear-confirmations、clear | `/api/records*` | 已接线；集成层已有隔离、幂等、清除测试 |

## 模拟与真实边界

`prototype/src/api/client.js` 当前固定 `apiMode = 'real'`，只允许同源 `/api/`、携带 Cookie、禁用缓存，并在写请求附加内存中的 CSRF。仓库仍保留 mock 客户端测试，mock 模式会明确抛出 `API_NOT_CONNECTED`，不会伪装请求成功。

退出、登录、改密均在 `finally` 清除 CSRF；页面卸载使用 AbortController 或资源控制器。服务端任务用账号/匿名会话、可信入口、会话/活动代次共同限制，取消和上下文失效会删除迟到结果。

## 待修订任务

1. B01：在真实浏览器复测退出、换号、切入口和迟到回复，不以单元测试代替页面证据。
2. B02：核对重复保存、两步清除后的列表/详情同步及焦点恢复。
3. B07：桌面窗口、点击穿透、隐藏/恢复与退出需实际窗口记录；日历为条件投入项。
