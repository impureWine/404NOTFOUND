# Alpha 冲刺 Day 5｜曾俊涛测试与运维交付

日期：2026-10-27（北京时间）；测试源码版本：[`main@34d751c35a555c930dbccf0ae00dcf4a04a00564`](https://github.com/impureWine/404NOTFOUND/commit/34d751c35a555c930dbccf0ae00dcf4a04a00564)。本目录是测试报告和可复核证据，**不是生产部署或正式发布包**。

| 文件 | 用途 |
|---|---|
| [01_最新主线独立复核_34d751c.md](01_最新主线独立复核_34d751c.md) | 逐层执行结果、GitHub 增量与候选判定 |
| [02_给组长_Day5最新博客素材_34d751c.md](02_给组长_Day5最新博客素材_34d751c.md) | 成员 8 的博客事实、进展和运行图注 |
| [03_最新用例与缺陷分诊_34d751c.md](03_最新用例与缺陷分诊_34d751c.md) | 用例、缺陷状态和复测门槛；测试岗缺陷使用 `T8-D5-xx` 编号 |
| [04_测试随笔更新稿_34d751c.md](04_测试随笔更新稿_34d751c.md) | 基于作者公开配套资料的课程测试随笔素材 |
| [references/构建之法第2与13章公开资料阅读记录.md](references/构建之法第2与13章公开资料阅读记录.md) | 实际阅读来源与范围 |
| [SHA256SUMS.txt](SHA256SUMS.txt) | 本目录除清单自身外所有文件的 SHA-256 |

## 最短结论

后端 PGlite 自动化 **120/120**、前端适配器 **6/6** 通过，Vite 双入口构建成功。13 项跨层记录/许可探针 **11/13**，D4-07 可读历史与 D4-12 模型入口许可仍未达标；本机发布配置检查 **BLOCKED**。Edge 静态首页和 UX 展示页 2/2 打开、0 业务 API 请求。真账号 UI 配合 QA 直接调用同源记录 API 的 A/B 隔离通过，但正式保存/历史页面闭环仍未通过；详情正文不可读。

`main@734b5f5` 和 `main@66504bc3` 的历史结果保存在本人本地工作区，不混入本次提交的测试分母。庄剀涵数据/检索修复的作者聚焦测试与郭昱祺 Day 5 交互修订的 36＋77 组浏览器自查均按各自材料引用，不称为本人独立复跑。

## 证据与复跑

- 根目录 `.log` 与 `.json` 是原始后端、前端、构建、13 项探针及发布配置结果。`evidence/main34d751c/` 包含 4 张 Edge 截图和 2 份浏览器机器记录。
- `tests/day5-record-acceptance-rerun.mjs` 接收仓库根目录和完整源码 SHA；它使用合成账号、环回 HTTP、PGlite 与计数模型替身。退出码 1 表示两项门槛未达标，应连同 JSON 如实保留。
- `tests/day5-static-browser-smoke.mjs` 接收仓库根目录、输出目录和完整 SHA；需 `PLAYWRIGHT_MODULE_PATH` 指向 Playwright Core，并在本机安装 Edge。静态预览使用 5177 端口。
- `tests/day5-browser-api-assisted-record.mjs` 需 `DAY5_REPO_ROOT`、`DAY5_OUTPUT_DIR`、`DAY5_SOURCE_SHA`、`PLAYWRIGHT_MODULE_PATH`。可设 `DAY5_API_PORT` 与 `DAY5_WEB_PORT` 避免本地占用；本次成功复跑使用 3011/5189。浏览器注册/登录/退出是真 UI，记录许可/保存/读取来自 QA 直接 API 请求。
- 本次源码 ZIP 由[精确提交归档](https://github.com/impureWine/404NOTFOUND/archive/34d751c35a555c930dbccf0ae00dcf4a04a00564.zip)获取，SHA-256 为 `cfcd1ce7c77a0c55a50cad20bfb1e9546e2e80dcded1459a198f46f5e7522476`；未重复上传到本目录。

正式 PostgreSQL 16、HTTPS、真实 Wikipedia 网络、真实模型和完整页面业务闭环仍需授权环境与团队新增证据。当天站会照片、其他成员进展、实际工时、燃尽与博客发布由组长按真实记录完成。
