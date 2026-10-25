# 组件展示页与程杰前端界面对齐

本目录记录当日第一次视觉对齐。随后新增命名卡、训练操作及超时状态的最终交付见 [Day3 页面组件与交互走查](../Day3_20261025/README.md)；后者提供当前六场景的截图与验证结果。

日期：2026-10-25。依据本地仓库 `230293d` 中程杰当前 React 首页和认证弹窗，修订截图所示的独立组件展示入口。此前 10 月 24 日截图保留作历史版本；当前界面以本目录截图为准。

## 对齐结果

- 导航、顶栏、首页欢迎卡与八个工具入口抽取到 `prototype/src/components/SiteChrome.jsx`，项目首页和组件展示页共同使用。
- 展示页直接导入 `prototype/src/current-home.css`，统一 248px 左侧栏、64px 桌面顶栏、404 标志、导航顺序、背景、按钮、圆角和字体。补充组件样式限定在 `.ux-showcase`，不改写首页主题。
- 登录展示采用当前认证弹窗的白色卡片、图标、标题、输入与按钮样式，以首页内容作为遮罩背景。为方便切换状态，遮罩限定在展示区域，顶部展示工具始终可用；这是预览画布，不是第二套真实认证入口。
- 首页使用相同欢迎卡与工具网格，最近记录区保留正常／加载／空／失败四种示例。聊天及来源区域统一表面、字号和按钮样式，保留快照恢复、结束确认与引用定位。
- 展示工具收进主内容区，保留四场景、四状态及仅含场景键和状态键的复现链接。其他工具与注册入口跳转现有 `.html` 原型；相应页面仍为演示。

## 运行与截图

在 `prototype` 目录运行 `npm run dev -- --host 127.0.0.1 --port 5184 --strictPort`，打开：

- [登录展示](http://127.0.0.1:5184/ux-components.html?page=login&state=normal)
- [首页展示](http://127.0.0.1:5184/ux-components.html?page=home&state=normal)
- [程杰现有项目首页](http://127.0.0.1:5184/)

以上本地链接需要开发服务运行。`npm run build` 同时输出两个入口。

| 场景 | 正常 | 加载 | 空 | 失败 | 390px 窄屏 |
| --- | --- | --- | --- | --- | --- |
| 登录 | [LG-N](screenshots/LG-N_login_1440.png) | [LG-L](screenshots/LG-L_login_1440.png) | [LG-E](screenshots/LG-E_login_1440.png) | [LG-F](screenshots/LG-F_login_1440.png) | [正常态](screenshots/LG-N_login_390.png) |
| 首页 | [HP-N](screenshots/HP-N_home_1440.png) | [HP-L](screenshots/HP-L_home_1440.png) | [HP-E](screenshots/HP-E_home_1440.png) | [HP-F](screenshots/HP-F_home_1440.png) | [正常态](screenshots/HP-N_home_390.png) |
| 聊天 | [CH-N](screenshots/CH-N_chat_1440.png) | [CH-L](screenshots/CH-L_chat_1440.png) | [CH-E](screenshots/CH-E_chat_1440.png) | [CH-F](screenshots/CH-F_chat_1440.png) | [正常态](screenshots/CH-N_chat_390.png) |
| 来源 | [SR-N](screenshots/SR-N_sources_1440.png) | [SR-L](screenshots/SR-L_sources_1440.png) | [SR-E](screenshots/SR-E_sources_1440.png) | [SR-F](screenshots/SR-F_sources_1440.png) | [正常态](screenshots/SR-N_sources_390.png) |

参考画面：[现有项目首页](screenshots/reference-home_1440.png)、[现有认证弹窗](screenshots/reference-login_1440.png)。截图未经拼接或合成。图片均为视口截图，长内容需要滚动；窄屏登录画面中提交按钮位于首屏下方。

## 验证范围

- `npm run build`：两个入口构建成功。
- `npm test`：现有 6 项 API 适配器测试通过。
- Edge 无头浏览器检查四场景 × 四状态 × 1440／390／320px，共 48 组显示；场景编号和状态选择正确，无页面横向溢出。
- 对照两入口的计算样式，侧栏、标志、顶栏、首页主按钮和工具卡的尺寸、字号、颜色及圆角一致。
- 操作检查：登录字段错误与聚焦、密码显隐及提交后清空；聊天失败快照取回与结束确认；来源定位展开与聚焦；首页重试；桌面与窄屏导航；原首页登录／注册弹窗打开和关闭。

浏览器结果、22 张截图的 URL、视口、文件大小与 SHA-256 见[验证与截图清单](验证与截图清单.json)。本次未执行真实认证、模型、查询或保存接口联调，也不代表非作者验收完成。
