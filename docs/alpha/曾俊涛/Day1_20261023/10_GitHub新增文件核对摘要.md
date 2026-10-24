# GitHub 新增文件核对摘要

核对日期：初次 2026-10-23，后续补核 2026-10-24（北京时间）。全部为**只读核对**；本地交付文件未向 GitHub 上传、提交或推送。

## 版本与主要变化

| 对比 | 已核对的新内容 | 对测试／运维的实际影响 |
|---|---|---|
| 早期 `main@7303507` → [`523584c`](https://github.com/impureWine/404NOTFOUND/tree/523584c49876969fdc2a86415c9dad9bc4c32bc5) | `backend/` 数据服务、迁移、仓储、检索适配、自动化测试和庄剀涵 Day 1 材料；根 README 和文档导航更新；新增代码规范候选、PR 模板 | 从“只有演示原型可构建”扩展到“数据层可在 PGlite 隔离验证”。本人复跑 25/25 项通过，见[复核记录](08_新增后端独立复核记录.md) |
| `523584c` → [`db3399b`](https://github.com/impureWine/404NOTFOUND/tree/db3399baee7917a9f66d25c4ab71010cb240b44e) | `docs/alpha/郭昱祺/` 三份交接文档及导航 | 可把登录、项目首页、聊天、查询来源区的 16 个常规状态和异常分支纳入用例；文档尚未变成 React 组件或页面联调 |
| `db3399b` → [`1bdb874`](https://github.com/impureWine/404NOTFOUND/tree/1bdb8742865aab4bbb8485b9283ffb54ed383ede) | `prototype/README.md`、API client 与 5 项测试、模拟数据清单、路由表、文字销毁独立状态；同时修改 `App.jsx`、`Tools.jsx`、`package.json` | 10 月 24 日才补核到的 Day 1 前端交接。默认 mock，接口会报 `API_NOT_CONNECTED`；本机复跑 5/5 单测、构建和开发服务 HTTP 冒烟。真实认证和销毁隐私仍待联调与浏览器检查 |
| `1bdb874` → [`555f64c`](https://github.com/impureWine/404NOTFOUND/tree/555f64cb4922245a6b22e78c9351445b55293fa0) | 后端认证／资料、004 迁移及测试；另有 `server/` + `shared/` Day 1 骨架、组长 Day 1 任务与日志材料、关欣安全清单及李泉毅每日交接 | 17 个提交。10 月 24 日本机复跑 `backend` 37/37、`server` 8/8，后端隔离 HTTP 合同脚本 5/5；不倒填为 Day 1 当日结果，见[本目录后续交接](12_团队新增交接核对_20261024.md) |

## 已阅读的可用交接

- [较早 `main@523584c` 的后端说明](https://github.com/impureWine/404NOTFOUND/blob/523584c49876969fdc2a86415c9dad9bc4c32bc5/backend/README.md)明确**该版本** HTTP 只有存活和数据库就绪检查；[新 `main@555f64c` 说明](https://github.com/impureWine/404NOTFOUND/blob/555f64cb4922245a6b22e78c9351445b55293fa0/backend/README.md)已列认证资料、许可和基础记录 API。仓储归属仍必须来自服务端可信身份；正式 PostgreSQL、前端及模型联调继续单独验收。
- [庄剀涵 Day 1 材料](https://github.com/impureWine/404NOTFOUND/blob/523584c49876969fdc2a86415c9dad9bc4c32bc5/backend/evidence/daily/Day1_%E4%BB%8A%E6%97%A5%E6%8F%90%E4%BA%A4%E7%BB%88%E7%A8%BF_20261023.md)报告其 PGlite 验证和真实 Wikipedia 两次失败。本机独立重跑结果与原材料的测试计数不同，应保留各自版本、命令和原始日志，不合并成一项数字。
- [后端每日材料索引](https://github.com/impureWine/404NOTFOUND/blob/523584c49876969fdc2a86415c9dad9bc4c32bc5/backend/evidence/daily/README.md)说明 Day 2～7 文件是待当日复跑、评审、联调后填写的模板；不能把文件存在当作对应日期完成。
- [郭昱祺交接导航](https://github.com/impureWine/404NOTFOUND/tree/db3399baee7917a9f66d25c4ab71010cb240b44e/docs/alpha/%E9%83%AD%E6%98%B1%E7%A5%BA)指出其本次只交组件设计与规范，未认领完整 React 页面装配；界面和业务接入仍需程杰与相关接口负责人协作。
- [团队代码规范](https://github.com/impureWine/404NOTFOUND/blob/db3399baee7917a9f66d25c4ab71010cb240b44e/docs/%E4%BB%A3%E7%A0%81%E8%A7%84%E8%8C%83.md)目前标为 **v1.0 团队评审候选**。它要求区分 Mock、PGlite、真实服务与端到端结果；`lint`、`format:check` 等仍是建议配置，仓库包脚本尚未实现，不能写为 CI 已启用。

## 待负责人核对的差异

1. `main@523584c` 的迁移测试执行 **001、002、003**；新 `main@555f64c` 新增 **004**。部分提前写好的 Day 2／Day 6 模板仍写“001和002”，当日使用前应由负责人按对应提交和实际命令更新。
2. 庄剀涵的 Day 1 材料写 19 项通过，本机对固定版本运行 `pnpm test` 为 25 项通过；请其附原始运行版本、命令和测试输出，组长在团队日志中按证据引用。
3. 代码规范是候选稿；组长需确认采纳版本、发布前博客时间和真实 Issue／提交链接。当前本地 CI 草稿不等于 GitHub Actions 已运行。
4. 郭昱祺文档的字段、状态和视觉目标需由前端及接口负责人对照已确认契约复核；页面和组件编码、测试及无障碍验收仍是后续工作。

上述差异是交接待办，不预设他人工作已失败或未参与。实际完成量和燃尽由张王昊按任务板、非作者复核和证据确定。
