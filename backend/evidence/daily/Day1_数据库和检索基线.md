# Day 1｜10月23日：数据库和检索基线

> 提交状态：已形成10月23日实际材料；提交前仍须由本人核对链接和实际工时。  
> 计划验收：1.5 SP

## 今日实际完成

- 检查仓库后确认此前只有设计DDL和前端演示原型，没有真实后端、Repository或运行测试。
- 检查本机环境：Node.js可用；没有全局npm、psql、Docker或PostgreSQL服务。
- 使用PGlite隔离PostgreSQL引擎执行现有DDL，首次发现 `pgcrypto` 扩展不可用。
- 核对PostgreSQL 16已内置 `gen_random_uuid()` 后，移除不必要的扩展安装要求；修改后整份DDL执行成功。
- 建立数据服务包、环境变量样例、迁移执行器、迁移校验和和002幂等元数据迁移。
- 选定Wikipedia MediaWiki API作为固定真实检索接入，不允许用户自定义上游URL。

## 今日交付

| 交付 | 路径 | 状态 |
|---|---|---|
| PostgreSQL基线迁移 | `database-design/sql/404notfound_postgresql.sql` | 隔离引擎执行通过，正式服务待验证 |
| 幂等支持迁移 | `backend/migrations/002_data_service_support.sql` | 隔离引擎执行通过 |
| 迁移执行器 | `backend/src/db/migration-runner.js` | 自动化测试通过 |
| 环境变量样例 | `backend/.env.example` | 已提供，不含真实密钥 |
| 数据服务说明 | `backend/README.md` | 已提供 |

## 当日验收证据

执行：

```powershell
cd backend
node <Codex运行时pnpm路径> test
```

与Day 1直接相关的结果：

- 001与002迁移在干净隔离库执行成功。
- 第二次运行不重复应用迁移。
- 标准化登录名唯一约束实际拒绝重复数据。

限制：该结果不能写成“PostgreSQL服务器已部署”，因为本机没有正式PostgreSQL服务。

## 今日阻塞

- 缺少PostgreSQL 16测试实例、psql和Docker。
- 正式数据库账号、网络和权限尚未提供。
- Wikipedia真实网络尚未成功，留到Day 3继续验证。

## 站会汇报

```text
今天完成了数据库现状核对、DDL隔离执行、扩展依赖修正、迁移执行器和检索接入选型。
当前DDL能在隔离PostgreSQL引擎执行，但正式PostgreSQL服务尚未验证。
下一步完成账号、会话、资料和主动保存仓储，并重点验证账号与入口隔离。
```

## 心得

静态标注“PostgreSQL兼容”不能代替实际执行。本次第一次运行就发现扩展依赖问题，因此后续所有数据库结论都应绑定运行环境和证据。

## AI辅助记录

- 用途：辅助整理迁移执行器、约束测试和文档草稿。
- 人工修正：根据实际DDL错误移除不必要扩展依赖，并由自动化测试复核。
- 局限：AI输出不能证明SQL已经执行；最终结论以测试结果为准。
