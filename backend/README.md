# 数据服务实现

本目录整合 Alpha 冲刺的数据层与后端应用服务：SQL migration、记录仓储、账号与入口隔离、主动保存幂等、乐观锁、清除事务、查询来源绑定、认证资料 API、任务取消，以及可配置的 Wikipedia 检索适配器。

这是一套开发与验收实现，不是已经部署的生产系统。前端、模型链路、正式 PostgreSQL、密钥服务和发布环境仍需对应负责人联调或验收；仓储只接收服务端会话解析出的 `accountId` 和 `entryPointId`，HTTP 请求不得直接提供或覆盖这两个字段。

## 环境

- Node.js 20.19、22.12或更高版本
- PostgreSQL 16
- 包管理器可使用 npm、pnpm 或 yarn

安装依赖后：

```powershell
Copy-Item .env.example .env
npm install
npm run migrate
npm test
npm start
```

真实 PostgreSQL 使用 `DATABASE_URL`。自动化测试使用隔离的 PGlite PostgreSQL WASM 实例，不要求本机安装数据库服务；它能验证迁移和SQL行为，但不能替代正式 PostgreSQL 服务、备份工具、网络、权限与性能验收。

## 已实现边界

- `MigrationRunner`：按文件名顺序执行迁移，并使用 `schema_migrations` 记录校验和。
- `RecordRepository`：创建、带作用域游标的列表、详情、两步确认清除和寄存状态机；所有私密记录均限定账号与入口。
- 保存幂等：同作用域同 `requestId` 和同载荷返回原结果，不同载荷返回冲突。
- 乐观锁：更新和清除需要匹配 `expectedVersion`。
- 清除：先签发两分钟一次性确认；执行时在同一事务清理正文子表、房间关联和授权，令记录不可见，并创建删除任务、目标与 outbox。
- `SavedQueryRepository`：调用方只能提交 `searchRequestId`；仓储从受控的已完成查询解析器复制查询、来源、主张和证据关系，客户端不能自造证据链。
- `WikipediaSearchProvider`：真实调用固定 Wikipedia MediaWiki API；支持超时、空结果和上游错误。
- 合同校验：严格对象、非全零UUID、Unicode码点长度、真实日历日期和IANA时区。
- 认证与资料：Argon2id 密码摘要、仅存摘要的会话 Cookie、Origin + CSRF 校验、资料乐观锁和 AES-256-GCM 字段加密；HTTPS 使用 `__Host-session`，本机 HTTP 开发使用 `session`。
- 应用任务：会话状态、查询任务状态/取消、代次校验，以及结束后拒绝迟到结果回填。
- 用途许可：按账号/匿名会话、用途、操作、五分钟有效期和稳定载荷摘要绑定；支持撤销。
- 记录 HTTP API：主动保存、列表、详情和两步清除；当前纵向链只开放 `CONVERSATION` 创建。

## 主要 HTTP 接口

- `GET /api/auth/context`
- `POST /api/auth/register`、`/api/auth/login`、`/api/auth/logout`、`/api/auth/change-password`
- `GET|PATCH /api/profile`
- `POST /api/consents`、`POST /api/consents/:id/revoke`
- `POST /api/sessions`、`POST /api/sessions/:id/actions`
- `POST /api/search/tasks`、`GET /api/search/tasks/:requestId`、`POST /api/search/tasks/:requestId/cancel`
- `POST|GET /api/records`、`GET /api/records/:id`
- `POST /api/records/:id/clear-confirmations`、`POST /api/records/:id/clear`

除健康检查与首次上下文获取外，写请求需要同源 `Origin`、会话 Cookie 和 `X-CSRF-Token`。私密接口还需要已登录会话。

## 尚未完成或尚未正式验证

- 模型摘要、LangChain 陪伴/训练链路与真实模型环境验证。
- 正式密钥托管、密钥轮换、限流、审计日志和多实例共享任务队列。
- 正式 PostgreSQL 服务、角色权限、网络与性能验收；自动化测试使用 PGlite。
- 云端部署、前端页面完整联调和生产级运维监控。
- Wikipedia 实网请求会受当前网络环境影响；离线自动化只验证映射、空结果与超时行为。

这些项目不得因本目录可运行而描述为已经完成。
