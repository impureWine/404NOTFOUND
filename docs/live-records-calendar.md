# 陪伴记录与情绪日历真实服务接入

## 本地运行

保持 `prototype/`、`backend/`、`shared/`、`database-design/` 的相对位置。

1. 后端按 `.env.example` 配置开发 PostgreSQL 和独立的 `PROFILE_ENCRYPTION_KEY`。
2. 在 `backend/` 运行 `pnpm install --frozen-lockfile`，再运行 `node --env-file=.env src/db/migrate.js`，最后 `pnpm start`。
3. 新增 `005_optional_emotion_fields.sql` 迁移允许主动跳过情绪词和强度。不要修改已执行迁移的内容。
4. 前端 `.env` 设置 `VITE_API_MODE=real`、`VITE_CSRF_HEADER_NAME=X-CSRF-Token`、`API_PROXY_TARGET=http://127.0.0.1:3000`。
5. 在 `prototype/` 安装依赖后运行 `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`。
6. 访问 `http://127.0.0.1:5173`，注册登录后从首页的“陪伴记录”“情绪日历”或侧栏进入。直接入口为 `/#records`、`/#calendar`。

## 本次实现

- 保存已有陪伴对话：最多 20 条消息，保留 USER/ASSISTANT 角色；仍兼容旧版 title/body 保存请求。
- 真实历史分页、标题与详情解密回读；解密仅在服务端通过账号与入口校验后执行，不返回密文或加密密钥。
- 情绪日历按月查询、按日查看、主动新增、版本化编辑。允许不命名、跳过强度和不填写备注，不自动补情绪或分数。
- 新增 `PATCH /api/records/:id`，仅允许情绪记录编辑。创建和编辑均需与内容绑定的 SAVE 用途许可。
- 月份查询使用 `GET /api/records?kind=EMOTION&from=YYYY-MM-DD&to=YYYY-MM-DD`；两日期必须同时提供。分页游标绑定日期范围。
- 重试保持同一请求 ID；服务端幂等比较规范内容摘要，不比较随机加密密文。
- 日历不自动进入 AI 上下文；退出账户会卸载私密页面并清理当前界面状态。

## 边界与验收

本次接入新版 React 首页。独立 HTML 聊天、情绪命名卡和其他演示页面保持原有行为，不会把预设回复自动当作真实 AI 对话保存。陪伴记录表单用于用户主动整理已有对话，不调用模型。

日历每页读取 20 条记录及其详情，日期标记只表示已加载的记录；有更多数据时使用“加载更多”。不自动发送或保存输入草稿，也不使用浏览器持久存储保存私密正文。

已有清除接口保持不变，本页没有新增清除按钮。

验收：保存多角色对话后刷新回读；保存空情绪词和空强度的日历条目；切换月份；编辑并验证旧版本冲突；更换账号后不能读取前一账号数据；关闭后端应显示真实错误。

自动化验证使用隔离 PGlite，不能代替本机 PostgreSQL、真实浏览器端到端或生产部署验收。
