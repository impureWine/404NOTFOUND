# AGENTS.md

本文件是本仓库的 agent 工作说明。换设备后先读这里，再动手。

## 0. 最高约束（团队既定，任何任务都不得覆盖）

不得将演示原型或建议方案描述为已完成的生产系统。

以下三条是它在写作与验证上的具体口径，必须同时遵守：

1. **"通过"只指本次运行环境下有可复跑证据**。未执行、无法验证、替身（mock）通过，必须分别标注，不得合并成"已完成"。
2. **计划、模板、待填材料不得写成已经发生的事实**。用"计划 / 待复核 / 未验证 / 阻塞"表述；不要为了博客好看而提前兑现进度。
3. **测试只用合成数据**。本仓库统一以 `synthetic:` 前缀构造测试字节，禁止使用真实用户正文、真实凭据或同伴的私人材料。

## 1. 项目与角色

- 项目：**404NOTFOUND / 404烦恼未找到** —— 面向大众日常烦恼的桌宠陪伴与减压工具。三个入口：Web 原型、Electron 桌宠、微信（规划/模拟）。
- 范围：6 个模块、REQ01～REQ17（以 `docs/需求范围_v0.3.md` 为准）。
- 课程：软件工程实践（2601_FZU_SE）。当前阶段：**Alpha 7 天冲刺，2026-10-23 ～ 10-29**。
- 本工作区使用者：**关欣（102400402）**，角色 **安全 / 内容审核（T07）**。

## 2. 仓库地图

```text
backend/            Express + PostgreSQL 数据服务（契约、仓储、迁移、测试、每日证据）
database-design/    数据库设计、ER 图、PostgreSQL DDL、验收清单
prototype/          React/Vite 演示原型（含桌宠 DesktopPet）
web-prototype/      30 个独立 HTML 评审原型
demo/               离线桌宠演示（单文件 HTML，非 Electron 安装包）
docs/
  ├─ alpha/         Alpha 冲刺材料（个人材料放 docs/alpha/<成员名>/）
  ├─ 第三次作业_*/   各成员第三次作业交付
  ├─ 代码规范.md     团队代码规范（提交/PR/评审依据）
  └─ 团队协作规则.md  任务、交付与文件删除要求
```

## 3. 当前进度（2026-10-24 15:30，Day 2 / 7）

