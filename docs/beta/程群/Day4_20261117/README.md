# Beta 冲刺 Day 4｜陪伴、命名与四类训练验收

负责人：程群。日期：2026-11-17。关联 Issue [#106 B03](https://github.com/impureWine/404NOTFOUND/issues/106) 与 [#108 B05](https://github.com/impureWine/404NOTFOUND/issues/108)。基线：`origin/main@5422597`。本记录只描述本分支代码和本机验证，不代表生产部署或真实供应商验收完成。

## 1. 本次交付

### B03 陪伴与命名

- 验证命名卡在 `LISTEN`、`ORGANIZE`、`SEARCH` 和尚未选择需求时的确定性路由；命名卡本身不调用模型。
- 验证 AI 任务从 `pending`、`running` 到 `completed` 的等待与成功状态。
- 分别验证模型空输出、超时和供应商不可用映射为 `OUTPUT_INVALID`、`TIMEOUT` 和 `PROVIDER_UNAVAILABLE`，失败任务不携带结果正文。
- 验证重试必须创建新 `requestId`；新任务成功后，旧失败任务仍保留原终态，不被覆盖。
- 页面错误文案分别提示模型不可用或输出无效，并提供“重试／重新尝试”动作提示。
- 合入程群 Day 3 生命周期修复：`END`、`RESTART`、账号上下文失效和 `AI_PROCESS` 许可撤回会清除已完成但未消费的旧结果；在途迟到回复不能回填。

### B05 固定训练

- 对 `BREATHING`、`FIVE_SENSES`、`PAUSE_ORGANIZE`、`TASK_SPLIT` 四类训练逐项验证开始、暂停、继续和退出。
- 暂停期间用时冻结，继续后只累计活动时间；退出后公开步骤为空。
- 前端控制器在暂停和退出时释放计时器；旧计时回调不能向下一状态发布事件。
- 保留既有离页规则：页面隐藏时暂停但不自动继续，`pagehide` 和组件卸载时停止并清理监听器。

## 2. 自动化结果

后端定向：

```powershell
cd backend
node --test test/integration/beta-day4-ai-training.test.js test/unit/naming-card-router.test.js test/unit/model-adapter.test.js test/integration/ai-synthetic-regression.test.js test/unit/training-service.test.js test/integration/companion-training-http.test.js test/unit/companion-task.test.js test/unit/task-service.test.js test/security/beta-day2-authz-matrix.test.js
```

结果：`52/52` 通过，`0` 失败。

前端定向：

```powershell
cd prototype
node --test test/training-controller.test.js test/games-lifecycle.test.js test/business-task-errors.test.js
```

结果：`25/25` 通过，`0` 失败。

全量回归：

```powershell
cd backend
node --test --test-concurrency=1

cd ../prototype
npm test
```

结果：后端 `180/180`、前端 `49/49` 通过，均为 `0` 失败、`0` 跳过。Windows 上后端默认并发首次运行时 `day2-authz.test.js` 进程以 `3221225477` 退出，但该文件单独复跑 `22/22` 通过，单并发全量 `180/180` 通过；因此记录为并行资源／进程问题，不包装成业务断言失败。

## 3. 真实模型冒烟与边界

执行：

```powershell
cd backend
pnpm run smoke:model
```

本机未配置 `ZHIPU_API_KEY`，脚本退出码为 `1`，返回 `MODEL_UNAVAILABLE`、`mock=false`、`latency_ms=0`，未形成供应商请求或真实回复。因此：

- 本次完成的是本地契约、合成异常、任务生命周期和训练资源验收；
- 不把合成成功写成真实模型成功；
- Issue #106 中“真实调用”仍需在获得批准的密钥、额度和固定候选后由程群／李泉毅执行，并由曾俊涛独立复核；
- 任务仍为单进程内存状态，限流、多实例共享和进程重启恢复不在本次完成范围。

## 4. 变更位置

- `backend/test/integration/beta-day4-ai-training.test.js`：B03/B05 后端验收矩阵。
- `prototype/test/business-task-errors.test.js`：模型不可用与输出无效的可操作重试文案。
- `prototype/test/training-controller.test.js`：四类训练计时器与陈旧回调清理矩阵。
- `backend/src/services/task-service.js`、`backend/src/app.js` 及相关测试：Day 3 生命周期修复整合。

AI 技术员用于读取既有任务板、定位验收缺口、起草测试与交付记录；结论以实际命令输出为准。未配置的真实供应商环境、未执行的独立复核和个人实际工时均不由 AI 补造。
