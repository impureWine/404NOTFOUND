# Day 2 安全验证原始证据｜2026-10-24

被测主线基线为 `230293d`，当前工作分支 `guanxin/day2-security-review`。执行时分支名为 `guanxin/day2-authz`，历史 JSON 保留原名；本次本地重命名见 `branch-rename.json`，HEAD 不变。报告见 [关欣 Day 2 安全复核](../../../../docs/alpha/关欣/Day2_账号与权限安全复核_20261024.md)。所有会话与数据库均为本机隔离合成场景；未调用真实模型或真实用户数据库。

## 证据文件

| 文件 | 用途 |
|---|---|
| `existing-tests.tap`、`existing-tests.meta.json` | 17 个原有后端测试文件：58 通过、0 失败；元数据记录完整命令与执行时间 |
| `day2-authz.tap`、`day2-authz.meta.json`、`observations.json` | 首轮专项：22 条、17 通过、5 失败 |
| `day2-authz-final.tap`、`day2-authz-final.meta.json`、`observations-final.json` | 修正夹具独立复跑能力并增加原始令牌断言后的最终专项，结论仍为 17 通过、5 失败；报告引用这一组 |
| `entry-rotation-only.tap`、`entry-rotation-only.meta.json` | D2-22 单独执行仍复现 404 → 200；1 条失败、退出 1，确认不依赖其他用例 |
| `frontend-client.tap`、`frontend-client.meta.json` | API 客户端 6 条替身单元测试；不代表浏览器联调 |
| `dependency-audit.json`、`dependency-audit.meta.json` | 官方源 audit，high 1、critical 0、退出 1；没有进行崩溃或拒绝服务复现 |
| `syntax-check.txt` | 新增专项和 Electron 三个脚本的语法检查结果 |
| `source-fingerprints.json` | 基线提交及被测代码 / 专项代码的 SHA-256，便于对照文件版本 |
| `branch-rename.json` | 本地分支旧名、新名、时间及不变的 HEAD；未修改远端 |
| `summary.json` | 从最终 TAP 与审计 JSON 自动整理的计数、失败编号及验证层级 |

`*.meta.json` 时间使用 Asia/Shanghai 并保留 `+08:00`。原始 TAP 可能含本机测试代码路径和合成标记；观察 JSON 不记录密码、Cookie、CSRF 原文或真实凭据。

## 复跑

在仓库根目录进入后端，安装时沿用锁文件：

```sh
cd backend
pnpm install --frozen-lockfile --registry=https://registry.npmjs.org
node --test test/security/day2-authz.test.js
```

当前五条失败分别为 **D2-03、D2-17、D2-18、D2-20、D2-22**，命令应返回非零退出码。修复前不得写成“22 条通过”，也不要用跳过或吞掉退出码得到成功状态。

可单独复现入口换发问题：

```sh
node --test --test-name-pattern='D2-22' test/security/day2-authz.test.js
```

若需生成新的观察文件，显式指定一个新的证据文件名，保留本轮原始输出：

```sh
DAY2_EVIDENCE_PATH=evidence/daily/security-20261024/observations-rerun.json \
  node --test --test-reporter=tap test/security/day2-authz.test.js
```

原有后端测试的精确文件清单在 `existing-tests.meta.json`。新增专项后直接执行 `pnpm test` 会把这些未修复问题计为失败；本轮实际结果采用原有测试与专项分组登记，不冒充一次全量通过。

## 验证层级

- 账号、会话、资料与记录请求：实际本地 HTTP、实际 AuthService / 仓储、内存 PGlite。
- DESKTOP 入口：在 PGlite 服务端会话夹具中设置，未执行原生桌面登录或微信接入。
- D2-17：在真实资料查询路径注入合成数据库异常，验证错误处理边界。
- D2-20：模型适配器替身只计数，不调用供应商。
- D2-21：VM 替身执行 preload，不是原生 Electron。
- 前端 6 条：fetch 替身；HTTPS Cookie 为生成函数检查，没有真实 HTTPS 浏览器执行。
- Node 为实际 `v25.9.0`，不是交接要求的 Node 24；正式 PostgreSQL、性能与备份恢复未验收。

维护者公告：[body-parser GHSA-27r3-jxmh-p828](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828)，本轮已核对受影响范围和修复版本；应用实际可利用性未另做攻击验证。
