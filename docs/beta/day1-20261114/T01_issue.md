负责人：曾俊涛；协作：李泉毅；独立复核：关欣。
优先级 P1，Day1—2。
候选 d2073489a8be92c38e1f57da7562e487058c501a。
Windows / Node v22.23.1，backend 下执行原 `node --test test/integration`，退出码1，MODULE_NOT_FOUND，未执行实际集成用例。已把 package script 修订为 `node --test "test/integration/*.test.js"`。
验收结果：Windows/Node 22下51项通过、0失败。待非作者复核并关闭#112；禁止把旧入口失败算成业务断言失败。
初估2人时，待确认。
