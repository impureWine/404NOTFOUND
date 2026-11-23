# Beta 冲刺 Day 7｜AI 任务生命周期 P0 收口与最终交接

负责人：程群。日期：2026-11-20。开发基线：`origin/main@cc22778`。代码复测候选：`09a5cc9`。本记录描述本分支实现和本机验证，不代表生产部署、真实供应商调用或非作者验收已经完成。

## 1. Day7 完成项

针对曾俊涛 Day7 最终测试仍列为 P0 的两项问题，本分支把前序修复移植到最新主线并完成冲突核对：

- `END` 与 `RESTART` 会使所属会话的在途及已完成 AI／查询任务失效；
- 许可撤回会同步取消绑定该 `consentId` 的任务，触发 `AbortController`，并清除 AI 正文、查询回答、来源、主张与失败细节；
- 供应商忽略取消并迟到返回时，任务终态检查拒绝回填；
- 公开任务 DTO 不暴露内部 `consentId`；
- 撤回只影响绑定该许可的任务，账号和入口隔离规则保持不变；
- 四类训练在页面隐藏、手动恢复、离页和陈旧回调场景下继续释放计时器并拒绝旧事件。

本分支没有修改真实模型供应商配置、正式数据库、部署入口或多实例任务存储。

## 2. 关键反例结果

2026-11-20 在 Windows、Node.js `v22.23.1`、隔离 PGlite 和合成模型适配器下执行：

```text
[B2-T-03] END 后 status=cancelled，hasResultAfterEnd=false
[B2-RESTART] RESTART 后 status=cancelled，hasResultAfterRestart=false
[B2-REVOKE] 撤回后复用许可=403，旧任务 status=cancelled，hasResultAfterRevoke=false
[B3-INFLIGHT] 撤回在途任务后立即及迟到响应后均为 cancelled，hasResultAfterRevoke=false
```

定向命令：

```powershell
cd backend
node --test --test-concurrency=1 test/unit/companion-task.test.js test/security/beta-day2-authz-matrix.test.js test/security/beta-day3-record-isolation.test.js test/integration/beta-day4-ai-training.test.js
```

结果：`32/32` 通过，0 失败、0 取消、0 跳过。

## 3. 全量回归与构建

```powershell
cd backend
node --test --test-concurrency=1
cd ../prototype
npm test
npm run build
```

- 后端串行全量：`192/192` 通过；
- 前端全量：`50/50` 通过；
- Vite 构建：通过，1599 个模块完成转换。

后端默认并行 `pnpm test` 曾出现 4 个 Windows 子进程异常退出（`0xC0000409`／`spawn UNKNOWN`），没有业务断言失败；按前序交付一致的串行命令复跑后全部通过。因此本记录只把串行结果列为验收数据。

## 4. 真实模型复查

执行：

```powershell
cd backend
corepack pnpm run smoke:model
```

结果：退出码 1，`MODEL_UNAVAILABLE`，`provider=zhipu`，`model=glm-4.5-flash`，`mock=false`，`usage=null`，`attempts=1`。本机没有配置获批的 `ZHIPU_API_KEY`，没有产生供应商成功响应或费用数据。

真实模型成功、超时、供应商拒绝与取消仍需在获批密钥、额度和固定候选环境中复测，只记录脱敏元数据。合成适配器通过不能替代该项。

## 5. 交接与剩余边界

- 请关欣或曾俊涛在本分支合入后的同一主线 SHA 独立复跑 `B2-T-03`、`B2-RESTART`、`B2-REVOKE`、`B3-INFLIGHT`；合入前不能把 P0 标为主线已关闭。
- 多实例共享任务状态、进程重启恢复、供应商侧计费是否随取消停止仍未验证。
- 正式 PostgreSQL、HTTPS、备份恢复、真实检索和原生桌宠不属于本次完成项；整体发布门禁仍以测试与运维负责人的结论为准。
- AI 技术员用于核对 Day7 缺陷责任、移植前序候选、补齐回归和整理交接；所有结论以本日实际命令输出为准，没有补造真实供应商成功、生产发布、非作者签认、站会时间或个人工时。
