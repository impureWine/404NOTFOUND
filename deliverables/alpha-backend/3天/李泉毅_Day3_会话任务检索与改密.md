# Day 3｜会话、查询任务与改密

计划日期：2026-10-25　负责人：李泉毅（后端）　状态：2026-10-24 已开始提前交付并完成本地自动化；真实检索成功证据仍阻塞

## 已准备

- 会话创建及 PAUSE、RESUME、RESTART、FINISH_REHEARSAL、END 状态动作。
- 查询任务 pending/running/completed/failed/cancelled 状态、所有者隔离与主动取消。
- 会话结束或代次变化后取消未完成任务，迟到结果不再回填。
- SEARCH_PROCESS 许可绑定所有者、用途、操作、会话/活动代次、问题载荷、有效期和撤销状态。
- 修改密码后撤销该账号全部有效会话，旧密码不再可登录。
- 新增会话/查询 HTTP 集成测试，覆盖许可绑定、任务状态查询、其他所有者 404、END 后旧代次创建任务 409。
- 新增多会话改密集成测试，确认同一账号的两个活动会话均被撤销。

## 代码与测试证据

- `backend/src/services/task-service.js`
- `backend/src/services/consent-service.js`
- `backend/test/unit/task-service.test.js`
- `backend/test/unit/consent-service.test.js`
- `backend/test/integration/auth-api.test.js`

最新完整回归：62/62 通过。Wikipedia 适配器离线测试覆盖字段映射、空结果和超时。2026-10-24 23:19（UTC+8）使用问题“软件工程”、限制 3 条、超时 5000 ms 提前执行实网探测，结果为 `TIMEOUT`，耗时约 5.02 秒、来源数 0；所以不声明“真实检索成功”，Day 3 当天仍需在可用网络环境重试并核验来源链接。

## 尚不属于已完成

LangChain 模型适配与命名卡路由已由团队代码接入并通过离线自动化，但真实模型环境与训练链路仍由 AI 负责人验证。查询任务状态暂为单进程内存实现，多实例部署前需迁移到共享队列或数据库。正式 Day 3 站会、非作者复核和前端来源展示字段确认尚未发生。
