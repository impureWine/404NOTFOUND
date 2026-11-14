负责人：曾俊涛；协作：李泉毅；独立复核：关欣。
优先级 P1，Day1—2。
候选 d2073489a8be92c38e1f57da7562e487058c501a。
Windows / Node v24.22.2，backend 下执行 node --test test/integration，退出码1，MODULE_NOT_FOUND，未执行实际集成用例。backend/package.json 的 test:integration 仍使用目录参数。
验收：显式枚举 .test.js 文件或使用兼容入口，在 Windows/Node>=22 环境执行真实集成用例并记录数量；禁止把入口失败算成业务断言失败。
初估2人时，待确认。
