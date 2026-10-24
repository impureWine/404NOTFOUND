# Electron 桌宠样机

这是 Day 2 的最小桌面窗口验证样机，独立于 React 页面和真实业务服务。它只加载本地 `renderer.html`，不请求远程页面，不读取账号 Cookie，也不实现真实桌宠业务。

## 能力范围

- 无边框、透明、置顶窗口。
- 标题栏可拖动；按钮区域标记为不可拖动。
- 隐藏和显式退出；主进程退出时释放窗口和快捷键。
- 点击穿透由主进程控制，状态只通过受限 preload API 传递。
- `Alt+Shift+P` 是恢复交互的紧急快捷键。
- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`；拒绝窗口打开、页面跳转和权限请求。

## 启动

在已安装 Electron 依赖的环境中，从 `prototype/` 执行：

```powershell
npx --no-install electron electron/main.cjs
```

当前工作区已登记 Electron npm 包，但本次环境未完成 Electron 二进制下载（运行时 `fetch failed`），因此本样机源码已完成，桌面窗口运行尚未执行。补齐二进制后再按上面的命令记录实际系统、Electron 版本、窗口行为和失败原因。
