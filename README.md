# 404烦恼未找到 · 团队协作精简版

2026-10-19 整理。仅保留本轮协作需要的需求、分工、设计依据、Web页面原型和React/Web＋桌宠演示源码，共60个文件。历史材料在原工作区和完整版共享包中保留，没有删除。

## 先看这三份

1. [需求范围 v0.3](docs/需求范围_v0.3.md)：统一六模块、REQ01～REQ17及功能边界。
2. [当前任务分工](docs/当前任务分工.md)：10月18日系统设计与数据库设计方案；成员确认和完成情况以实际记录为准。
3. [团队协作规则](docs/团队协作规则.md)：交付、评审、贡献与删除约束。

## 需要时再看

| 文件 | 用途 |
| --- | --- |
| [需求规格说明书 v1.3](docs/需求规格说明书_v1.3.docx) | 当前最高编号的Word版本，存在不代表已验收 |
| [UML设计 v1.1](docs/UML设计_v1.1.md) | 类、接口、约束和内嵌Mermaid源图 |
| [原型交互说明](docs/原型交互说明.md) | 演示行为、状态和数据边界 |
| [桌宠演示](demo/桌宠原型.html) | 下载后用浏览器打开，无需安装 |
| [Web端原型首页](web-prototype/home.html) | 24页HTML原型，下载后用浏览器打开 |
| [Web页面与流程总览](web-prototype/prototype-guide.html) | 查看页面入口和原型流程 |
| [React原型源码](prototype/) | Web页面与桌宠共用的React/Vite演示源码及依赖锁文件 |

源文档保留原文，其中提到的旧路径、历史资料、预览图和生成文件不一定包含在精简版中；日常阅读使用以上链接，需要追溯时查看完整版。

## Web端原型查看

完整下载或解压共享包后，用浏览器打开 `web-prototype/home.html`；页面总览为 `web-prototype/prototype-guide.html`。请保留整个目录，页面跳转需要同目录HTML，样式、脚本和图片也需一起保留。

该目录包含24个HTML页面、6个CSS/JS文件及2个图片资源。覆盖首页、陪伴、信息查询、日历、训练、烦恼整理、排练、登录注册、个人资料和设置，并保留空/加载/失败等状态页。部分远程字体、Tailwind、图标等需要联网加载。GitHub文件页显示源码，不能直接当网页预览。

`web-prototype/` 是原Web评审版页面；`prototype/` 是另一套React演示实现，两者不是自动同步的构建关系。评审Web页面请从前者进入，修改React交互请使用后者。它们均为原型，不代表已实现生产功能。

## prototype目录是什么

- `src/pages/`：Web端工作台、陪伴/查询、训练、工具、登录注册和个人资料页面。
- `src/pet/`：桌宠界面、形象和交互组件。
- `src/App.jsx`、`context.jsx`、`ui.jsx`：页面切换、共享演示状态和通用组件。
- `src/main.jsx`、样式文件及 `index.html`：应用入口与页面样式。
- `package.json`、`package-lock.json`、`vite.config.js`：依赖、锁定版本和开发构建配置。

## 原型开发

安装Node.js与npm，版本要求沿用原源码说明：Node.js 20.19或22.12及以上受支持版本。

```powershell
cd prototype
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

访问 `http://localhost:5173/` 查看React Web首页，访问 `http://localhost:5173/#pet` 查看桌宠。构建使用 `npm run build`。依赖目录与构建产物不提交。

原型是模拟演示，没有真实AI、后端认证、数据库、系统悬浮窗或微信接入。源码仍含历史功能（如担忧瓶演示），不代表它们属于当前范围；需求冲突以v0.3为准。离线HTML是独立快照，修改源码不会自动更新它。不要输入真实密码或私密内容。

## GitHub共享

建议新建 **Private私有仓库**，邀请团队成员；本包含姓名、学号等内部信息。尚未确定开源许可，不擅自添加开源许可证。

新建空仓库后，在本精简目录执行（远程地址替换为真实地址）：

```powershell
git init -b main
git add .
git status --short
git commit -m "docs: 初始化团队协作精简材料"
git remote add origin https://github.com/YOUR-OWNER/YOUR-REPO.git
git push -u origin main
```

已有团队仓库时，克隆后通过个人分支和PR导入，不重新初始化或强推。各成员使用本人身份提交；至少一名非作者成员复核后合并。Word同一时间由一人编辑。删除任何项目文件前必须获得张王昊明确允许。课程要求的华为云提交仍按原协作规则执行。

## 本次精简

不纳入答辩PPT、评审表、品牌素材、设计工具导入包、其他重复Web副本、旧版本、逐页截图、构建产物和重复说明文件。仓库基本配置保留为 `.gitignore`、`.gitattributes`、`.editorconfig`、`AGENTS.md`；上传与协作说明合并到本README。

已核对复制文件哈希、源码本地依赖和Web页面本地资源/跳转链接完整性；未重新安装、构建或执行功能回归。未创建远程仓库或上传。
