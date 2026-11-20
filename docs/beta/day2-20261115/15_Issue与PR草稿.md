# Issue与PR草稿

## Issue标题

`[Beta Day2][B01] 统一授权、入口隔离与任务生命周期`

## Issue描述

### 目标

完成2026-11-15 Beta Day2的B01：统一任务创建、读取、取消、结束、撤回、换号和失效会话规则，并在同一候选上提供后端、数据、前端与非作者复测证据。

### 范围

- 失效会话写请求返回401；有效会话错误CSRF仍为403。
- 账号与可信入口共同限制任务、记录和用途许可。
- END、RESTART、取消、换号后旧结果不能读取、保存或迟到回填。
- 注册重试使用独立服务端HMAC幂等键。
- 私密API返回401后，前端清理身份和CSRF并提示重新登录。
- 修正Windows集成测试入口，避免PGlite并发OOM掩盖业务结果。

### 验收条件

- [ ] 正常授权路径成功。
- [ ] 跨账号/入口读取、取消和保存被拒绝且无副作用。
- [ ] 失效Cookie写入为401；错误CSRF为403。
- [ ] 用途许可不能跨用途、载荷或入口复用。
- [ ] 取消、结束、重来、换号后的迟到结果不回填。
- [ ] 页面出现可操作的重新登录提示。
- [ ] 后端、前端、浏览器证据指向同一候选SHA。

### 边界

真实Electron入口、正式PostgreSQL、HTTPS和真实模型供应商取消能力另行验收，不因本Issue自动化通过而视为生产发布完成。

## PR标题

`fix(beta): close Day2 authorization and lifecycle gaps`

## PR描述

### Summary

- Integrates the Day2 backend authorization, data-scope and PM triage branches on the latest main.
- Returns `401 AUTH_REQUIRED` for stale authenticated writes while preserving anonymous/effective-session CSRF behavior.
- Binds consent and query persistence to account, trusted entry, task state and session/activity generations.
- Adds registration idempotency with a separate server-side HMAC key.
- Clears frontend identity/CSRF and offers re-login after private API 401 responses.
- Keeps the Windows integration command explicit and serial to avoid PGlite OOM.
- Integrates the UX interaction specification and its earlier synthetic walkthrough, closing the expired-session gap while carrying five unverified differences forward explicitly.

### Verification

- Day2 focused backend: 43/43
- Backend full suite: 177/177
- Backend integration command: 61/61
- Frontend: 47/47
- Vite build: passed, 1599 modules
- API skeleton: 8/8
- Edge page flow: account switch, manual cancel, delayed replies and expired-session recovery passed
- Earlier UX synthetic walkthrough: 10 cases, 4 passed and 6 differences; expired-session recovery was subsequently fixed and rechecked, while 5 differences remain open

### Boundaries

The integrated browser runs use either an isolated PGlite database with a deferred synthetic model or fully intercepted synthetic API responses. Real PostgreSQL, Electron entry switching, HTTPS deployment, real-provider cancellation and the five carried UX differences remain follow-up verification items.

Closes #123. Refs #104, #124.
