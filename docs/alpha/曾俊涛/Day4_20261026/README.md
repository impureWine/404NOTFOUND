# Alpha 冲刺 Day 4 · 曾俊涛本地测试交付

日期：2026-10-26；职责：测试／运维。依据组长七天计划 Day 4，优先验证“游客→登录→主动保存→查看→退出→换账号”、许可撤回、记录清除、入口隔离和文本销毁。原始报告固定 `main@2c756cf`；最新完整个人测试固定 [`main@c3ffddef`](https://github.com/impureWine/404NOTFOUND/commit/c3ffddef27633d8041f31f6165be3eba6bac1928)，后来新增的安全测试已在相同产品副本复跑。GitHub 已到 [`feb7d802`](https://github.com/impureWine/404NOTFOUND/commit/feb7d802e8aa45635a27901e577b1e6e026b2728)；新证据影响见[交叉复核](06_安全新增证据交叉复核_20261026.md)。

| 文件 | 用途 |
|---|---|
| [01_中期集成测试报告_20261026.md](01_中期集成测试报告_20261026.md) | 固定版本、分层执行结果、Day 4 验收结论 |
| [02_缺陷分级与复测条件.md](02_缺陷分级与复测条件.md) | 页面联调阻断与环境依赖；不代开发成员宣称修复 |
| [03_销毁流程网络与存储观察.md](03_销毁流程网络与存储观察.md) | 合成文本在隔离组件中的网络、DOM 和浏览器存储检查 |
| [04_个人进展与组长交接.md](04_个人进展与组长交接.md) | 可交组长的测试事实与未取得的会议/工时证据 |
| [05_最新主线增量复核_20261026.md](05_最新主线增量复核_20261026.md) | 当前主线的 4/4、35/35、组长探针 11/13、浏览器/销毁及新成员交付边界；**优先阅读** |
| [06_安全新增证据交叉复核_20261026.md](06_安全新增证据交叉复核_20261026.md) | 关欣 Day 4 新增安全材料、本人独立复跑 4/4 与正式销毁入口阻断；**最新结论** |
| [tests/day4-record-privacy-http.test.mjs](tests/day4-record-privacy-http.test.mjs) | 本人 4 条真实 AuthService/RecordService/PGlite/HTTP 自动化用例 |
| [tests/day4-browser-api-assisted-record.mjs](tests/day4-browser-api-assisted-record.mjs) | Edge 真 UI 登录；测试脚本直接调用同源记录 API，明确不是保存页面联调 |
| [tests/day4-destruction-browser.mjs](tests/day4-destruction-browser.mjs) | 挂载现有 `DestroyPage` 的本地 QA 页面；不修改产品组件 |
| [tests/qa-harness/day4-privacy-qa.html](tests/qa-harness/day4-privacy-qa.html)、[JSX](tests/qa-harness/day4-privacy-qa.jsx) | 独立 QA 挂载页；复跑前临时复制到 `prototype/`、`prototype/src/`，不作为正式产品入口 |

原始结果：[本人 HTTP 4/4](day4-record-privacy-http-20261026-main2c756cf.tap)、[仓库专项 32/32](day4-backend-focused-20261026-main2c756cf.log)、[浏览器账号/API 辅助 JSON](day4-browser-api-assisted-20261026-main2c756cf.json)、[销毁观察 JSON](day4-destroy-browser-20261026-main2c756cf.json)。截图：[账号 A](day4-browser-account-a-api-assisted.png)、[账号 B](day4-browser-account-b-api-assisted.png)、[销毁前合成文本](day4-destroy-before-synthetic.png)、[销毁后](day4-destroy-after-synthetic.png)。

最新结果：[本人 HTTP 4/4](day4-record-privacy-http-20261026-mainc3ffddef.tap)、[仓库专项 35/35](day4-backend-focused-20261026-mainc3ffddef.log)、[组长 13 项探针 11 过 2 未达标](day4-pm-acceptance-rerun-20261026-mainc3ffddef.json)、[浏览器账号/API 辅助 JSON](latest-c3ffddef/day4-browser-api-assisted-20261026-mainc3ffddef.json)、[销毁观察 JSON](latest-c3ffddef/day4-destroy-browser-20261026-mainc3ffddef.json)、[前端 6/6](day4-frontend-test-20261026-mainc3ffddef.log)与[构建](day4-frontend-build-20261026-mainc3ffddef.log)。新版截图集中在 `latest-c3ffddef/`。

三份本人脚本放进仓库 `docs/alpha/曾俊涛/Day4_20261026/tests/` 后默认向上定位仓库根目录；在本地交付目录复跑时设置 `DAY4_REPO_ROOT`。浏览器脚本另需 `PLAYWRIGHT_MODULE_PATH` 指向已安装 `playwright-core/index.mjs`，可用 `DAY4_OUTPUT_DIR` 指向新输出目录、`DAY4_SOURCE_SHA` 标记版本。销毁脚本只在把上述两个 QA 挂载文件临时放到 `prototype/` 和 `prototype/src/` 后运行；不应把该页面当成正式用户入口。

**结论：** Day 4 部分通过。`c3ffddef` 的后端记录与隔离专项通过；新合入的安全用例由本人在相同产品副本复跑 4/4。详情仍返回不可读密文字段；登录后缺少有效外发许可的内部模型请求触发计数替身。浏览器登录/退出和 QA 脚本直接调用记录 API 通过，正式产品页面仍未接保存/历史；销毁组件只在隔离 QA 页面验证，关欣的构建产物取证确认正式入口不可达。给组长的更新包另存本地。
