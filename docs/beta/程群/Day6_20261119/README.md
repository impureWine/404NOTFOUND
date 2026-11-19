# Beta 冲刺 Day 6｜AI 任务失效、训练资源与模型环境交接

负责人：程群。日期：2026-11-19。开发基线：`origin/main@97ecb8b`。代码复测候选：`25c24f8`。本记录描述本分支的本机实现与验证，不代表生产部署、真实供应商或非作者验收已经完成。

## 1. Day6 任务与完成结果

### P0：结束、重来与许可撤回后的任务失效

- `END` 和 `RESTART` 会取消所属会话的在途及已完成 AI／查询任务，并清除未消费结果。
- AI 与查询任务在服务端内部保存创建时使用的 `consentId`；公开任务 DTO 不暴露该字段。
- `POST /api/consents/:id/revoke` 成功后，同步取消由该许可创建的任务并触发 `AbortController`。
- 统一清除 AI 正文、查询回答、来源、主张和失败细节；供应商忽略取消并迟到返回时，状态检查仍拒绝回填。
- 撤回许可只影响绑定该许可的任务；既有账号和入口隔离规则保持不变。

本次定向复测观察值：

```text
[B2-T-03] END 后 status=cancelled，hasResultAfterEnd=false
[B2-RESTART] RESTART 后 status=cancelled，hasResultAfterRestart=false
[B2-REVOKE] 撤回后复用许可=403，旧任务 status=cancelled，hasResultAfterRevoke=false
[B3-INFLIGHT] 撤回在途任务后立即及迟到响应后均为 cancelled，hasResultAfterRevoke=false
```

### P1：四类训练的窗口生命周期

`BREATHING`、`FIVE_SENSES`、`PAUSE_ORGANIZE`、`TASK_SPLIT` 使用同一组窗口生命周期约束：

- 页面隐藏时暂停并释放计时器，再次可见时不自动继续；
- 用户手动继续后只建立一个新计时器；
- `pagehide` 后进入 `exited` 并释放计时器；
- 隐藏、重置或退出前遗留的回调不能继续发布事件；
- 解绑时移除 `visibilitychange` 与 `pagehide` 监听器。

## 2. 2026-11-19 验证结果

运行环境：Windows、Node.js `v22.23.1`；后端使用锁文件依赖和隔离 PGlite，前端为本地 Node 测试及 Vite 构建。

后端生命周期定向回归：

```powershell
cd backend
node --test --test-concurrency=1 test/unit/companion-task.test.js test/security/beta-day2-authz-matrix.test.js test/security/beta-day3-record-isolation.test.js test/integration/beta-day4-ai-training.test.js
```

结果：`32/32` 通过，0 失败、0 取消、0 跳过。

后端全量：

```powershell
cd backend
node --test --test-concurrency=1
```

结果：`192/192` 通过，0 失败、0 取消、0 跳过。

前端全量与构建：

```powershell
cd prototype
npm test
npm run build
```

结果：测试 `50/50` 通过；Vite 生产构建通过，1599 个模块完成转换。

## 3. 真实模型检查与发布边界

执行：

```powershell
cd backend
corepack pnpm run smoke:model
```

本机未配置 `ZHIPU_API_KEY`，命令以退出码 1 返回：`MODEL_UNAVAILABLE`、`provider=zhipu`、`model=glm-4.5-flash`、`mock=false`、`usage=null`、`attempts=1`。没有形成供应商成功响应，不能据此宣称真实模型链路通过。

因此本次关闭的是单进程本地任务生命周期缺口，并完成合成迟到回复和训练资源回归。仍待获得批准的密钥、额度和候选环境后执行真实模型检查；多实例共享任务状态、进程重启恢复、供应商侧计费是否停止及原生窗口非作者复核不在本次完成范围。

## 4. 变更位置

- `backend/src/services/task-service.js`：许可关联、会话生命周期失效、统一任务取消和结果清理。
- `backend/src/app.js`：许可撤回后触发绑定任务失效。
- `backend/test/unit/companion-task.test.js`：已完成与在途任务失效、迟到回复拒收回归。
- `backend/test/security/beta-day2-authz-matrix.test.js`、`beta-day3-record-isolation.test.js`：将观察型探针收紧为确定性断言。
- `backend/test/integration/beta-day4-ai-training.test.js`：陪伴异常反馈与四类训练后端流程。
- `prototype/test/training-controller.test.js`：四类训练隐藏、手动恢复、离页和陈旧回调矩阵。

AI 技术员用于核对 Day6 分工、移植前序候选、补齐测试与整理交接记录；结论以本次实际命令输出为准。没有补造真实模型成功、生产部署、非作者签认、站会时间或个人工时。
