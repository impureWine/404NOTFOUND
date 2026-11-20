# Beta Day2｜程杰前端身份失效与统一错误反馈

日期：2026-11-15

负责人：程杰（前端）

当前分支：`chengjie/day7-frontend-final-handoff`

实现基线：`ecc1500c00e225e59290804d3be59ab6260a0924`
候选基线确认：[#117](https://github.com/impureWine/404NOTFOUND/issues/117)，其结论在本次本机网络环境下无法读取；本记录仅适用于上述个人分支，不声称已应用于 Beta `main` 候选。

## 1. 本日修订

| 文件 | 修订 | 保护边界 |
|---|---|---|
| `prototype/src/auth/AuthDialog.jsx` | 认证请求进行中禁用关闭、遮罩关闭、模式切换与表单编辑 | 防止用户界面切换后仍有旧模式身份请求继续提交或改变状态 |
| `prototype/src/api/operation-scope.js` | 增加可中止、带代次的最新认证操作作用域 | 新身份操作开始时终止旧请求；迟到回调必须通过 `isCurrent()` 才能更新界面 |
| `prototype/src/auth/useAuth.js` | 首屏身份核验、登录/注册、退出及退出重试统一使用操作作用域；退出先清本地资料、CSRF、私密界面和表单忙碌态 | 旧 profile/登录响应不能覆盖退出后的访客或新身份状态；本地中止不表示服务器已退出 |
| `prototype/src/api/client.js` | 对认证上下文、登录、退出、改密的 CSRF token 更新增加代次隔离 | 迟到 context 不能恢复失效 token；迟到登录完成不能清掉新上下文已取得的 token |
| `prototype/src/api/error-message.js` | 集中认证与记录页面共用的 API 错误文案 | 已知错误码使用一致的安全反馈；网络失败明确服务器处理状态未确认；未知错误沿用契约消息或页面兜底 |
| `prototype/src/records/useRecordVault.js` | 改为调用公共错误映射 | 身份 key 变化时仍由原有 effect 清列表、详情、待确认状态并中止在途浏览器请求 |
| `prototype/src/api/*.test.js` | 增加竞态和错误文案回归用例 | 使用延迟 Promise/fetch 替身；不代表真实认证或服务端任务联调 |

## 2. 验证结果

| 检查 | 结果 |
|---|---|
| `npm test` | 18/18 通过；覆盖延迟旧 context 被退出失效、迟到 login 不覆盖新 CSRF、认证操作代次失效、认证/记录错误文案一致 |
| `npm run build` | 通过；Vite `6.4.4`，1594 modules |
| 真实认证服务/CSRF | 未执行；当前工作分支没有可确认的真实认证服务和已冻结候选契约 |
| A 账号退出后登录 B | 用前端操作代次及记录组件卸载逻辑做代码/单测检查；真实账号隔离未执行 |
| AI/查询服务取消、切页或换号后拒绝旧结果 | 未执行；当前分支没有页面级真实任务协调器，旧的陪伴/查询/训练入口仍为独立演示页 |

## 3. 仍需联调/决议

- 登录/退出 fetch 被本地 abort 后，服务端可能已完成操作；界面不会接纳旧响应，也不会把 abort 说成服务器已取消。远程退出结果未知时继续显示待核实状态。
- 任务创建、轮询、取消及统一错误映射到任务终态仍未接入陪伴/查询/训练页面。沿用现有 [#104](https://github.com/impureWine/404NOTFOUND/issues/104)、[#106](https://github.com/impureWine/404NOTFOUND/issues/106)、[#107](https://github.com/impureWine/404NOTFOUND/issues/107)、[#108](https://github.com/impureWine/404NOTFOUND/issues/108)；不把客户端 abort 写成服务端 `cancelled`。
- 目标分支/SHA 仍待 [#117](https://github.com/impureWine/404NOTFOUND/issues/117) 确认。GitHub API 当前在本机返回 TLS 连接错误，尚不能核实是否已有新答复。确认前不 cherry-pick 到 `main`、不覆盖他人分支、不创建 PR 声称此修订已进入 Beta 候选。
- 本次没有真实服务/浏览器端到端复测；曾俊涛的独立回归待安排。

本交接记录的是本机个人分支实现与本地自动化检查，不代表生产认证、真实远程任务取消、Beta 候选集成或团队验收完成。
