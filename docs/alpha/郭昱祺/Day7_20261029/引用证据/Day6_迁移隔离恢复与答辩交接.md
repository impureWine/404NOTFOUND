# Day 6｜迁移、隔离、恢复与答辩交接

> 日期：2026-10-28
> 候选代码基线：`0.1.0-alpha.20261027.zkh-day5`
> 团队主线候选提交：`734b5f5`
> 验证范围：Node.js v24.22.1、PGlite PostgreSQL WASM隔离实例
> 状态：本地开发与隔离验证材料，不代表正式PostgreSQL部署或生产验收。

## 环境和迁移

- 未发现 `DATABASE_URL`、`DATABASE_SSL` 或正式密钥配置。
- 本机未发现 `psql`、`pg_dump`、`pg_restore`，没有授权的PostgreSQL 16演示环境。
- 按 Day 6 环境分支使用 PGlite 隔离实例复核。干净库依次应用：
  `001_baseline.sql`、`002_data_service_support.sql`、`003_interface_contract_alignment.sql`、
  `004_auth_http_support.sql`、`004_identity_repository_support.sql`。
- 第二次执行迁移返回空列表；恢复的隔离数据库也通过迁移校验，返回空列表。
- 本次没有修改DDL，不新增迁移文件，也不修改已执行迁移的校验和。

## 隔离与恢复验证

命令：

```powershell
pnpm exec node --test test/integration/day6-demo-restore.test.js
```

专项用例在合成数据上检查：

- 两个账号各自的WEB入口记录在备份恢复后仍可读取。
- B账号不能读取A账号的记录，越权读取仍返回统一的`NotFoundError`。
- 恢复数据在删除日志重放确认参数缺失时被守卫拒绝。
- 应用层确认删除日志重放后，恢复出来的旧会话被撤销。
- 恢复后保留2条合成记录、2条合成消息和5条迁移记录。
- 本次隔离快照的待发布删除outbox数量为0。

这项PGlite验证只证明隔离快照导入和应用层恢复守卫的行为。`deletionLogReplayCompleted`是调用方提供的布尔前置条件；该代码不读取、验证独立删除日志的连续性，也不实际执行外部日志重放。正式恢复仍须由运维在批准的PostgreSQL 16环境执行加密`pg_dump`/`pg_restore`，先重放独立删除日志，再撤销旧会话并核对outbox后开放服务。

执行命令：

```powershell
pnpm exec node --test test/integration/migration.test.js test/integration/record-repository.test.js test/integration/saved-query-repository.test.js test/integration/deposit-and-restore.test.js test/integration/day6-demo-restore.test.js test/security/day2-authz.test.js test/security/day4-destroy-and-clearing.test.js
```

最终结果：49项通过、0失败、0跳过，耗时10.47秒。新增Day 6专项恢复用例单独执行也通过（1/1）。测试环境为Node.js v24.22.1与PGlite PostgreSQL WASM隔离实例。

## 查询来源抽查

尝试使用当前真实Wikipedia适配器以合成查询词`Wikipedia`发起一次检索，调用结果为`SERVICE_UNAVAILABLE`，没有返回来源；因此本次没有可抽查的真实来源URL，也不能将实网来源验证记为通过。现有自动化覆盖固定主机校验、来源字段映射、空结果、无效来源、重复来源、超时和主动取消；合成响应不替代真实链接可访问性抽查。

答辩时应展示一条真实来源成功的运行记录；若演示当时网络仍不可用，应展示明确的失败状态和既有脱敏记录，并说明当天未能完成实网链接核验，不展示不存在的成功结果。

## 答辩讲解提纲

1. 所有持久私密记录的查询条件同时使用服务端会话确定的账号与入口作用域。
2. 幂等键处理重复请求，`expectedVersion`处理并发旧版本写入，两者解决不同问题。
3. 查询历史从服务端完成的检索任务复制来源和主张，客户端不能自造证据链；来源不可靠时结果和主张会降级。
4. 清除先在事务中使记录不可见并创建删除outbox；外部缓存、备份和第三方清理仍须部署流程验证。
5. 恢复前须重放独立删除日志并撤销旧会话。当前隔离测试只验证PGlite恢复和应用层守卫，不等于正式恢复演练。

## 未关闭事项与交接

| 事项 | 现状 | 影响 | 建议责任人/前置条件 |
|---|---|---|---|
| PostgreSQL 16迁移与恢复演练 | 未验证；本机没有服务及客户端工具 | 不能证明正式数据库兼容、权限和pg_dump/pg_restore流程 | 曾俊涛提供授权隔离环境；庄剀涵配合迁移和核对 |
| Wikipedia实网来源链接 | 本次请求返回`SERVICE_UNAVAILABLE`，来源数为0 | 当天不能确认实网来源链接可访问 | 网络可用时由庄剀涵复跑，曾俊涛记录脱敏结果 |
| 独立删除日志重放 | 只有应用层布尔守卫，没有日志读取/连续性校验 | 不能声称已完成外部删除日志重放或备份删除 | 运维/数据负责人提供独立日志机制与授权恢复流程 |
| 非作者复核 | 尚未得到非作者签认 | 作者自测不能作为团队验收 | 曾俊涛复核迁移/恢复；关欣复核归属和清除边界 |

## 当日汇报

完成：PGlite干净迁移重复执行、Day 6账号/入口隔离与快照恢复专项验证；材料列明演示限制和答辩边界。

困难：没有正式PostgreSQL 16工具/授权实例，真实Wikipedia请求失败，独立删除日志没有可供重放的外部服务。

下一步：由非作者复核本次记录；有授权环境后执行正式迁移及恢复；网络可用后重新抽查真实来源链接。

心得：恢复数据安全不仅是把数据库文件载入，还依赖独立删除日志的完整重放和旧会话失效；隔离测试只能验证实现中的守卫，不能替代运维侧证据。

AI辅助：用于整理Day 6验证步骤、测试草稿和答辩提纲；提交者检查代码差异、命令和测试输出后采用。AI没有替代正式数据库、网络或非作者评审。
