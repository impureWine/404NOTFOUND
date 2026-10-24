# Day 2｜认证与资料 API

日期：2026-10-24　负责人：李泉毅（后端）　状态：代码与本地自动化已完成

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

2026-10-24 合并 GitHub 更新后执行 `pnpm test`：31 项通过，0 失败，0 取消；约 7.02 秒。认证用例覆盖注册、登录、资料读写、加密落库、改密撤销旧会话、未授权访问、CSRF 与异源 Origin 拒绝。

## GitHub 当日复核（续查）

2026-10-24 再次 fetch 后发现远端新增 `f1ae4fa`、`1bdb874` 两个前端提交，已通过本地合并提交 `795a1f3` 纳入当前分支。新增内容为同源 API 适配器、模拟数据清单、路由和 REQ14 页面私有状态；未覆盖后端文件。合并后后端复跑 31/31 通过；前端新增单测 5/5 通过，Vite 构建通过。前端 README 仍准确标记“尚未真实联调”。

## 边界

结果来自 PGlite 集成环境，不等同正式 PostgreSQL、浏览器联调或生产部署验收。正式环境需配置随机 32 字节密钥并启用 Secure Cookie。当前前端适配器与后端路由名称大体对应，但页面仍使用 mock，不能把“适配器可构建”写成“认证链路已经联调”。