| 项 | 状态 |
|---|---|
| Day 1（10/23） | **已完成**：安全基线审查 + 6 条可执行用例 + 证据链 |
| 分支 | `guanxin/day1-security-baseline` @ `f9223a7`（3 个提交） |
| Issue | [#13](https://github.com/impureWine/404NOTFOUND/issues/13) open（正文缺「相关提交」段，需补评论） |
| PR | [#16](https://github.com/impureWine/404NOTFOUND/pull/16) **open 未合并**，0 评审 |
| main | `db3399b`（已前进，Day 2 新工作应从 main 起新分支） |

Day 1 产出（已完成，勿重复）：

- `docs/alpha/关欣/Day1_安全检查清单_20261023.md`：SEC-01～14 逐条结论（通过 4 / 部分 6 / 未实现 4）、25 项已具备措施、3 高 / 7 中 / 3 低风险、10 项无法验收及前置条件。
- `backend/test/security/security-baseline.test.js`：6 条用例（AT-SEC-01/02/03/04、SEC-12 错误不泄露、SEC-08 结构检查）。
- `docs/alpha/关欣/Day1_冲刺随笔素材_20261023.md`：日志行、AI 使用记录、站会口播。

### Day 2（今天）关欣的重点

Day 2 主责是**账号与越权面**，交付"安全问题单 + 修复建议及复核记录"：

1. 检查重复注册（唯一约束、标准化登录名、失败提示不泄露账号是否存在）。
2. 检查无效/过期/已撤销会话被拒绝，退出与改密后旧凭据失效。
3. 检查越权访问资料与记录（含跨入口），确认拒绝且不泄露对象是否存在。
4. 检查日志泄漏：密码、令牌、正文、登录名不得进入日志与错误响应。
5. 评审 Electron `preload` 白名单（若已有代码）；无代码则记"未实现"，不得写成"已审查通过"。

Day 2 团队验收口径：**注册 → 登录 → 查看资料 → 退出可真实运行；接口拒绝未授权访问**。
注意当前 `backend/src/app.js` 只有 `/health/*`，业务路由与认证中间件由李泉毅负责，**未就绪前不得判定为"通过"**。

## 4. 环境与命令

- Node.js **24.x**、npm **11.x**（`backend` 使用 `pnpm-lock.yaml`，安装时优先 pnpm）。
- 数据库：本机**无** PostgreSQL / psql / Docker；自动化测试使用 **PGlite（PostgreSQL WASM）**。PGlite 通过 ≠ 正式 PostgreSQL 通过。

```powershell
# 后端测试（当前基线：tests 31 / pass 31 / fail 0）
cd backend
npm install          # 首次
npm test

# 依赖审计（默认镜像源不支持 audit，需指定官方源）
pnpm audit --registry=https://registry.npmjs.org --audit-level=high
```

网络：GitHub 需代理。Clash 混合端口 **7890**，一次性用法：

```powershell
git -c http.proxy=http://127.0.0.1:7890 -c https.proxy=http://127.0.0.1:7890 push
```

## 5. 工作流约定

**分支**：从 `main` 拉短期分支，命名 `成员名/任务短名`，如 `guanxin/day2-authz`。

**提交**：Conventional Commits（`feat|fix|docs|refactor|test|style|build|ci|chore|perf`），正文写清改了什么、验证结果、未覆盖范围，页脚 `Refs: #<Issue>`。一次提交只做一件事。

**Issue 格式**（团队实际用法，见 #11/#13）：

```text
[Alpha冲刺][<领域>] <动作 + 对象>
### 负责人
### 已完成内容
### 测试结果
### 相关提交
### 当前边界
```

**PR 格式**：跟随 `.github/PULL_REQUEST_TEMPLATE.md` 四段（问题与最终行为 / 关联任务 / 验证 / 评审清单）；标题用 `docs: …` 或 `fix: …` 式，不带 `[Alpha冲刺]` 前缀；必须写 `Refs: #<Issue>`。

**文件纪律**：

- 个人冲刺材料放 `docs/alpha/<成员名>/`，数据层每日证据放 `backend/evidence/daily/`。
- **禁止 `git add .` 或整目录 add**：Typora 会在打开的目录生成 `Typora_Hook_Log.txt`（可达数百 KB），必须用显式文件路径。
- 删除、移动项目文件前须取得用户明确允许。

## 6. 已知边界（不得声称已具备）

- **无 HTTP 业务路由**：`app.js` 仅 `/health/live`、`/health/ready`；无认证中间件、无 `DomainError → HTTP` 映射、无 Cookie/CSRF。
- **无模型链路**：仓库中零 LangChain / 模型调用代码，REQ01/09/11 的编排未实现。
- **REQ14 文字销毁无后端与前端实现**；仅有"库中无对应表/列"的结构性证据。
- **无敏感内容分类、危机表达处置**（SC-CRISIS 等只有设计条款）。
- **正式 PostgreSQL 环境的迁移、权限、性能、备份恢复均未验收**。
- Web/桌宠/微信三端能力不对等：Web 原型可演示，桌宠为离线 HTML 演示，微信为模拟。

## 7. 换设备后第一步

```powershell
git clone https://github.com/impureWine/404NOTFOUND.git
cd 404NOTFOUND
git switch guanxin/day1-security-baseline   # AGENTS.md 与 Day 1 产出在此分支
cd backend; npm install; npm test           # 期望 31/31
```

然后：

1. 读本文件 → `docs/代码规范.md` → `docs/alpha/README.md`；
2. 确认代理（7890）与 Node 版本；
3. 从 `main` 拉 Day 2 新分支，别在 Day 1 分支上继续堆；
4. 路径以新设备实际路径为准，本文件中的绝对路径仅作示例。

## 8. 未完成事项（交接用）

- [ ] Issue #13 补「相关提交」评论（3 个提交哈希：`48239d6`、`31006ff`、`f9223a7`）。
- [ ] PR #16 需一名非作者复核后合并。
- [ ] Day 2 账号/越权/日志检查与 Electron preload 评审。
- [ ] `docs/alpha/关欣/102400402_关欣.md` 尚未提交（博客用片段）。
