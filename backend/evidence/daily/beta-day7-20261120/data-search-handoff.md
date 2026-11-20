# 数据与检索维护交接（Beta Day7）

庄剀涵，2026-11-20。对应测试源码 `d60344b79a3039d0e6caf1c5bb36113db0a7f2e1`；当前环境仅本机隔离验证。入口报告：[Day7报告](../Day7_Beta_庄剀涵_20261120.md)。

## 文件与职责

| 位置（仓库相对路径） | 维护内容 |
| --- | --- |
| `backend/src/repositories/record-repository.js` | 账号/入口过滤、列表游标、记录事务、幂等、版本、两步清除 |
| `backend/src/repositories/saved-query-repository.js` | 服务端检索结果保存、网址规范化、逐查询来源快照、来源可靠性降级 |
| `backend/src/services/record-service.js` | 明文公开DTO、加解密、保存许可、历史上下文边界 |
| `backend/src/services/saved-query-service.js` | 已完成查询到保存结构的适配；来源摘录作为UNKNOWN/CONTEXT保存 |
| `backend/src/search/bing-search-provider.js` | Bing经SerpAPI、超时/取消、来源清洗、失败原因 |
| `shared/contracts/record.js`、`search-task.js` | 公共请求与查询任务契约 |
| `backend/src/contracts/records.js`、`search.js` | 仓储输入范围与持久数据契约 |
| `backend/src/db/migration-runner.js`、`restore-safety.js` | 迁移校验和、事务；恢复确认与撤销旧会话 |
| `backend/test/integration/beta-day2-*.js` 至 `beta-day6-*.js` | 数据作用域、清除、检索异常、日期及恢复回归 |

## 数据访问与来源规则

服务端会话决定 accountId/entryPointId；客户端只提供记录ID和操作参数，不能自报他人的作用域。请求ID用于幂等，expectedVersion用于版本冲突；重试保持同一操作请求ID，修改输入须新请求。清除先获取确认，再提交确认ID，不能直接跳过确认。

日期用 `content.recordDate`（DATE，YYYY-MM-DD）归属；`timezoneName` 记录来源时区，`createdAt` 是操作瞬间。日期范围仅支持EMOTION且两端必填、包含两端。列表最多50条，继续使用同范围的nextCursor；跨账号、入口、月份或服务重启应重读第一页。相同日期可有多条记录。

保存查询客户端仅传 searchRequestId、保存requestId和consentId；来源与内容从服务端同账号/入口的成功查询解析。EMPTY/failed/cancelled不可新保存。查询许可与保存许可分开。已保存快照可以独立回看；清除后不得通过旧保存重试复活。

查询来源DTO用 `id`，任务来源ID与数据库来源UUID不必相等，核对时使用所属查询和规范URL。`content.sources` 包含无摘要来源，不能只通过claims推导来源。`publishedAt=null` 不得用retrievedAt填充；检索摘要不是事实证明，UNKNOWN/CONTEXT与uncertaintyNote须如实展示。后续目录更新不改变既有SAVED快照；历史回填LEGACY_BACKFILL不能描述为保存当时原始来源。

## 依赖与命令

Node要求>=22，本次实际v24.22.1。后端锁文件为pnpm-lock.yaml；在 `backend` 运行 `pnpm install --frozen-lockfile`。前端在 `prototype` 运行 `npm ci --ignore-scripts`，仅用于Web构建/测试，跳过脚本的安装不证明Electron可运行。按现有锁文件安装，不手动升级依赖。

无需目标数据库的检查（backend目录）：

```powershell
node --test --test-reporter=tap
node scripts/inspect-data-environment.js
node scripts/verify-search-snapshot.js
node scripts/release-check.js
```

前端检查（prototype目录）：

```powershell
node --test --test-reporter=tap
node node_modules/vite/bin/vite.js build
```

检索脚本在配置有效时会向SerpAPI发一次固定公开问题请求，并在内存PGlite保存核验；缺密钥退出2且不外发。其成功结果不能替代目标数据库验收。预检脚本不发网络请求，可用 `--config-file <本机路径>` 指定本机配置，退出0只表示配置及工具基本存在，2为阻塞，1为输入错误。

## 迁移和目标启动（待环境就绪）

配置仅放后端本机.env或秘密管理：DATABASE_URL、数据库TLS参数、PROFILE_ENCRYPTION_KEY（32字节Base64）、SERPAPI_API_KEY、APP_ORIGIN、SESSION_COOKIE_SECURE。示例中的change-me/全零密钥不可用于目标环境。SEARCH_PROVIDER=bing；BING_SEARCH_MARKET默认zh-CN，SEARCH_TIMEOUT_MS默认15000。APP_ENTRY_POINT由服务端配置，不能由请求覆盖。

明确核对目标独立库后，在backend执行 `node src/db/migrate.js`，再执行 `node src/server.js`。生产迁移是显式发布步骤，不能依赖MIGRATE_ON_START自动升级。目标环境尚未提供，**本轮没有执行这些启动/迁移操作**。

现有7份迁移：001_baseline、002_data_service_support、003_interface_contract_alignment、004_auth_http_support、004_identity_repository_support、005_optional_emotion_fields、006_saved_query_source_snapshots。顺序与校验和由runner管理；不可改旧SQL或手工改校验和。Day5—7无新迁移。包含006的代码需先迁移，回填记录保持LEGACY_BACKFILL。

正式恢复步骤与失败处置见 [Day6目标恢复清单](../beta-day6-20261119/target-recovery-runbook.md)。恢复库保持隔离，确认密钥匹配，实际验证备份后清除的独立日志重放，再撤销旧会话并处理outbox。布尔true不等于日志重放证明，PGlite快照不等于pg_dump/pg_restore。不得恢复旧备份后立即开放服务，也不得用未经验证的逆向SQL回退。

后续优先级、责任人及关闭证据见 [follow-up.md](follow-up.md)。
