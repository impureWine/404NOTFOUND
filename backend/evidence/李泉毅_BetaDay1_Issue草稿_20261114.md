# Issue 草稿

## 标题

`feat(auth): 完成 Beta Day1 API、授权基线与注册幂等接入`

## 正文

### 背景

Beta Day1 要求启动并核对共享 Schema、身份会话、任务授权、公开响应、配置变量和错误类型。现有认证、CSRF、用途许可及任务生命周期已有实现，但注册 HTTP 服务仍绕过 `IdentityRepository.createAccount`，无法按 `requestId` 安全重试。

### 负责人

- 李泉毅（@lqy666666）
- 协作/复核：关欣核对授权边界，庄剀涵核对仓储事务，曾俊涛执行非作者回归

### 任务

- [x] 盘点共享 Schema、会话、Origin/CSRF、用途许可与错误类型
- [x] 将注册接口接入仓储注册事务
- [x] 使用服务端独立 HMAC 密钥生成注册载荷摘要
- [x] 补相同请求重试与不同载荷冲突测试
- [x] 更新示例配置、发布检查、README 与 Day1 基线文档
- [ ] 完成锁文件依赖安装
- [ ] 运行完整后端测试与发布检查
- [ ] 提交任务分支和 PR，并由非作者复核

### 验收条件

1. 同一 `requestId` 和相同规范化注册载荷重试返回同一 `accountId`，数据库只创建一个账号。
2. 同一 `requestId` 携带不同载荷返回 `409 CONFLICT`。
3. 注册密码不以明文写入数据库、日志或响应；幂等摘要使用独立服务端密钥。
4. 缺少 `REGISTRATION_IDEMPOTENCY_KEY` 或使用文档占位值时，发布检查阻止发布。
5. 相关自动化测试实际通过，并在 PR 中如实记录 Node、PGlite 和未覆盖的正式环境边界。

### 当前限制

- 当前机器 Node.js 为 20.18.0，项目声明最低 Node.js 22。
- 依赖安装被中断，完整测试尚未运行。
- 正式 PostgreSQL、模型、检索和云端部署不在本 Issue 的已验证范围内。

### 交付位置

- `backend/src/services/auth-service.js`
- `backend/src/security/crypto.js`
- `backend/src/runtime-config.js`
- `backend/test/integration/auth-api.test.js`
- `backend/test/unit/runtime-config.test.js`
- `backend/evidence/李泉毅_BetaDay1_API与授权基线_20261114.md`
