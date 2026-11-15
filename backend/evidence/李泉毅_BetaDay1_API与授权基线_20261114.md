# 李泉毅｜Beta Day1 API 与授权基线

日期：2026-11-14  
范围：后端服务、共享 Schema、身份会话、用途许可、任务生命周期与注册幂等

## 1. 当日核对结果

- 共享契约由 `@404notfound/contracts` 提供，注册、登录、会话、用途许可、记录和任务请求均在服务端再次校验。
- 身份由摘要会话 Cookie 解析；普通请求不能覆盖 `accountId` 或 `entryPointId`。
- 写请求必须通过同源 Origin 与 CSRF 校验；私密记录接口还要求已登录会话。
- 用途许可按主体、用途、操作、载荷摘要和五分钟有效期绑定，可撤销。
- 搜索与 AI 任务绑定会话、活动及双代次；暂停、重启、切换、结束、退出、换号或改密会取消或失效相关任务。
- 公开错误类型为 `INVALID_INPUT`、`AUTH_REQUIRED`、`ACCESS_DENIED`、`NOT_FOUND`、`CONFLICT`、`RATE_LIMITED` 和 `SERVICE_UNAVAILABLE`，响应不返回堆栈、SQL 或凭据。

## 2. 本次完成的真实修订

注册 HTTP 服务原先绕过已有的 `IdentityRepository.createAccount`，同一请求重试只能因登录名唯一约束失败。现已改为：

1. 使用独立的 `REGISTRATION_IDEMPOTENCY_KEY` 对规范化登录名与密码载荷生成 HMAC-SHA-256 摘要；
2. 将 `requestId`、服务端载荷摘要和 Argon2id 密码摘要交给仓储事务；
3. 同一 `requestId` 与相同载荷重试返回原账号；
4. 同一 `requestId` 与不同载荷返回 `409 CONFLICT`；
5. 发布检查阻止缺少密钥或仍使用文档占位值的配置。

## 3. 配置变量

| 变量 | 用途 | 公开性 |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL 连接 | 服务端秘密 |
| `PROFILE_ENCRYPTION_KEY` | 资料字段 AES-256-GCM 加密 | 服务端秘密 |
| `REGISTRATION_IDEMPOTENCY_KEY` | 注册重试 HMAC 摘要 | 服务端秘密 |
| `APP_ORIGIN` | Origin 校验基线 | 可公开配置 |
| `SESSION_COOKIE_SECURE` | HTTPS Cookie 安全开关 | 可公开配置 |
| `APP_ENTRY_POINT` | 可信入口身份 | 服务端配置 |

真实值不得写入 Issue、提交、PR、日志或截图。

## 4. 验收证据

计划执行：

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm run check:release
```

测试结果应在执行后据实补充，不以本文代替测试通过证明。正式 PostgreSQL、外部模型、检索账户及云端部署仍需目标环境验收。

## 5. 仍需后续处理

- 注册幂等记录的 24 小时过期清理作业尚未配置。
- 用途许可和任务状态仍为单进程内存状态，多实例共享队列不在 Day1 修订范围内。
- 正式密钥托管、轮换、限流、审计日志和部署监控仍需发布环境负责人落实。
