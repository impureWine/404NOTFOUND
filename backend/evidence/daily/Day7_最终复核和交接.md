# Day 7 最终复核准备与后端交接

复核准备日期：2026-10-28（Day7计划日为10月29日，故本文记录前置复跑，不冒充最终日已完成）

本地测试 checkout：`main@1e1eebf`；GitHub 最新可核验提交：`main@2043c069`

本地运行时：Node.js v20.18.0（低于 `backend/package.json` 要求的 Node.js >=22）

## 本地可复跑结果

| 检查 | 命令 | 结果 | 边界 |
|---|---|---:|---|
| 后端全量 | `backend: npm test` | 111/111 通过 | 本地 checkout；PGlite/合成测试 |
| 后端集成 | `backend: npm run test:integration` | 34/34 通过 | 本地 checkout |
| Day1 API骨架 | `server: npm test` | 8/8 通过 | 不包含真实认证业务 |
| 前端 API适配 | `prototype: npm test` | 6/6 通过 | 不等于页面业务 E2E |
| 前端构建 | `prototype: npm run build` | 通过，1588 modules | 构建不证明服务联调 |
| 发布配置 | `backend: npm run check:release` | BLOCKED | 缺 `DATABASE_URL`、`PROFILE_ENCRYPTION_KEY` |
| Wikipedia 实网 | `backend: node scripts/verify-wikipedia-search.js Wikipedia` | TIMEOUT，8秒，来源0 | 无链接可抽查 |

测试基线不是最新远端：GitHub `main@2043c069` 的提交历史含 `a0118cb` Day6恢复专项，而本地 Node 工作树未能 fetch 更新。Day5 独立复核 `34d751c` 为后端120/120、前端6/6，但 13项纵向探针11通过、2未达标；不同 SHA 和不同测试层次不可合并统计。

Day6 数据成员在候选 `734b5f5` 上记录 PGlite迁移/仓储/恢复/权限/清除聚焦49/49及恢复专项1/1。此测试使用应用层 `deletionLogReplayCompleted` 布尔守卫，不验证独立删除日志内容/连续性，也不等于 PostgreSQL 16、`pg_dump/pg_restore` 恢复演练。

## 关键未关闭风险

| 编号 | 当前证据 | 后续门槛 |
|---|---|---|
| D4-12 AI_PROCESS | Day5纵向探针在错误 Origin/CSRF、缺许可时观察到内部模型入口 HTTP 200，计数替身调用1次；无真实模型调用 | 李泉毅/程群修复；关欣复核；曾俊涛复测拒绝请求时模型适配器调用0次，并验证合法授权路径 |
| D4-07 历史DTO | Day5纵向探针观察到正文不可读、响应暴露密文字段 | 李泉毅与庄剀涵/前端明确解密展示契约；先保证 API 不泄露密文且本人可读，再由非作者验A/B与跨入口隔离 |
| 真实检索 | 今日请求TIMEOUT，0来源；Day3/Day6历史也未成功 | 网络可用时重试，核对真实标题/URL；失败保留失败状态 |
| 正式环境 | release gate BLOCKED；无授权PG16、生产密钥、云环境 | Node22+环境、显式迁移、健康检查、合成A/B冒烟和隔离恢复 |
| 最终验收 | 无今日站会、实际工时、试讲或非作者签认材料 | 只能由真实参与人事后补录 |

## API 与运行交接

- 认证/上下文：`/api/auth/context`、`/api/auth/register`、`/api/auth/login`、`/api/auth/logout`、`/api/auth/change-password`。
- 资料：`GET/PATCH /api/profile`，归属来自服务端会话，修改需版本校验。
- 许可：`POST /api/consents`、`POST /api/consents/:id/revoke`；用途和载荷绑定，但 AI_PROCESS 内部模型入口覆盖仍有 D4-12 缺口。
- 会话/查询/Agent/训练：以 `backend/README.md` 和共享契约为准；任务状态当前是内存实现，不支持多实例可靠恢复。
- 记录：创建、本人列表/详情、两步清除；当前 HTTP创建仅开放 CONVERSATION。
- 启动顺序：Node.js 22+；环境注入 `DATABASE_URL`、随机32字节 `PROFILE_ENCRYPTION_KEY`、`APP_ORIGIN`；`npm run check:release`；显式 `npm run migrate`；测试；启动后检查 `/health/live`、`/health/ready`。生产必须 `MIGRATE_ON_START=false`。

## 最终日待实际补充

仍待补充：正式迁移状态、正式环境A/B隔离/保存/清除矩阵、真实检索链接抽查、恢复工具结果、非作者结论、最终版本号/提交号、实际工时、站会与组长接收回执。未取得环境或人员确认的条目保持 BLOCKED/未验证。最新主线全量回归已在下方记录。

## 10月29日当日复核补记

复核基线：GitHub `main@722bc92338f63e82073106d5b2036110b4acf1bd`。在该最新主线执行 `backend/` 下的 `pnpm test`，结果为130项通过、0失败、0跳过，耗时18.05秒；运行时Node.js v24.22.1，数据层使用PGlite隔离实例。回归包括主线新增的AI临时回复与账号切换用例。D5-01/D5-02/D5-10探针仍能复现Origin/CSRF/用途许可缺口、同账号跨入口任务访问及失效会话返回403的既有问题；这些探针断言通过不代表风险修复。

当日 `pnpm run check:release` 返回 `BLOCKED`，原因是缺少 `DATABASE_URL` 和 `PROFILE_ENCRYPTION_KEY`。通过当前固定Wikipedia适配器再次请求，结果为 `SERVICE_UNAVAILABLE`、来源0，未取得可供链接抽查的真实来源。正式PostgreSQL 16迁移/备份恢复、独立删除日志重放、非作者复核、站会及课程提交仍未完成或未提供证据。

本次补记基于当天可获取的最新团队主线，不改变前置复核记录所对应的版本和结果。

答辩 PPT 与演讲稿不属于后端交付范围，由负责展示材料的成员在最终日制作。本交接只涵盖 API、配置、测试证据和遗留风险。
