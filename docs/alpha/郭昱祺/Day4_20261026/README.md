# Day 4 · 保存／历史页面与走查问题清单

日期：2026-10-26 · 郭昱祺（102400413）· UX／产品设计 · 状态：本地组件交付，待团队复核与正式页面接入。

返回[个人交付导航](../README.md) · [Alpha 导航](../../README.md)

## 本次交付

延续已确认的“组件与规范为主”范围，在独立 React 组件展示入口补齐主动保存、本人历史、记录详情三组页面组件。界面延续项目当前导航、粉白背景、绿色文字和按钮规范。保存及历史流转使用合成数据与页面内存，没有连接真实保存、清除或认证接口。

| 交付 | 内容 |
| --- | --- |
| [保存与历史页面交付](保存与历史页面交付.md) | 三组页面、组件契约、19 个预置状态、操作流程及接口映射 |
| [走查问题清单](走查问题清单.md) | 实际发现的 5 个问题、修复依据、待联调项及复现步骤 |
| [文字销毁操作说明](文字销毁操作说明.md) | 独立输入、销毁、清空、离开，与已保存记录清除的区别 |
| [验证与截图清单](验证与截图清单.json) | 主走查结果、截图路径、尺寸、SHA-256 |
| [窄屏弹窗验证](窄屏弹窗验证.json) | 390px／320px 下保存与清除弹窗的补充验证 |

## 打开页面

在仓库根目录进入 `prototype`，已有依赖时运行：

```powershell
cd prototype
npm run dev -- --host 127.0.0.1 --port 5186 --strictPort
```

- [主动保存](http://127.0.0.1:5186/ux-components.html?page=save&state=normal)
- [本人历史](http://127.0.0.1:5186/ux-components.html?page=history&state=normal)
- [记录详情](http://127.0.0.1:5186/ux-components.html?page=record-detail&state=normal)

默认是“示例账号 A”。右上方“模拟身份”可切换游客和账号 A／B；这不建立真实登录会话。顶部状态按钮供评审切换固定样例。

推荐演示顺序：主动保存 → 勾选一条片段 → 预览保存范围 → 勾选本次许可 → 确认 → 本人历史 → 查看详情 → 清除 → 取消一次 → 重新确认清除。

场景间导航保留已确认的本次模拟记录，丢弃未确认的输入；身份切换清空当前选择、确认与详情。刷新或切换顶部预置状态会恢复全部合成数据，不能用于存放真实内容。

## 验证与截图

最终主走查通过 77 个检查组：19 个预置状态分别在 1440px、390px、320px 检查，共 57 组；保存、游客衔接、清除等交互 13 组；原有六场景正常态冒烟 6 组；页面异常汇总 1 组。另有窄屏弹窗 2 组通过。这里是脚本检查组数，不是独立用户测试人数或服务端验收用例数。

最终截图共 31 张：桌面预置状态 19 张、两种窄屏的正常态 6 张、桌面操作反馈／弹窗 4 张、窄屏保存弹窗 2 张。三张修复前的问题图另放在 `evidence/`，不计入最终截图。构建结果见 [build-output.txt](build-output.txt)，浏览器结果见 [browser-output.txt](browser-output.txt) 与 [modal-browser-output.txt](modal-browser-output.txt)。

| 关键截图 | 用途 |
| --- | --- |
| [主动保存正常态](screenshots/SV-N_save_1440.png) | 默认不选、标题限制及范围汇总 |
| [保存范围确认](screenshots/SV-confirmation.png) | 完整选中内容、独立许可及取消操作 |
| [本人历史正常态](screenshots/HS-N_history_1440.png) | 列表仅含元数据 |
| [记录详情](screenshots/RD-N_record-detail_1440.png) | 主动打开后展示正文 |
| [历史空态](screenshots/HS-E_history_1440.png)／[读取失败](screenshots/HS-F_history_1440.png) | 无记录与服务失败的反馈区别 |
| [游客保存衔接](screenshots/SV-guest-gate.png) | 默认不保留，显式选择临时保留范围 |
| [清除确认](screenshots/RD-clear-confirmation.png) | 默认“保留记录”，再次确认清除 |
| [320px 保存确认](screenshots/SV-confirmation_320.png) | 窄屏按钮与内容可操作 |

复现脚本：[scripts/walkthrough.cjs](scripts/walkthrough.cjs)。需本地 Node、Playwright 和 Edge；Playwright 未在 Node 模块路径中时，通过 `PLAYWRIGHT_MODULE_PATH` 指定已有安装路径。先启动开发服务，再从仓库根目录执行：

```powershell
node "docs/alpha/郭昱祺/Day4_20261026/scripts/walkthrough.cjs"
node "docs/alpha/郭昱祺/Day4_20261026/scripts/walkthrough.cjs" --narrow-dialogs-only
```

脚本仅向本地开发地址请求静态资源，使用虚构片段检查组件。真实身份权限、保存许可、幂等、版本竞争和服务器清除仍需正式页面与后端联合验证。

## AI 技术员贡献

AI 协助核对 Day 4 任务和接口规范，编写页面组件与状态切换，生成并运行可复现的浏览器走查脚本，检查截图，修复样式冲突、弹窗焦点及窄屏状态按钮问题，并整理交付文档。证据是本目录脚本、日志、截图和源码差异；没有测量节省工时或效率百分比，也没有代替团队成员确认验收。

源码基线：[main b6f1d7f](https://github.com/impureWine/404NOTFOUND/tree/b6f1d7fb35b7e62ea5e98d86c3ca44d82042effa)。本次提交、PR 和 Issue 链接在实际发布后补录。
