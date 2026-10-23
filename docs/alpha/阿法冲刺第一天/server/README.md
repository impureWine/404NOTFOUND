# API 骨架（Day 1）

当前交付只声明已实际具备的能力：Express 服务、统一 JSON/错误封装、128 KiB 请求体限制、`no-store`、健康检查、认证/资料路由注册、共享 Zod 契约与测试。PostgreSQL、AuthService、Cookie/CSRF、业务仓储和 AI 服务尚未接入，因此相关路由对合法请求明确返回 `503 SERVICE_UNAVAILABLE`。

## 启动

要求 Node.js 20.19 或 22.12 及以上受支持版本。

```powershell
cd server
Copy-Item .env.example .env
npm install
npm test
npm run dev
```

访问 `GET http://127.0.0.1:3000/api/health`。响应不包含数据库地址、模型配置、Cookie或其他凭据。

## 目录

- `src/app.js`：Express应用装配，可供测试直接导入。
- `src/routes/`：健康检查及认证/资料路由骨架。
- `src/http.js`：请求编号、统一错误、Schema校验和缓存控制。
- `../shared/contracts/`：前后端共用的严格Zod契约。
- `.env.example`：只含占位值的环境变量样例。

下一步按计划接入 PostgreSQL 迁移、AuthService、安全Cookie、CSRF与账号/资料仓储；在这些验证完成前不得把路由骨架描述为已实现登录系统。
