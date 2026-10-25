# Day 3｜10月25日：真实检索和来源绑定

> 提交状态：代码、自动化复跑和真实调用失败证据已完成；真实Wikipedia成功响应及跨成员评审仍阻塞。
>
> 计划验收：2.0 SP
>
> 状态边界：本日完成的是开发实现和隔离验证，不表示真实检索、摘要链或前端已形成生产闭环。

## 当天必须执行

- [x] 复跑Wikipedia真实检索，记录开始时间、超时配置、结果和网络错误类型。
- [x] 若仍失败，保留失败证据并确认适配器没有返回伪造空结果或来源。
- [x] 运行成功响应、空结果、超时和异常响应自动化测试。
- [x] 运行查询保存和来源证据绑定测试。
- [x] 核对来源标题、URL、发布时间、获取时间、质量和验证状态字段。
- [x] 核对证据只能引用本次提交的来源，不能由客户端自造来源关系。
- [ ] 与程群确认摘要链只使用受控来源，与程杰/郭昱祺确认展示字段。

## 预置交付

| 交付 | 路径 | 当日需补证 |
|---|---|---|
| Wikipedia适配器 | `backend/src/search/wikipedia-search-provider.js` | 已记录三次真实调用失败 |
| 查询契约 | `backend/src/contracts/search.js` | 已完成本人自查，非作者评审待安排 |
| 来源证据仓储 | `backend/src/repositories/saved-query-repository.js` | 绑定、隔离和非法URL测试通过 |
| 自动化测试 | `backend/test/unit/wikipedia-search-provider.test.js`、`saved-query-repository.test.js` | 聚焦12项通过；全量无新增失败 |
| 准备性样例 | `backend/evidence/samples/Day3_日历寄存准备性合成样例.json` | 仅核对数据模型，不代表功能完成 |

## 当日真实调用记录

```text
问题：人工智能
供应商：https://zh.wikipedia.org/w/api.php
第一次开始：2026-10-25 11:32:16（UTC+8）
第一次配置：8000 ms；耗时：8006 ms；结果：TIMEOUT；返回来源数：0
第二次开始：2026-10-25 11:32:44（UTC+8）
第二次配置：30000 ms；耗时：10549 ms；结果：SERVICE_UNAVAILABLE；返回来源数：0
第三次开始：2026-10-25 11:39:18（UTC+8）
第三次配置：8000 ms；耗时：8003 ms；结果：TIMEOUT；返回来源数：0
来源抽查：无。三次调用均未取得来源，因此不能登记链接可访问或标题对应。
结论：当前网络环境下真实Wikipedia成功路径仍阻塞；适配器未把失败伪装为EMPTY，未生成来源。
```

安全保留的原始输出：

```json
{"startedAt":"2026-10-25T03:32:16.802Z","durationMs":8006,"timeoutMs":8000,"errorCode":"TIMEOUT","message":"Search provider timed out"}
{"startedAt":"2026-10-25T03:32:44.863Z","durationMs":10549,"timeoutMs":30000,"errorCode":"SERVICE_UNAVAILABLE","message":"Search provider is unavailable"}
{"startedAt":"2026-10-25T03:39:18.188Z","durationMs":8003,"timeoutMs":8000,"errorCode":"TIMEOUT","message":"Search provider timed out"}
```

## 当日实际修改

- Wikipedia请求改为固定端点的 `generator=search`，组合 `info|extracts` 获取标题、规范链接和纯文本摘要信号；不接受任意上游URL。
- 来源只接受预期Wikipedia主机下的HTTPS `/wiki/` 链接；无效链接或缺失必需字段会被跳过并标记部分结果，非空响应若全部无效则返回服务不可用。
- Wikipedia检索时间不再冒充文章发布时间：`publishedAt` 固定为空，`retrievedAt` 记录实际获取时间，质量标为 `UNKNOWN`。
- 来源补充稳定UUID形标识、`publisher=Wikipedia`、`sourceTier=S3` 和 `verificationState`；适配器继续返回空 `claims`，不虚构事实主张。
- 明确区分可靠空集合、适配器超时、普通网络/上游错误和调用方主动取消；保留最新main的超时计时器清理，并限制响应类型及大小。
- 保存契约仅接受无嵌入凭据的HTTP(S)来源；同一主张重复引用相同规范来源时拒绝写入。
- 查询详情按主张返回密文、密钥版本、状态和来源关系，同时保留已有扁平 `evidence` 字段，降低现有调用方兼容风险。

## 当日测试证据

```text
聚焦测试：tests 12；pass 12；fail 0
最新main基线（9b01480）：tests 82；pass 77；fail 5
加入Day 3改动后：tests 87；pass 82；fail 5
新增失败：0；原有失败：D2-03、D2-17、D2-18、D2-20、D2-22
运行环境：Node.js v24.22.1，PGlite PostgreSQL WASM隔离数据库，测试数据为合成数据
```

覆盖的第三天分支包括：成功字段映射、稳定来源标识、可靠空结果、缺失摘要、非法链接、全无效来源、MediaWiki错误、无效JSON、超时、网络故障、调用方取消、来源保存、账号/入口隔离、非法持久URL和重复证据引用。

最新main全量回归中的5个失败在未修改基线可同样复现，位于其他成员的Day 2安全用例。本次不修改其认证、错误响应、模型路由或入口绑定代码，也不把全量结果写成全部通过。

## 未完成和依赖

- 真实Wikipedia请求尚未取得SUCCESS，不能验收真实来源可打开及标题对应。
- 模型摘要和逐事实主张生成不属于本次实现；需要程群确认摘要链只消费受控来源。
- 前端字段展示未在本次修改；需要程杰/郭昱祺确认 `publishedAt=null`、质量和验证状态的展示。
- `shared/contracts/search-task.js` 使用 `sourceId`，设计及数据契约使用 `id`；本次不修改其他成员的共享契约和服务代码，留作跨模块联调项。
- 关欣的外部文本安全复核、非作者代码评审、正式PostgreSQL环境验证，以及上述5个Day 2安全问题尚未完成。

## 完成定义

- 成功时至少一条来源链接可以打开并与标题对应。
- `EMPTY` 只表示供应商返回可靠空集合，不能拿网络失败冒充空结果。
- 超时明确返回 `TIMEOUT`；其他网络或上游错误返回 `SERVICE_UNAVAILABLE`。
- 保存查询时保留来源和逐主张证据关系。
- 未成功取得真实来源时，当天报告必须保留阻塞状态。

## 站会汇报模板

```text
今天完成了Wikipedia适配器字段规范化、异常状态和查询来源绑定，聚焦12项全部通过；最新main全量回归没有新增失败。
真实Wikipedia三次调用得到两次TIMEOUT和一次SERVICE_UNAVAILABLE，未取得来源，不能登记真实检索成功。
当前阻塞是外部网络、摘要链和前端字段联调；自动化替身只证明分支行为，不替代真实接入结论。
下一步联调保存、清除、账号隔离和寄存状态。
```

## 心得与AI辅助

```text
心得：外部检索失败必须与可靠空结果分开；来源字段也不能把搜索时间误写成发布时间。真实网络没有返回来源时，正确结果是保留阻塞和错误证据，而不是为了完成记录伪造链接。
AI用途：用于对照团队规范、检查异常分支并形成测试和记录初稿；人工修改：核对固定端点、来源主机、取消语义、持久证据关系、最新main计时器清理和真实调用输出；是否采用：聚焦测试通过且全量无新增失败后采用；局限：AI和模拟响应不能证明真实Wikipedia可访问，也不能代替程群、程杰、郭昱祺、关欣及非作者评审。
```
