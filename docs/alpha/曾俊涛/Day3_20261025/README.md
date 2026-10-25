# Alpha 冲刺 Day 3 · 成员 8 自动化复跑与联调状态

执行日：2026-10-25；负责人：曾俊涛。依据组长七天执行计划 Day 3：陪伴、训练、查询的成功／异常自动化和首个登录到陪伴端到端用例。`02` 与旧日志保留 10 月 24 日提前预跑；**10 月 25 日实测以 `06` 号报告和当日 TAP 为准**。基线 `main@a25c912` 只增加本人 Day 2 文件，产品源码与前一次核对版本相同。本目录按 `docs/alpha/曾俊涛/Day3_20261025/` 的仓库路径组织；测试脚本的相对导入指向同仓库 `backend/`。

| 文件 | 内容 |
|---|---|
| [01_Day3场景测试矩阵.md](01_Day3场景测试矩阵.md) | 覆盖目标、当前可执行层、真实集成条件与判定状态 |
| [02_首轮独立执行与阻塞报告.md](02_首轮独立执行与阻塞报告.md) | 本人固定版本六项本地 HTTP/PGlite 测试、真实检索尝试和阻断点 |
| [03_登录到陪伴端到端用例与取证方案.md](03_登录到陪伴端到端用例与取证方案.md) | 可执行验收步骤、录像与网络证据要求；当前未冒写成功 |
| [04_接口与版本交接需求.md](04_接口与版本交接需求.md) | 为继续测试所需的具体版本、接口和安全修复交接 |
| [05_Day3个人进展记录_20261025.md](05_Day3个人进展记录_20261025.md) | 本人当日实际测试进展、困难与 AI 辅助情况；不代写团队会议或工时 |
| [06_当日自动化复跑与端到端状态_20261025.md](06_当日自动化复跑与端到端状态_20261025.md) | 今日 11/11 的真实层次、公开检索超时和端到端阻塞结论 |
| [tests/day3-search-session-http.test.mjs](tests/day3-search-session-http.test.mjs) | 六项查询及一项 `REHEARSE` 状态本地 HTTP/PGlite 测试；检索源为替身 |
| [tests/day3-companion-adapter.test.mjs](tests/day3-companion-adapter.test.mjs) | 四项命名卡与陪伴适配层合成用例，无真实模型调用 |
| [tests/day3-real-search-smoke.mjs](tests/day3-real-search-smoke.mjs) | 公共维基百科检索一次性冒烟，不使用私人内容 |
| [day3-tests-20261025-a25c912-local.tap](day3-tests-20261025-a25c912-local.tap)、[day3-real-search-20261025-a25c912-local.json](day3-real-search-20261025-a25c912-local.json) | 今日原始执行输出：11/11 与真实公开检索超时 |
| [day3-repo-layout-20261025-a25c912-local.tap](day3-repo-layout-20261025-a25c912-local.tap) | 将仓库式相对导入副本放入对应 `docs/` 路径后再次复跑，11/11 通过 |
| [day3-preflight-0ee6d-local.tap](day3-preflight-0ee6d-local.tap)、[day3-real-search-0ee6d-local.json](day3-real-search-0ee6d-local.json) | 10 月 24 日提前预跑原始输出 |
| [SHA256SUMS.txt](SHA256SUMS.txt) | 本目录其余文件的 SHA-256 校验清单 |

## 从仓库根目录复跑

先按 `backend/pnpm-lock.yaml` 安装后端依赖（Node.js 24、pnpm 11）；再从仓库根目录执行：

```text
cd backend
pnpm install --frozen-lockfile
cd ..
node --test --test-reporter=tap docs/alpha/曾俊涛/Day3_20261025/tests/day3-search-session-http.test.mjs docs/alpha/曾俊涛/Day3_20261025/tests/day3-companion-adapter.test.mjs
node docs/alpha/曾俊涛/Day3_20261025/tests/day3-real-search-smoke.mjs
```

第一行只启动本机环回 HTTP、PGlite 和合成模型／检索替身；第二行会向公开中文 Wikipedia 发出合成词查询，可能因网络超时返回非零退出码。**不要把脚本的离线 11/11 当作真实模型、真实查询或浏览器端到端通过。** 本地原执行脚本位于另一个工作目录；仓库副本仅调整相对导入路径，测试断言未改。仓库式路径已在含固定产品源码的本地目录中实际复跑，原始结果见上表。

**当前结论：** 今日复跑 **11/11 通过**，其中陪伴适配层四项为合成模型替身，查询及会话七项使用本地 HTTP/PGlite 与替身检索源；均不证明真实模型、真实搜索或页面联调。默认 `zh` Wikipedia 今日直连再次 **8 秒超时**。主线原样认证的 `/api` 404 和目标键 400 尚未修复，陪伴页面与正式业务 API 未接通；登录到陪伴的真实浏览器端到端及核心流程录像**仍无完成证据**。

本目录的结论固定于上述版本和执行日期。后续修复须另记复测 SHA 与原始证据，不回填历史通过数。
