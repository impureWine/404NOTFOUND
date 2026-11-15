# Beta Day3｜记录接口、公开 DTO 与清除契约

负责人：李泉毅  
日期：2026-11-16

## 本日交付

- 明确记录列表与详情公开 DTO，客户端只接收解密后的本人可读字段，不接收密文、密钥版本或归属字段。
- 明确两步清除响应：第一步签发限时确认，第二步返回清除结果与删除任务标识。
- 保留现有保存幂等规则：同一 `requestId` 与相同业务载荷返回原记录；同一 `requestId` 改变载荷返回 `409 CONFLICT`。
- 记录列表、详情、清除和重放继续按账号与入口隔离。

## 验收入口

- `backend/test/unit/public-record-contracts.test.js`
- `backend/test/integration/record-api.test.js`
- `backend/test/integration/record-repository.test.js`

## 边界

自动化测试使用隔离 PGlite；不代表正式 PostgreSQL、浏览器页面或部署环境已经验收。
