# Day 6｜发布说明与后端答辩讲稿

计划日期：2026-10-28　负责人：李泉毅（后端）　状态：材料草稿于 2026-10-24 提前准备；未进行正式发布、演练或非作者评审

## 发布验证顺序

1. 使用 Node.js 20.19/22.12 或更高版本，复制 `backend/.env.example` 为本机 `.env`。
2. 配置 PostgreSQL 16 `DATABASE_URL`、随机 32 字节 `PROFILE_ENCRYPTION_KEY`、准确的 `APP_ORIGIN`；HTTPS 环境设置 `SESSION_COOKIE_SECURE=true`。
3. 执行 `pnpm install --frozen-lockfile`、`pnpm run migrate`、`pnpm test`、`pnpm start`。
4. 检查 `/health/live` 与 `/health/ready`，再走注册→登录→资料→许可→保存→列表→清除→退出。
5. 检查日志不含密码、Cookie、CSRF、资料明文或记录正文。

## 讲解提纲

- 架构：Express 模块化单体负责 HTTP/应用服务，PostgreSQL 仓储负责事务、隔离、幂等和版本控制，共享 Zod 契约固定请求边界。
- 认证：Argon2id 只保存密码摘要；随机会话令牌只存 SHA-256 摘要；写请求还需要同源 Origin 与 CSRF。
- 隐私：资料和记录正文加密落库；保存必须有绑定具体载荷的短期许可；账号与入口作用域来自服务端会话。
- 并发与清除：requestId 保证幂等，expectedVersion 防止旧写覆盖；清除需要短期一次性确认并产生 outbox。
- 取消：任务绑定会话/活动代次，会话结束或重来后，旧任务取消且迟到结果不回填。

## 如实披露

当前没有正式发布、完整试讲或真实模型成功记录。自动化使用 PGlite；正式 PostgreSQL、浏览器、前端、云环境和多实例任务队列仍需 Day 6 实测。
