# Day 6｜发布说明与后端答辩讲稿

计划日期：2026-10-28　负责人：李泉毅（后端）

本地提前验证：2026-10-27，`main@7722949` 工作树

状态：发布说明、讲稿和本地隔离验证已完成；正式 PostgreSQL 发布、非作者复核及团队试讲待真实执行

## 本次可复现结果

| 检查 | 结果 | 边界 |
|---|---:|---|
| `backend/npm test` | 111/111 通过 | PGlite 隔离环境，不等于正式 PostgreSQL 16 |
| `backend/npm run test:integration` | 34/34 通过 | 已修复 Windows 下 glob 不展开问题 |
| `server/npm test` | 8/8 通过 | Day 1 独立 API 骨架 |
| `prototype/npm test` | 6/6 通过 | API 客户端适配器测试 |
| `prototype/npm run build` | 通过 | Vite 1588 个模块 |
| 无正式配置运行 `check:release` | BLOCKED | 正确阻断缺少数据库连接和资料加密密钥 |
| 合成 HTTPS 安全配置运行 `check:release` | READY | 只验证配置规则，不连接数据库 |

当前机器实际 Node.js 为 20.18.0，而 `backend/package.json` 声明 Node.js 22 或更高版本；本次测试虽通过，正式候选环境仍必须使用 Node.js 22。

## 授权环境发布顺序

1. 安装 Node.js 22 和 PostgreSQL 16；由环境负责人注入 `DATABASE_URL`、随机 32 字节 `PROFILE_ENCRYPTION_KEY`、准确的 `APP_ORIGIN`，不得写入仓库或日志。
2. HTTPS 环境设置 `SESSION_COOKIE_SECURE=true`、`DATABASE_SSL=true`；生产环境保持 `MIGRATE_ON_START=false`。
3. 执行 `npm ci` 或锁文件对应的冻结安装，再执行 `npm run check:release`；只有返回 `READY` 才继续。
4. 单独执行 `npm run migrate` 并保存脱敏输出，禁止把数据库迁移隐藏在生产服务启动中。
5. 执行 `npm test`、`npm run test:integration`，再启动 `npm start`。
6. 检查 `/health/live` 和 `/health/ready`；使用合成账号走注册、登录、资料、许可、保存、本人列表、详情、两步清除、退出、换账号和改密旧会话失效。
7. 检查日志不含密码、Cookie、CSRF、数据库连接串、资料明文或记录正文。
8. 备份恢复只能先在隔离实例演练；恢复后核对迁移版本、重放删除状态、撤销旧会话，再决定是否开放服务。

## 架构与认证主讲稿

“后端采用 Node.js 与 Express 的模块化单体，共享 Zod 契约负责 HTTP 边界校验。数据层用事务维护账号、资料、会话、许可、任务和记录的一致性。自动化测试使用隔离的 PGlite，因此验证了 SQL 和业务边界，但不替代正式 PostgreSQL 的角色、网络、备份和性能验收。”

“密码使用 Argon2id 摘要，会话随机令牌在数据库中只保留 SHA-256 摘要。写请求同时校验同源 Origin、会话 Cookie 和 CSRF。私密记录的账号与入口来自服务端会话，客户端提交的归属字段会被严格契约拒绝。”

“主动保存需要绑定账号、用途、操作和业务载荷的短期许可。`requestId` 解决相同请求重放，`expectedVersion` 防止不同请求静默覆盖。清除需要两分钟内一次性确认，并在事务中隐藏记录、清理正文关联和写入 deletion outbox。”

## 常见技术问答

- 为什么既要幂等键又要版本号？幂等键处理同一次请求的重放，版本号处理多个不同请求的并发覆盖。
- 为什么客户端不能传账号与入口？它们属于授权边界，只能从已验证的服务端会话派生。
- 改密后为何所有旧页面重新登录？改密事务撤销该账号全部活动会话，旧 Cookie 随即失效。
- 为什么配置检查 READY 仍不能宣布发布成功？它不连接数据库，也不验证网络、迁移、浏览器或运维能力。
- 测试全绿是否说明所有功能完成？不是；AI_PROCESS 许可、正式模型/检索、完整前端端到端和多实例任务队列仍有未完成或未正式验证项。

## 待现场填写

正式发布环境、数据库版本、迁移输出、健康检查、API 冒烟、试讲时间、参与成员、反馈和非作者结论必须在真实发生后填写，不得用本地提前验证代替。
