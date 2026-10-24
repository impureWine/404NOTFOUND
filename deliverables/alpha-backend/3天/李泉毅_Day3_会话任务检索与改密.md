# Day 3｜会话、查询任务与改密

计划日期：2026-10-25　负责人：李泉毅（后端）　状态：2026-10-24 提前完成代码与离线验证；当天仍需同步 GitHub 后复核

## 已准备

- 会话创建及 PAUSE、RESUME、RESTART、FINISH_REHEARSAL、END 状态动作。
- 查询任务 pending/running/completed/failed/cancelled 状态、所有者隔离与主动取消。
- 会话结束或代次变化后取消未完成任务，迟到结果不再回填。
- SEARCH_PROCESS 许可绑定所有者、用途、操作、会话/活动代次、问题载荷、有效期和撤销状态。
- 修改密码后撤销该账号全部有效会话，旧密码不再可登录。

## 代码与测试证据

- `backend/src/services/task-service.js`
- `backend/src/services/consent-service.js`
- `backend/test/unit/task-service.test.js`
- `backend/test/unit/consent-service.test.js`
- `backend/test/integration/auth-api.test.js`

完整回归：31/31 通过。Wikipedia 适配器离线测试覆盖字段映射、空结果和超时。2026-10-24 的一次实网调用返回 `SERVICE_UNAVAILABLE`，所以不声明“真实检索成功”，Day 3 当天需在可用网络环境重试并记录结果。

## 尚不属于已完成

LangChain、真实模型摘要和训练链路由 AI 负责人负责，当前后端只提供会话/查询任务边界。任务状态暂为单进程内存实现，多实例部署前需迁移到共享队列或数据库。
