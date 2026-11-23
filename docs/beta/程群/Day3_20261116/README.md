# Beta 冲刺 Day 3｜AI 任务生命周期修复与验证

负责人：程群。日期：2026-11-16。基线：`origin/main@455a17c`。本记录只描述本分支的代码与本机自动化结果，不代表生产系统验收完成。

## 1. 当日目标

承接 Beta Day 2 安全专项 Issue #137 的 T-03 组缺口及 B01 Issue #132：

- 会话 `END` 后，已经完成但尚未消费的 AI 结果失效；
- `RESTART` 后，上一活动已经完成的 AI 结果失效；
- 撤回 `AI_PROCESS` 许可后，由该许可产生的任务结果失效；
- 三条路径均继续阻止在途供应商迟到回复回填。

三种触发面属于同一类任务生命周期问题，不重复统计为三项独立缺陷。

## 2. 实现结果

| 变更 | 可观察结果 |
| --- | --- |
| `END`、`RESTART` 使用包含已完成任务的会话清理 | 旧任务保留可诊断的 `cancelled` 终态，`result` 被删除 |
| AI／查询任务在服务端内部关联 `consentId` | 该字段不会进入公开任务 DTO |
| 撤回许可后调用任务失效逻辑 | 同一许可产生的未过期任务转为 `cancelled`，结果、来源与失败细节被清除 |
| 抽取统一任务清理函数 | 会话结束、重来、许可撤回使用相同的状态和字段清理规则 |

当前 API 采用“HTTP 200 + `status=cancelled` + 无结果正文”的兼容口径，而不是把已知任务改为 404。这样前端可以区分“任务已失效”和“任务不存在”，同时不能继续显示旧结果。

## 3. 自动化验证

安装命令：

```powershell
cd backend
corepack pnpm install --frozen-lockfile
```

定向验证：

```powershell
node --test test/unit/companion-task.test.js test/unit/task-service.test.js test/security/beta-day2-authz-matrix.test.js
```

结果：`23/23` 通过，`0` 失败。生命周期关键观察值：

```text
[B2-T-03] completed=200/result=true; END=200; reread=200/result=false/status=cancelled
[B2-REVOKE] reuse=403; reread=200/result=false/status=cancelled
[B2-RESTART] restart=200; reread=200/result=false/status=cancelled
```

后端全量验证：

```powershell
corepack pnpm test
```

结果：`174/174` 通过，`0` 失败，`0` 取消，`0` 跳过。相较基线新增两条单元断言，分别覆盖“结束后清除已完成回复”和“许可撤回后清除已完成回复”。Beta Day 2 的 HTTP 安全矩阵已收紧为确定性断言，不再只记录 200/404/403 的任一观察值。

## 4. 边界与交接

- 本次使用合成账号、内存任务状态、PGlite 和模型替身；未调用真实模型，不能证明供应商停止计费或停止服务端计算。
- 任务仍是单进程内存状态；多实例共享、进程重启恢复和生产级任务清扫不在本次范围。
- Beta Day 2 发现的任务创建限流未实现，本次未顺带扩展范围。
- 尚待关欣／曾俊涛在合并候选上独立复核；前端应按 `cancelled` 且无 `result` 显示“结果已失效”，不能继续渲染旧正文。
- 正式 PostgreSQL、真实模型、真实检索和页面级联调仍需分别留证，不能由本次 174 项本地测试替代。

## 5. AI 技术员协作记录

AI 技术员用于读取 Day 2 交接、定位 `TaskService` 与许可撤回链路、起草补丁和测试；人工决策选择了与既有换号失效一致的 `cancelled` 终态，并保留限流、多实例和真实供应商能力的边界。代码提交前通过定向与全量测试复核，不采用未运行的建议作为完成证据。
