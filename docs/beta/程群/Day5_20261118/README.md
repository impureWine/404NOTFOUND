# Beta 冲刺 Day 5｜在途许可失效与训练资源收敛

负责人：程群。日期：2026-11-18。开发基线：`origin/main@97c3168`。本记录只描述本分支代码与本机验证，不代表生产部署、真实供应商或非作者验收已经完成。

## 1. 当日任务与结果

### P0：许可撤回后的在途 AI 任务

- AI 与查询任务在服务端内部绑定创建时使用的 `consentId`，但公开任务 DTO 不返回该字段。
- `POST /api/consents/:id/revoke` 成功后同步失效该许可创建的任务；在途任务转为 `cancelled` 并触发 `AbortController`。
- 统一清除 AI 正文、查询回答、来源、主张与失败细节；已经完成但尚未消费的结果也不能继续读取。
- 即使供应商忽略取消并迟到返回，任务状态检查仍拒绝把正文回填到已取消任务。
- 原 `B3-INFLIGHT` 观察型探针已收紧为确定性断言：撤回后立即为 `cancelled`，等待迟到回复后仍为 `cancelled` 且无 `result`。

本次复测观察值：

```text
[B3-INFLIGHT] {"taskAccepted":202,"revokeStatus":200,"statusInFlight":"cancelled","taskReadAfterRevoke":200,"statusAfterRevoke":"cancelled","hasResultAfterRevoke":false}
```

### P1：四类训练的窗口生命周期

对 `BREATHING`、`FIVE_SENSES`、`PAUSE_ORGANIZE`、`TASK_SPLIT` 补齐同一矩阵：

- 窗口隐藏时暂停并释放计时器；再次可见时不自动继续；
- 用户手动继续后重新建立唯一计时器；
- `pagehide` 后进入 `exited` 并释放计时器；
- 隐藏前、退出前遗留的旧回调均不能再发布事件；
- 解绑后移除 `visibilitychange`、`pagehide` 监听器。

## 2. 验证结果

后端定向：

```powershell
cd backend
node --test test/unit/companion-task.test.js test/security/beta-day2-authz-matrix.test.js test/security/beta-day3-record-isolation.test.js test/integration/beta-day4-ai-training.test.js
```

结果：`32/32` 通过，`0` 失败。

后端全量单并发：

```powershell
node --test --test-concurrency=1
```

结果：`187/187` 通过，`0` 失败、`0` 取消、`0` 跳过。

前端全量与构建：

```powershell
cd prototype
npm test
npm run build
```

结果：测试 `50/50` 通过；Vite 生产构建通过。

## 3. 真实模型检查与证据边界

执行 `backend` 下的 `pnpm run smoke:model`，本机未配置 `ZHIPU_API_KEY`。脚本以退出码 `1` 返回 `MODEL_UNAVAILABLE`，记录 `provider=zhipu`、`model=glm-4.5-flash`、`mock=false`、`latency_ms=1`，没有形成供应商请求或真实回复。

因此，本次完成的是本地任务生命周期、合成迟到回复和训练资源回归；不把合成成功描述为真实模型成功。获得批准的密钥、额度与候选环境后，仍需执行真实模型检查并由非作者复核。多实例共享任务状态、进程重启恢复与供应商侧计费停止不在本次完成范围。

## 4. 变更位置

- `backend/src/services/task-service.js`：许可关联、统一任务取消与结果清理。
- `backend/src/app.js`：许可撤回后触发任务失效。
- `backend/test/unit/companion-task.test.js`：在途撤回及迟到回复单元回归。
- `backend/test/security/beta-day3-record-isolation.test.js`：收紧 `B3-INFLIGHT` 验收断言。
- `prototype/test/training-controller.test.js`：四类训练窗口隐藏、恢复、离页和陈旧回调矩阵。

AI 技术员用于读取 Day 5 专项报告、整合前序修复、补齐回归与整理记录；完成结论以实际命令输出为准。未执行的真实供应商调用、独立复核和个人实际工时不由 AI 补造。
