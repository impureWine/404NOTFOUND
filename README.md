# 404烦恼未找到 · 404NOTFOUND

面向日常烦恼陪伴与减压的课程团队项目。当前 React 业务入口已连接真实认证、记录、模型、检索与训练服务，并提供桌面和微信适配代码。

**当前运行入口：[全业务真实服务运行指南](docs/真实服务接入与运行.md)；功能范围与外部验收条件见 [接入清单](docs/功能接入验收清单.md)。** 未配置数据库、模型或平台凭据时返回实际错误，不回退演示数据。

## 从这里开始

| 想做什么 | 阅读入口 |
| --- | --- |
| 了解功能范围 | [需求范围 v0.3](docs/需求范围_v0.3.md) |
| 查找全部文档 | [文档索引](docs/README.md) |
| 查看任务与职责 | [当前任务分工](docs/当前任务分工.md)、[Alpha 冲刺导航](docs/alpha/README.md) |
| 参与开发和评审 | [团队协作规则](docs/团队协作规则.md)、[代码规范](docs/代码规范.md) |
| 核对架构和接口 | [技术决策与 Agent 基线](docs/第三次作业_张王昊/03_技术决策与Agent接入基线.md)、[全功能接口与限制规范](docs/第三次作业_张王昊/09_全功能接口与限制规范.md) |
| 查看交付材料 | [设计说明书与答辩入口](docs/README.md#设计说明书与答辩) |
| 查看 Day 1 API 骨架 | [Express 服务和共享契约说明](server/README.md) |
| 查看业务界面与交互 | [React 业务界面](prototype/)、[Web 页面原型](web-prototype/home.html)、[原型交互说明](docs/原型交互说明.md) |

## 目录职责

```text
404NOTFOUND/
├── prototype/          # React/Vite 业务源码、依赖和构建入口
├── backend/            # Express 数据服务、SQL 迁移、测试及执行证据
├── database-design/    # 数据库设计、ER 图、DDL 和验收材料
├── web-prototype/      # 旧链接转入真实应用的 HTML 入口
├── demo/               # 离线桌宠演示
├── docs/               # 团队规则、需求、专业设计与统一文档索引
│   └── alpha/          # Alpha 冲刺材料导航
└── .github/            # PR 模板
```

根目录现有 PDF、PPTX 和个人冲刺清单由文档索引统一链接。维护方式见 [仓库维护约定](docs/仓库维护约定.md)。

## 开发与运行

### React 业务界面

按已有环境说明使用 Node.js 20.19、22.12 或更高的兼容版本；长期使用版本由团队在实际环境中确认。

```powershell
cd prototype
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

打开终端显示的本地地址；桌面真实入口见 Electron 说明；构建运行 `npm run build`。该目录已有 `package-lock.json`，安装依赖使用 npm。

### 后端数据服务

先阅读 [backend/README.md](backend/README.md) 的环境、迁移和实现边界。后端现有 `pnpm-lock.yaml`，建议沿用兼容该锁文件的 pnpm，不在文档整理时引入另一套锁文件。

```powershell
cd backend
pnpm install --frozen-lockfile
pnpm test
```

测试使用隔离 PGlite 实例。启动真实 PostgreSQL 服务前，按后端说明准备本地 `.env`、`DATABASE_URL` 和目标数据库，然后运行 `pnpm run migrate`、`pnpm start`。复制配置前确认目标 `.env` 是否已存在，避免覆盖本人配置。迁移只在已确认的开发/验收环境执行。

### 旧链接与部署边界

旧 HTML 页面转入当前真实服务，不再提供固定回复和模拟历史。完整启动、同源部署、桌面及微信配置按运行指南执行。

代码接入与隔离测试不代表真实 PostgreSQL、智谱实网、Electron 或微信公众号已验收。任务和短期用途许可当前在单进程内存中；服务重启后重新开始任务。保留旧源码用于历史比较，不作为当前业务入口。

## 协作入口

1. 先读 [代码规范](docs/代码规范.md) 和 [团队协作规则](docs/团队协作规则.md)，通过真实 Issue 明确任务与验收条件。
2. 提交时保留依赖锁文件一致性，使用 PR 说明变更、验证与局限，并请非作者评审。
3. 新增资料同步更新 [文档索引](docs/README.md)；各模块的运行与测试细节由模块 README 维护。
4. 删除文件前必须取得用户明确允许。重命名、移动中涉及原文件删除的操作也遵守该要求。

外部服务的实际运行状态以目标环境验证为准。
