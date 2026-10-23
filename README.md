# 404烦恼未找到 · 404NOTFOUND

面向日常烦恼陪伴与减压的课程团队项目。仓库收录需求与设计、React 演示原型、数据服务实现、测试及 Alpha 冲刺材料。

## 从这里开始

| 想做什么 | 阅读入口 |
| --- | --- |
| 了解功能范围 | [需求范围 v0.3](docs/需求范围_v0.3.md) |
| 查找全部文档 | [文档索引](docs/README.md) |
| 查看任务与职责 | [当前任务分工](docs/当前任务分工.md)、[Alpha 冲刺导航](docs/alpha/README.md) |
| 参与开发和评审 | [团队协作规则](docs/团队协作规则.md)、[代码规范](docs/代码规范.md) |
| 核对架构和接口 | [技术决策与 Agent 基线](docs/第三次作业_张王昊/03_技术决策与Agent接入基线.md)、[全功能接口与限制规范](docs/第三次作业_张王昊/09_全功能接口与限制规范.md) |
| 查看交付材料 | [设计说明书与答辩入口](docs/README.md#设计说明书与答辩) |

## 目录职责

```text
404NOTFOUND/
├── prototype/          # React/Vite 演示源码、依赖和构建入口
├── backend/            # Express 数据服务、SQL 迁移、测试及执行证据
├── database-design/    # 数据库设计、ER 图、DDL 和验收材料
├── web-prototype/      # 独立 HTML 评审原型
├── demo/               # 离线桌宠演示
├── docs/               # 团队规则、需求、专业设计与统一文档索引
│   └── alpha/          # Alpha 冲刺材料导航
└── .github/            # PR 模板
```

根目录现有 PDF、PPTX 和个人冲刺清单由文档索引统一链接。维护方式见 [仓库维护约定](docs/仓库维护约定.md)。

## 开发与运行

### React 演示原型

按已有环境说明使用 Node.js 20.19、22.12 或更高的兼容版本；长期使用版本由团队在实际环境中确认。

```powershell
cd prototype
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

打开终端显示的本地地址，桌宠演示入口为 `/#pet`；构建运行 `npm run build`。该目录已有 `package-lock.json`，安装依赖使用 npm。

### 后端数据服务

先阅读 [backend/README.md](backend/README.md) 的环境、迁移和实现边界。后端现有 `pnpm-lock.yaml`，建议沿用兼容该锁文件的 pnpm，不在文档整理时引入另一套锁文件。

```powershell
cd backend
pnpm install --frozen-lockfile
pnpm test
```

测试使用隔离 PGlite 实例。启动真实 PostgreSQL 服务前，按后端说明准备本地 `.env`、`DATABASE_URL` 和目标数据库，然后运行 `pnpm run migrate`、`pnpm start`。复制配置前确认目标 `.env` 是否已存在，避免覆盖本人配置。迁移只在已确认的开发/验收环境执行。

### HTML 与离线演示

下载仓库后，用浏览器打开 [Web 原型首页](web-prototype/home.html)、[页面总览](web-prototype/prototype-guide.html) 或 [桌宠演示](demo/桌宠原型.html)。保留同目录资源和跳转关系；部分远程字体、样式或图标需要联网。GitHub 文件页展示源码，不能直接作为网页预览。

`web-prototype/` 与 `prototype/` 是两套演示材料，修改其中一套不会自动更新另一套。

## 实现与验证边界

- React 和 HTML 入口用于演示交互，不代表正式认证、模型、桌面窗口或多端能力已经完成。
- 后端已有数据仓储、迁移、契约、检索适配及测试代码；具体已实现和未包含的内容以 [后端说明](backend/README.md) 和对应执行证据为准。
- PGlite、Mock、真实 PostgreSQL、真实模型和端到端测试分别登记。文件存在、计划文字和测试用例不等于功能已验收。
- 需求按 v0.3 核对；技术及接口差异按技术基线、接口规范和团队确认记录处理。不要输入真实密码或私人正文进行原型演示。

## 协作入口

1. 先读 [代码规范](docs/代码规范.md) 和 [团队协作规则](docs/团队协作规则.md)，通过真实 Issue 明确任务与验收条件。
2. 提交时保留依赖锁文件一致性，使用 PR 说明变更、验证与局限，并请非作者评审。
3. 新增资料同步更新 [文档索引](docs/README.md)；各模块的运行与测试细节由模块 README 维护。
4. 删除文件前必须取得用户明确允许。重命名、移动中涉及原文件删除的操作也遵守该要求。

本次整理仅更新文档与导航，并引入 PR 模板；未变更应用代码、执行数据库迁移或将计划描述为已完成的系统。
