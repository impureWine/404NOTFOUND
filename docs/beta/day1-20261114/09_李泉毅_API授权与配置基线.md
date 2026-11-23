# 李泉毅｜API、Schema、会话与授权基线

## 服务边界

- 主业务服务：`backend/`，提供认证、资料、许可、会话、AI/查询任务、训练、记录、查询保存和健康检查。
- `server/` 是历史 Day1 API 骨架；其8项测试通过，但认证业务仍返回明确的 unavailable，不能作为主服务。
- 共享 Schema：`shared/`；HTTP 请求不得自报 `accountId` 或 `entryPointId`，归属来自服务端会话与 `APP_ENTRY_POINT`。

## 授权与错误基线

| 边界 | 当前规则 | 验证证据 |
| --- | --- | --- |
| 身份 | Cookie仅存摘要；退出/改密撤销会话 | 后端全量回归与安全用例通过 |
| 写请求 | 同源 Origin + CSRF；登录态按路由要求 | 缺失/错误 CSRF、外部 Origin 被拒 |
| 入口 | 记录和任务同时绑定账号与可信入口 | 跨账号/跨入口读取、取消、清除被拒 |
| 用途许可 | AI、查询、保存分别绑定用途、操作、载荷摘要、有效期与撤销状态 | AI_PROCESS不能替代SAVE |
| 生命周期 | 会话/活动代次变化、暂停、结束、换号会取消任务并拒绝迟到结果 | 相关单元及集成用例通过 |
| 错误 | 公开稳定 code/message/requestId；未知异常不回传内部细节 | API客户端及安全用例通过 |

## 配置变量

必须本地提供：`DATABASE_URL`、独立随机 `PROFILE_ENCRYPTION_KEY`。按能力可选：`ZHIPU_API_KEY`、`SERPAPI_API_KEY`、微信回调变量。生产环境还需 HTTPS `APP_ORIGIN`、`SESSION_COOKIE_SECURE=true`，且迁移作为显式发布步骤。密钥不得提交。

Day1发布检查为 `BLOCKED`：缺少 `DATABASE_URL` 与 `PROFILE_ENCRYPTION_KEY`。这是本机配置阻塞，不是业务断言失败。PGlite自动化验证了迁移与SQL行为，不能替代正式 PostgreSQL、权限、备份和性能验收。

## 已发现差异

`.env.example` 与 README 写 `glm-4.7-flash`，实际白名单和运行输出为 `glm-4.5-flash`。在供应商与团队确认前不得凭文档任一侧改动生产模型；已列入 AI 异常清单。
