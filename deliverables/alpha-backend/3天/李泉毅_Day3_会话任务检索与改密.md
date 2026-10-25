# Day 3｜会话、查询任务与改密

计划日期：2026-10-25　负责人：李泉毅（后端）　状态：业务 API、改密与取消处理自动化已完成；真实检索成功证据仍阻塞

## 已准备

- 会话创建及 PAUSE、RESUME、RESTART、FINISH_REHEARSAL、END 状态动作。
- 查询任务 pending/running/completed/failed/cancelled 状态、所有者隔离与主动取消。
- 会话结束或代次变化后取消未完成任务，迟到结果不再回填。
- SEARCH_PROCESS 许可绑定所有者、用途、操作、会话/活动代次、问题载荷、有效期和撤销状态。
- 修改密码后撤销该账号全部有效会话，旧密码不再可登录。
- 新增会话/查询 HTTP 集成测试，覆盖许可绑定、任务状态查询、其他所有者 404、END 后旧代次创建任务 409。
- 新增多会话改密集成测试，确认同一账号的两个活动会话均被撤销。
- 内部模型 HTTP 边界要求已认证账号；匿名请求返回 401 且不会调用模型适配器。
- 认证上下文换发保留原可信入口，避免 DESKTOP 会话被换发为 WEB 后扩大记录可见范围。

## 代码与测试证据

- `backend/src/services/task-service.js`
- `backend/src/services/consent-service.js`
- `backend/test/unit/task-service.test.js`
- `backend/test/unit/consent-service.test.js`
- `backend/test/integration/auth-api.test.js`
- `backend/test/integration/task-api.test.js`
- `backend/test/security/day2-authz.test.js`
- `backend/evidence/day3/wikipedia-real-check-20261024.json`

2026-10-25 完整回归已扩展为 85/85 通过，包含会话/查询 HTTP 流程、任务取消、迟到结果失效、多会话改密、安全专项和 Day 4 记录链回归。Wikipedia 适配器离线测试覆盖字段映射、空结果和超时。

GitHub 提交 `b1447bf` 补充了 2026-10-25 的三次实网复核：11:32:16（8000 ms）为 `TIMEOUT`、11:32:44（30000 ms）为 `SERVICE_UNAVAILABLE`、11:39:18（8000 ms）为 `TIMEOUT`，三次来源数均为 0。结合 2026-10-24 的首次超时，只能证明失败状态被如实记录，仍不能声明“真实检索成功”。该提交还包含 Wikipedia 来源规范、URL 校验和来源证据绑定调整；因本机 `git fetch` 网络失败，本地文档只引用 GitHub 已核对事实，不冒充已同步完整提交。

## 尚不属于已完成

LangChain 模型适配与命名卡路由已由团队代码接入并通过离线自动化，但真实模型环境与训练链路仍由 AI 负责人验证。查询任务状态暂为单进程内存实现，多实例部署前需迁移到共享队列或数据库。正式 Day 3 站会、非作者复核和前端来源展示字段确认尚未发生。
