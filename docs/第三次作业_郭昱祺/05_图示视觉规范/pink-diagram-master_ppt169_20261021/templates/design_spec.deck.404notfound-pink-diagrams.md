---
deck_id: 404notfound-pink-diagrams
kind: deck
category: brand
summary: 404NOTFOUND课程设计图示汇报模板，帮助评阅者理解需求范围、流程边界和原型差异
keywords: [需求, UML, 数据流, UX, 课程答辩]
primary_color: "#C86B8C"
canvas_format: ppt169
canvas_width: 1280
canvas_height: 720
canvas_viewbox: "0 0 1280 720"
replication_mode: standard
native_structure_mode: structured
page_count: 5
placeholders:
  01_cover: ["{{TITLE}}", "{{SUBTITLE}}", "{{AUTHOR}}", "{{DATE}}"]
  02_overview: ["{{PAGE_TITLE}}", "{{CONTENT_AREA}}", "{{PAGE_NUM}}"]
  03_detail: ["{{PAGE_TITLE}}", "{{DETAIL_AREA}}", "{{DETAIL_NOTES}}", "{{PAGE_NUM}}"]
  04_comparison: ["{{PAGE_TITLE}}", "{{LEFT_AREA}}", "{{RIGHT_AREA}}", "{{PAGE_NUM}}"]
  05_table: ["{{PAGE_TITLE}}", "{{TABLE_AREA}}", "{{PAGE_NUM}}"]
---

# 404NOTFOUND 柔和粉·简洁图示母版 — Design Specification

## I. Template Overview

|Application context|Definition|
|---|---|
|Recurring presentation family|404NOTFOUND课程设计图示、交互评审与阶段汇报|
|Intended audiences and outcomes|老师与团队成员；理解需求、正常与异常出口、数据边界及原型差异|
|Delivery and reading assumptions|教室投影结合文件交接；总览指向局部，完整长图与状态表供附件阅读|
|Representative narrative/page roles|封面、总览、局部放大、现状与目标比较、状态或规范表|

用户在v1.1大字号母版基础上选择继续简化：移除全部粉色底框、圆角外框、通高侧条和页脚横线。采用白底、深色正文、深粉标题，仅保留一小段粉色标题下划线。两栏页用一条中性灰细线区分阅读区域。保持1个Master、5个Layout、18个原生可编辑占位区。本模板为课程设计稿，样张已于2026-10-22由用户选择方案1确认定稿（Prototype review: user-reviewed）；仍待团队复核，不是完整答辩稿或生产系统。

## II. Color Scheme

|Role|HEX|Application|
|---|---|---|
|Primary|#C86B8C|标题下64px短线，4px线宽|
|Title|#984762|封面标题与页标题|
|Body|#342B33|内容区文字|
|Secondary|#71616B|版式标签、品牌页脚与页码|
|Divider|#E6E1E5|两栏页的1px细分隔线|
|Background|#FFFFFF|完整页面；内容区不加底色或外框|

## III. Typography

中文与拉丁主字体均为Microsoft YaHei，Noto Sans SC为浏览预览回退。沿用已选大字号：封面52px（39pt）；页标题44px（33pt）；正文与副标题32px（24pt）；作者、日期26px（19.5pt）；标签22px（16.5pt）；页脚与页码16px（12pt）。SVG字号乘0.75换算为PowerPoint磅。文字占位区左上起写；模板不嵌入字体。

## IV. Signature Design Elements

左右页面安全边距96px；标题、标签和内容左边缘共线。页标题框为(96,40,1088,80)，固定粉色短线位于(96,132)到(160,132)。版式标签基线为y=204，正文框从y=252开始，到y=564结束；标签至正文框保留48px。页脚品牌基线为y=692，不加横线。

局部页图区624×312、解释栏352×312，两框之间留112px并用x=776的灰线区分；对照页两框各496×312，中间留96px，用x=640的灰线区分。单栏内容区1088×312。除白色页面背景外，不绘制任何填色矩形。粉色只作为标题与短线的少量强调。

容量建议：封面标题一行约18个汉字，页标题一行约22个汉字；总览讲一层核心关系；局部页讲一个关键分支、至多3条短说明；对照页讲一个比较维度；状态表每页约3条。长流程用原图编号拆页，57行状态表作为附件。实际内容须按预览决定裁切与缩放，插入图片不会继承母版文字字号。

## V. Page Roster

|SVG|Layout key / picker name|视觉与角色|槽位、容量与行为|
|---|---|---|---|
|`01_cover.svg`|cover / 01 封面|白底开放式封面，标题与副标题用留白分层，无底框|title (96,254,1088,92) 52px；subtitle (96,390,1088,96) 32px；author (96,566,600,52)、date (928,566,256,52) 26px|
|`02_overview.svg`|overview / 02 总览|单栏无框；讲一层范围与关系；图等比适配|title (96,40,1088,80) 44px；object (96,252,1088,312) 32px；page-number (1112,668,72,32) 16px|
|`03_detail.svg`|detail / 03 局部放大|左图右说明，只有中性灰竖分隔线|title同总览；object (96,252,624,312) 32px；body (832,252,352,312) 32px自动换行，建议至多3条短说明；页码同总览|
|`04_comparison.svg`|comparison / 04 双图对照|等宽无框两栏，中间96px留白加细线|title同总览；object左 (96,252,496,312)、右 (688,252,496,312) 32px；页码同总览|
|`05_table.svg`|table / 05 状态与规范|无底框单栏，简短状态或规则；可放约3条|title同总览；object (96,252,1088,312) 32px；页码同总览|

5个SVG各对应一个独立Layout，同属于master-pink / 404NOTFOUND 柔和粉·简洁。预览仅用简短占位文字，不预置产品截图或外部位图。

## VII. Placeholder Overrides

局部页使用DETAIL_AREA、DETAIL_NOTES，对照页使用LEFT_AREA、RIGHT_AREA，表格页使用TABLE_AREA；逐页映射见frontmatter。标题、作者、日期和页码沿用既有命名。
