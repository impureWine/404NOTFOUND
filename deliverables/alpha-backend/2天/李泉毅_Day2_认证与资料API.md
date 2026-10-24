# Day 2｜认证与资料 API

日期：2026-10-24　负责人：李泉毅（后端）　状态：代码、退出专项测试和前端契约对齐已完成

## 对照任务

- 注册、登录、退出已接入 Express。
- 密码使用 Argon2id（19 MiB、time cost 2、parallelism 1），数据库不保存明文密码。
- 登录会话仅保存随机令牌的 SHA-256 摘要；Cookie 为 HttpOnly、SameSite=Lax，生产 HTTPS 时需启用 Secure。
- 写请求执行 Origin 与 CSRF 双重校验。
- 资料读取/修改要求登录，使用版本号乐观锁；简介以 AES-256-GCM 加密后落库。

## 代码证据

- `backend/src/services/auth-service.js`
- `backend/src/security/crypto.js`
- `backend/src/http/request.js`
- `backend/migrations/004_auth_http_support.sql`
- `backend/test/integration/auth-api.test.js`

## 验证结果

2026-10-24 最新执行 `pnpm test`：62 项通过，0 失败，0 取消；约 11.36 秒。认证用例覆盖注册、登录、资料读写、加密落库、退出后旧会话 401、改密撤销同账号全部活动会话、未授权访问、CSRF 与异源 Origin 拒绝。

## GitHub 当日复核（续查）

2026-10-24 再次 fetch 后发现远端新增 `f1ae4fa`、`1bdb874` 两个前端提交，已通过本地合并提交 `795a1f3` 纳入当前分支。新增内容为同源 API 适配器、模拟数据清单、路由和 REQ14 页面私有状态；未覆盖后端文件。合并后后端复跑 31/31 通过；前端新增单测 5/5 通过，Vite 构建通过。前端 README 仍准确标记“尚未真实联调”。

## 边界

结果来自 PGlite 集成环境，不等同正式 PostgreSQL、浏览器人工联调或生产部署验收。正式环境需配置随机 32 字节密钥并启用 Secure Cookie。前端真实模式的登录目标已与共享契约对齐，并已增加 `/api` 开发代理与环境变量样例；页面默认仍为 mock，因此不能把“适配器可构建”写成“浏览器认证链路已完成验收”。
