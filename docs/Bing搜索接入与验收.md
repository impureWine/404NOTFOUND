# Bing 搜索接入与验收

## 使用方式

当前信息查询由后端调用 SerpAPI 的 Bing 搜索引擎，前端展示自然搜索结果的标题、原网页链接、摘录及获取时间。需要用户明确许可后发送问题；不调用 AI 模型来虚构搜索来源。主动保存仍使用原有、绑定本人及本次任务的查询保存链路。

微软旧 Bing Search API 于 2025-08-11 退役。本实现使用第三方 SerpAPI 服务，不使用旧微软 v7 接口、Bing RSS 或网页抓取。

官方参考：
- https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement
- https://serpapi.com/bing-search-api

## 配置

1. 在 https://serpapi.com/ 注册或登录，查看账号中的 API Key，并确认账户有可用查询额度。费用、额度和数据处理规则以该服务账户说明为准；本项目不代为注册或购买。
2. 编辑实际运行目录的 `backend/.env`，保留其他配置并加入：

```dotenv
SEARCH_PROVIDER=bing
SERPAPI_API_KEY=在本机填写自己的SerpAPI密钥
BING_SEARCH_MARKET=zh-CN
SEARCH_TIMEOUT_MS=15000
```

`SERPAPI_API_KEY` 是 SerpAPI 的检索密钥，与 `ZHIPU_API_KEY` 不同。密钥仅放后端，不加 `VITE_` 前缀、不提交 Git、不贴到聊天中。后端固定请求 `https://serpapi.com/search.json`，参数 `engine=bing`、`q`、`mkt`、`api_key`、`output=json`。不提供任意上游地址配置。密钥不会返回给前端，也不记录请求 URL 或上游响应正文。

`SEARCH_TIMEOUT_MS` 可设为 100～30000 毫秒，覆盖请求与响应读取；默认 15000。旧 `SEARCH_LANGUAGE` 不再使用，区域由 `BING_SEARCH_MARKET` 设置。`SEARCH_PROVIDER=wikipedia` 会被明确拒绝，避免界面显示 Bing、实际仍请求 Wikipedia。

3. 停止并重启后端；开发模式刷新前端。如使用构建后的页面，重新运行前端构建并重启提供页面的服务。
4. 在 backend 运行：

```powershell
npm run smoke:search
```

此命令用固定的非隐私测试词 `computer` 发起一次真实查询，可能消耗 SerpAPI 额度。输出仅包含状态、来源标题/链接、耗时或稳定错误码，不打印密钥。未配置密钥时直接失败，不发起查询。然后在信息查询页勾选将问题提交 SerpAPI 的许可并查询，按需主动保存结果。

## 错误提示

| 情况 | 处理 |
| --- | --- |
| `SEARCH_NOT_CONFIGURED` | 在运行目录配置后端密钥并重启 |
| `SEARCH_AUTH_FAILED` | 检查 SerpAPI 密钥、账户和权限 |
| `SEARCH_RATE_LIMITED` | 检查额度或稍后重试，不自动重试扣费请求 |
| `TIMEOUT` | 确认后端 Node.js 能访问 serpapi.com；按需调整搜索等待时间 |
| `SERVICE_UNAVAILABLE` | 上游不可用、返回异常或网络失败；不会伪装成空结果或 AI 超时 |

搜索结果摘录只作为检索线索。原网页并未由本应用逐个获取和独立核验，因此 `quality=UNKNOWN`、`sourceTier=SX`、`verificationState=PARTIAL`，不从相对时间猜测发布日期，不标为事实已核实。保存后的摘录沿用不确定性状态。

## 自动化与实网验收边界

新增适配器测试覆盖固定 Bing 引擎及密钥传递、缺密钥零请求、自然结果映射、去重与数量限制、非 HTTP(S)/带凭据链接拒绝、空结果、权限/额度错误、异常 JSON、响应大小限制、连接及读取超时、主动取消、错误信息去敏。集成测试使用隔离数据库和合成 SerpAPI 响应，验证用户许可→Bing 结果→查询保存回读及账号隔离，摘录维持 UNKNOWN。

账户密钥未提供时，不能声称真实 SerpAPI 查询已通过。`smoke:search` 成功并在页面实际查询、主动保存回读后，才能确认该部署的检索可用。
