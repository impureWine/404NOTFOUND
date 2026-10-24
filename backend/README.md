# 数据服务实现

本目录实现庄剀涵在 Alpha 冲刺中的数据工程职责：SQL migration、记录仓储、账号与入口隔离、主动保存幂等、乐观锁、清除事务、查询来源绑定，以及可配置的 Wikipedia 真实检索适配器。

这是一套开发与验收实现，不是已经部署的生产系统。认证会话、正文加密密钥服务、前端和模型链路仍需对应负责人联调；仓储只接收服务端已经确认的 `accountId` 和 `entryPointId`，HTTP 请求不得直接提供或覆盖这两个字段。

## 环境

- Node.js 22 或更高版本（`@langchain/openai@1.7.0` 要求）
- PostgreSQL 16
- 包管理器可使用 npm、pnpm 或 yarn

模型适配开发使用 LangChain JS。当前配置只允许智谱国内官方接口中的
`glm-4.7-flash`，不自动切换其他模型。将 `.env.example` 复制为本地 `.env` 后，
只在 `.env` 中填写 `ZHIPU_API_KEY`；不得把密钥写入源码、文档或提交记录。

模型内部入口为 `POST /internal/v1/model/generate`，请求和响应遵循契约 `1.1`，
并统一返回超时、限流、不可用及输出无效错误。情绪命名卡使用
`NamingCard.select({ emotionWords, need })` 做确定性路由：`LISTEN`/`ORGANIZE`
进入 `COMPANION`，`SEARCH` 进入 `SEARCH` 并要求先补充具体问题；选词本身不会
触发模型调用、检索或持久化。

安装依赖后：

```powershell
Copy-Item .env.example .env
npm install
npm run migrate
npm test
npm start
```

离线查看正常、超时、不可用和命名卡路由样例：

```powershell
npm run sample:ai
```

在本地 `.env` 已配置有效密钥时，用合成输入进行一次真实模型冒烟调用：

```powershell
npm run smoke:model
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
- 模型适配：LangChain JS 配置白名单、契约校验、最小上下文构造、统一输出校验、
  合成输入和离线失败替身；提供内部调用入口、超时控制和真实调用冒烟脚本。
- 命名卡路由：按用户明确选择将 `LISTEN`/`ORGANIZE` 路由到陪伴，或将
  `SEARCH` 路由到查询澄清，不自动调用模型、检索或保存。

## 未包含

- 用户密码、Cookie、CSRF和登录会话HTTP实现。
- 真实正文加密和密钥轮换。测试只使用合成字节数据。
- 完整 `/api/agent/tasks` 异步业务链路、认证授权、前端接入和端到端验收。
- 搜索任务内存服务和SAVE许可服务；当前仓储通过注入的服务端解析器接收已完成结果。
- 正式服务器部署、PostgreSQL角色权限、`pg_dump`/`pg_restore`恢复演练。
- 前端页面联调。

这些项目不得因本目录可运行而描述为已经完成。
