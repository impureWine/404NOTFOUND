# Alpha 冲刺 Day 3 · 曾俊涛测试交付索引

日期：2026-10-25；角色：测试／运维。以组长七天执行计划 Day 3 为首要任务依据。此目录保留各固定 SHA 的历史执行记录，并在 08 号报告中给出最新判定。

先读[08_最新主线与成员交付独立验收_20261025.md](08_最新主线与成员交付独立验收_20261025.md)：GitHub main@55b173c 后端 96/96、前端 6/6 与双入口构建通过；真实浏览器注册/登录/资料/退出成功，陪伴页面仍为静态演示，0 次业务 API；真实 Wikipedia 8 秒超时。AI PR #40 的本人新增认证 HTTP 测试 3/3 通过，但 PR 未合并且模型、许可均为替身。不能把各层的通过数相加为“整体端到端通过”。

| 文件 | 用途 |
|---|---|
| [01_Day3场景测试矩阵.md](01_Day3场景测试矩阵.md) | 陪伴、训练、查询及首个端到端的当前判定 |
| [03_登录到陪伴端到端用例与取证方案.md](03_登录到陪伴端到端用例与取证方案.md) | 已执行的真实账号段、未完成的业务段与截图规则 |
| [04_接口与版本交接需求.md](04_接口与版本交接需求.md) | 仅剩的接线、真实调用和来源映射条件 |
| [05_Day3个人进展记录_20261025.md](05_Day3个人进展记录_20261025.md) | 本人当日工作及晚间更新 |
| [08_最新主线与成员交付独立验收_20261025.md](08_最新主线与成员交付独立验收_20261025.md) | 最新结论、版本、日志与截图证据 |
| [02_首轮独立执行与阻塞报告.md](02_首轮独立执行与阻塞报告.md)、[06_当日自动化复跑与端到端状态_20261025.md](06_当日自动化复跑与端到端状态_20261025.md)、[07_新主线增量复核与截图交接_20261025.md](07_新主线增量复核与截图交接_20261025.md) | 较早 SHA 的历史执行记录；旧 404/400 与 5 条 D2 红灯已在当前主线复测转绿 |
| [tests/day3-search-session-http.test.mjs](tests/day3-search-session-http.test.mjs)、[tests/day3-companion-adapter.test.mjs](tests/day3-companion-adapter.test.mjs)、[tests/day3-real-search-smoke.mjs](tests/day3-real-search-smoke.mjs) | 本人原有 Day 3 查询、陪伴合成及真实外网冒烟脚本 |
| [tests/day3-main-browser-auth-to-companion.mjs](tests/day3-main-browser-auth-to-companion.mjs) | 主线原样 Vite 代理＋Edge 账号到演示陪伴入口脚本 |
| [tests/day3-pr40-authenticated-business-http.mjs](tests/day3-pr40-authenticated-business-http.mjs) | AI PR #40 的真实账号、合成模型/许可替身 HTTP 独立用例 |

原始证据：主线[全量后端 96/96](day3-main-backend-full-20261025-55b173c.log)、[安全聚焦 6/6](day3-main-security-focused-20261025-55b173c.log)、[本人 11/11](day3-repo-layout-20261025-6e69910-local.tap)、[浏览器 JSON](browser-day3-main-6e69910.json)、[真实检索 JSON](day3-real-search-20261025-6e69910-local.json)；PR #40 [本人 3/3](day3-pr40-authenticated-business-http-20261025-4c34852.tap)、[作者套件复跑 27/27](day3-pr40-ai-tests-20261025-4c34852.log)。两张真实浏览器截图分别为[登录成功](browser-05-main-login-success-6e69910.png)与[陪伴演示入口](browser-06-main-companion-entry-6e69910.png)。

组长博客可用的更新截图包另存本地；所有结果按固定 SHA 和“真实浏览器／HTTP 替身／真实外网”层次标注。真实模型、真实检索成功及完整页面业务联调仍无证据。

## 增量脚本复跑

- 主线浏览器脚本需 Node 24、已安装的前后端依赖、Playwright Core 与 Microsoft Edge。设置 `PLAYWRIGHT_MODULE_PATH` 指向本机 `playwright-core/index.mjs`；若源码在另一目录，用 `DAY3_REPO_ROOT` 指向固定 SHA 的仓库根目录；可用 `EDGE_EXECUTABLE_PATH` 指定 Edge。此脚本会在 `DAY3_OUTPUT_DIR`（默认本目录）写入 JSON 与两张截图，并使用本机 3000/5173 端口及隔离 PGlite。账号为随机合成值。记录的是账号到演示陪伴入口，不会调用真实模型。
- [PR #40 专项脚本](tests/day3-pr40-authenticated-business-http.mjs)需在 `4c34852` 的完整仓库 checkout 上运行，或以 `DAY3_PR_REPO_ROOT` 指向该 checkout；主线未合并训练服务时不能直接在主线上运行。脚本使用真实 AuthService/PGlite，但注入合成模型和许可替身，不产生外部模型请求。`node --test` 输出与本目录 TAP 可对照。

