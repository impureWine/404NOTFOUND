# PPT 初稿 · 制作与核对说明

日期：2026-10-27。文件：[UX 界面原型设计答辩初稿 v0.1](UX_界面原型设计答辩_初稿_v0.1_20261027.pptx)。

## 已确认的设计约束

用户确认方案 1：完整链路 12 页，目标约 8 分钟。沿用 10 月 22 日确认的 v1.2 简洁母版，白底、大字号、增加留白；不增加粉色大底框和装饰。母版来源：`docs/第三次作业_郭昱祺/05_图示视觉规范/404NOTFOUND_图示PPT母版_定稿.pptx`。

页序与来源骨架、事实证据见 [页序与证据映射](PPT页序与证据映射.md)。内容依次为：封面、个人范围、用户路径、登录、主页、聊天、来源、情绪／训练、保存、历史／清除、修订验证、交付边界。

## 文件结构与可编辑性

- 原生 PPTX：**12 页、12 份演讲备注、1 个母版、5 个版式、10 张界面局部图片**。
- 标题、说明、路径和编号为原生可编辑文字；产品界面局部是 PNG 截图，不能在 PPT 内编辑单个按钮文字。交互演示继续使用 React 入口。
- 每页备注只含可自然讲述的文字；不添加配音、自动播放、转场或对象动画。约 8 分钟是组织目标，未虚构已完成的试讲计时。
- 截图均来自本次真实启动的本地页面，取局部提高投影可读性；裁切范围、原图哈希见 [PPT 截图裁切清单](PPT截图裁切清单.json)。没有重画界面内容或合成业务成功截图。

## 制作方式

使用 `ppt-master` 的 Edit Native PPTX 路线：先导入既有母版，用户确认页序后，按计划复制对应来源页并替换 Slide-local 内容。Master／Layout 继承元素不改写。12 页均属于已规划的编辑页，导出收据为 `output_pages=12`、`rebuilt=12`，与计划一致。

生成脚本：[build-native-draft.py](scripts/build-native-draft.py)。脚本以已导入的 `presentation-workspace` 为输入；该目录为本地中间产物，不作为本次 Git 交付。复现需先使用已安装的 ppt-master 执行：

```powershell
python '<ppt-master>/scripts/pptx_to_svg.py' 'docs/第三次作业_郭昱祺/05_图示视觉规范/404NOTFOUND_图示PPT母版_定稿.pptx' -o 'docs/alpha/郭昱祺/Day5_20261027/presentation-workspace' --inheritance-mode both --roundtrip
python 'docs/alpha/郭昱祺/Day5_20261027/scripts/build-native-draft.py'
python '<ppt-master>/scripts/svg_authoring_view.py' 'docs/alpha/郭昱祺/Day5_20261027/presentation-workspace/authoring-svg-flat' --refresh-summary
python '<ppt-master>/scripts/svg_quality_checker.py' 'docs/alpha/郭昱祺/Day5_20261027/presentation-workspace' --roundtrip --json
python '<ppt-master>/scripts/svg_to_pptx.py' 'docs/alpha/郭昱祺/Day5_20261027/presentation-workspace' --roundtrip --primary-language zh-CN
```

导出器在 `presentation-workspace/exports/` 打印实际输出路径；正式交付复制为本目录固定文件名。Python 需 Pillow，浏览器报告与原始截图应先按交互记录中的步骤生成；不要用未通过的报告制作“已验证”页。

## 已完成的核对

| 核对 | 结果 | 证据 |
| --- | --- | --- |
| SVG 容量与结构 | 12 页通过，0 警告、0 错误 | [SVG 输出](svg-quality.json) |
| 原生导出 | 12 页，12 份备注，质量门通过 | [导出收据](ppt-export-output.txt) |
| PPTX 包结构与关系 | passed，错误／建议项均为空 | [交付检查](pptx-delivery.json) |
| 内容回读 | 12 页与 12 份备注齐全，无 Page Title／Detail Area 等占位词 | [PPT 回读](PPT回读核对.md) |
| PowerPoint 实际渲染 | 全部 12 页导出为 1280×720 PNG | [12 页总览](PPT预览/12页总览.png)、[渲染脚本](scripts/render-native-ppt.ps1) |
| 目视核对 | 已查看全部页总览及登录、主页、保存、验证页的大图，检查文字／截图／页脚没有裁切，层级与间距一致 | 本目录 PNG 预览；本项是作者自查，不等于团队评审 |

## 待反馈

目前是 **初稿**。正式业务演示截图需在前端整合、实际联调并有证据后替换；不能把模拟组件、拦截认证响应或后端单项报告写成完整 UI 闭环已经通过。后续由本人试讲、非作者走查和团队评审提出修改。
