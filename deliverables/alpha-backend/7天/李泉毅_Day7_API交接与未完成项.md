# Day 7｜最终 API 交接与未完成项

负责人：李泉毅（后端）　复核准备：2026-10-28

本地实测代码：`main@1e1eebf`（本地 checkout）；GitHub 最新可核验 `main@2043c069`。本机 fetch 不可用，因此今日测试不能宣称运行于最新远端 SHA。

状态：Day7 最终复核准备与交接已完成；正式环境、修复后红灯复测和团队确认仍待实际发生。

## 今日本地验证

| 检查 | 结果 | 范围限制 |
|---|---:|---|
| 后端 `npm test` | 111/111 通过 | 本地 `1e1eebf` 工作树；PGlite/合成测试；Node.js 20.18.0，低于 backend 声明的 >=22 |
| 后端 `npm run test:integration` | 34/34 通过 | 本地 `1e1eebf` 工作树 |
| Day1 独立 API `npm test` | 8/8 通过 | 仅 API 骨架合同与状态 |
| 前端 API 适配器 `npm test` | 6/6 通过 | 不代表完整页面端到端 |
| 前端 `npm run build` | 通过 | Vite 1588 modules；构建不等于联调 |
| `npm run check:release` | BLOCKED | 缺少 `DATABASE_URL`、`PROFILE_ENCRYPTION_KEY` |
| Wikipedia 实网抽查 | TIMEOUT | `Wikipedia` 查询，8秒超时，来源数0；无链接可抽查 |

Day5 精确提交 `34d751c` 的独立交叉场景记录为后端120/120、前端6/6，但 13 项记录/许可纵向探针只有11项达标、2项未达标；该结果不与今日111/111相加，也不能用单元/集成全绿掩盖业务验收阻塞。

Day6 数据成员在 `734b5f5` 候选上记录 PGlite 恢复专项1/1、迁移/仓储/恢复/权限/清除聚焦49/49。该测试不验证正式 PostgreSQL、`pg_dump/pg_restore` 或独立删除日志的实际重放。Day6 团队试讲没有可核验证据，不代填人员、时间或反馈。

## API 交接

| 范围 | 路径 | 主要边界 |
|---|---|---|
| 健康 | `GET /health/live`、`GET /health/ready` | readiness 失败只给通用数据库不可用信息 |
| 上下文/认证 | `GET /api/auth/context`；`POST /api/auth/register`、`login`、`logout`、`change-password` | Cookie 会话；变更请求须同源 Origin + CSRF；改密撤销全部旧会话 |
| 资料 | `GET/PATCH /api/profile` | 账号由服务端会话确定；修改需版本校验 |
| 用途许可 | `POST /api/consents`、`POST /api/consents/:id/revoke` | 绑定主体、用途、操作、载荷及有效期；注意当前 AI_PROCESS 完整覆盖存在未关闭缺口 |
| 会话/搜索 | `POST /api/sessions`、`POST /api/sessions/:id/actions`、`POST /api/search/tasks`、查询/取消任务 | 所有者及活动代次隔离；取消后迟到结果不得回填；当前内存状态不支持多实例恢复 |
| Agent/训练 | `/api/agent/tasks`、`/api/trainings` | 具体可用状态以对应服务及用例为准；不承诺多实例可靠性 |
| 记录 | `POST/GET /api/records`、`GET /api/records/:id`、清除确认与清除 | 账号+入口作用域、主动许可、幂等、版本及两步清除；当前纵向创建只开放 CONVERSATION |

路径、请求限制和配置变量以 `backend/README.md`、`backend/.env.example` 与 `shared/contracts/` 为准。生产迁移必须显式执行，`MIGRATE_ON_START=false`。

## 仍阻塞/未验证

1. **D4-12 / AI_PROCESS**：已登录并不等于同意模型处理。最新 Day5 纵向探针在错误 Origin/CSRF、缺许可时仍观察到内部模型入口 HTTP 200，计数模型替身调用1次（未调用真实模型）。需李泉毅/程群修复，关欣复核，再由曾俊涛复测无授权时拒绝且适配器调用数为0。
2. **D4-07 / 历史 DTO**：Day5 纵向探针观察到本人历史正文不可读，公开响应暴露密文字段。需与庄剀涵、前端程杰明确服务端解密/展示契约并修复；不可通过直接返回密文冒充“本人可读”，不可在未定义密钥边界前自行扩大接口。
3. **最新 SHA 回归**：今日测试基于本地 `1e1eebf`，不是远端 `2043c069`；需在 Node.js 22+、冻结依赖的干净最新提交上重跑全量和集成。
4. **正式环境**：无正式 `DATABASE_URL`、资料加密密钥和授权 PostgreSQL 16 环境；release gate 为 BLOCKED。未验证生产 HTTPS、真实数据库角色/网络/性能、加密 `pg_dump/pg_restore`。
5. **恢复安全**：PGlite 测试的 deletion-log replay 参数是调用方布尔前置条件，不校验独立删除日志完整性、不代表实际重放完成。
6. **真实检索**：Day3 曾 TIMEOUT/SERVICE_UNAVAILABLE，Day6 曾 SERVICE_UNAVAILABLE；今日再次 TIMEOUT、来源0。真实来源 URL 可访问性未验。
7. **真实业务演示/非作者签认**：完整浏览器页面保存-历史-清除闭环、AI_PROCESS 授权、团队站会/试讲和非作者评审均无本次证据。

## 当天须由真实执行补录

最终候选 SHA/标签、最新 SHA 全量回归、正式迁移与健康/API 冒烟、最终 A/B 隔离矩阵、真实来源链接抽查、恢复证据、非作者评审、实际工时、张王昊接收回执、站会记录和博客/课堂链接。不得将计划时间或历史截图填写为当天已完成。

演示文稿及答辩讲稿不属于本后端交付范围，由负责 PPT 的成员在最终日完成；本交接只保留 API、配置、安全边界、测试和未完成事项。
