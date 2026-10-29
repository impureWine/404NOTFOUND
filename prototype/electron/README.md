# Electron 真实业务入口

启动真实工作台并保留透明置顶宠物窗口、拖动、隐藏、点击穿透和恢复快捷键 Alt+Shift+P。宠物按钮可打开工作台与全屏发泄浮层，浮层按 Esc 退出。

从 prototype 运行 `npm run electron:dev`。默认 DESKTOP_APP_URL=http://127.0.0.1:5174，必须先启动该地址的真实前后端。建议独立后端使用 APP_ENTRY_POINT=DESKTOP、PORT=3001、APP_ORIGIN=http://127.0.0.1:5174，前端 API_PROXY_TARGET 指向 http://127.0.0.1:3001。

完整命令见 [运行指南](../../docs/真实服务接入与运行.md)。需要安装 Electron 二进制；源码语法检查不代表已完成目标电脑的窗口与浮层验收。

渲染进程禁用 Node、启用隔离与 sandbox；工作台使用独立会话分区，仅允许当前配置的应用来源导航，拒绝任意新窗口和权限请求。密钥保留在后端，不传入桌宠渲染器。
