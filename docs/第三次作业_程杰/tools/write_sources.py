from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
ROOT.mkdir(parents=True, exist_ok=True)
for name in ('figures', 'sources', 'output', 'qa'):
    (ROOT / name).mkdir(exist_ok=True)

COMMIT = '8308f0735ae7c33a2055b486f10a620ec3560d31'
BASE = f'https://github.com/impureWine/404NOTFOUND/blob/{COMMIT}/'

docs = {}
docs['01_前端设计章节.md'] = r'''# 404烦恼未找到前端设计章节

版本 v1.0　编制日期 2026年10月20日　责任归口 T03 前端工程师

## 1 设计目标与范围

本设计供系统设计说明书整合和后续前端实现使用。前端采用 JavaScript ESM、JSX、React 和 Vite，首发 Web 完整业务流程；Electron 同步开展最小原生能力验证，微信按实际接入状态提供说明或跳转。持久数据由应用 API 写入服务端 PostgreSQL，浏览器不直连数据库或模型供应商。

本章覆盖六模块和 REQ01～REQ17 的界面责任、状态边界与资源释放。组件名、目录和内部控制器是本次前端设计方案；已有演示源码不是这些设计的运行验收证据。模型编排由程群负责，API 与认证由李泉毅负责，记录与检索数据由庄剀涵负责；前端负责呈现、交互控制、共享校验和接口接入。

当前范围保留已登录修改密码；密码找回或重置、烦恼漂流瓶、公开主页、账号注销和自动跨端同步不在本次范围内。头像使用预置资源，不提供任意文件上传。

## 2 页面与需求映射

| 页面组 | 页面编号 | 前端交互与验收重点 |
|---|---|---|
| 账号与个人中心 | P-A01～03，P-U01～03 | REQ16～17；注册后进入登录，改密后重新登录；资料、私密入口、偏好和异常状态完整 |
| 陪伴与命名 | P-C01，P-N01 | REQ01、09；明确倾听或梳理；选情绪不自动保存，查资料缺问题先澄清 |
| 记录与历史 | P-D01～02，P-H01 | REQ05、08；同日多条、编辑和清除确认；保存日历不触发模型 |
| 物件与房间 | P-O01～02 | REQ10；形状与正文分别选择保存，放旁边不调用 AI，移出房间不等于清除正文 |
| 排练 | P-R01～03 | REQ11；场景设置、模拟、暂停和重来，结束模拟后只选择本轮本人表达 |
| 寄存 | P-L01～02 | REQ12；寄存、状态、到期后主动取出、延期、清除；到期不展开正文 |
| 基础训练 | P-T01 | REQ02；呼吸、五感、暂停整理、任务拆分；未开始不计时，暂停不累计 |
| 查询 | P-S01 | REQ03；问题澄清、检索状态、事实与来源对应、无结果和失败区分、主动保存 |
| 敲击回弹 | P-V01～02 | REQ13；Web 画布、效果强度、静音与退出；原生全桌面效果另行验证 |
| 文字销毁 | P-Z01～02 | REQ14；独立本地输入、三种效果、跳过、清空；正文不进入账号和网络链路 |
| 弹珠机 | P-P01～02 | REQ15；布置构件、球材质、碰撞音乐、暂停、静音、重置与退出 |
| 通用入口与安全 | P-E01，P-M01，P-X01 | REQ04、06、07；模式切换、能力说明、入口隔离、授权及现实支持指引 |

页面编号是业务视图标识，不要求每个视图独立一个 HTML 文件。普通页面可采用 React 路由和对话框组织；文字销毁使用独立构建入口，避免挂入通用账号、聊天和遥测 Provider。

## 3 分层和依赖

页面层负责视图、表单、键盘操作及正常、空、加载、失败、权限不足等状态。功能模块在内部组合表单与展示组件，不在 JSX 事件中散落网络重试、Cookie 管理或音频释放逻辑。

状态层区分身份、业务会话、记录缓存、临时表单和设备偏好。异步任务协调器持有操作标识、会话标识和双代次，统一管理取消、轮询和迟到结果。模式控制器先验证目标能力和用户选择的携带范围，再停止旧活动并申请切换。

接口层收口同源 /api 请求，复用 shared/contracts 中的 Zod 输入与输出 Schema。该共享目录由李泉毅主责，前端协作；本交付不冒充已存在的 Schema 实现。前端不能提交可信 ownerId、entry 或任意 system/messages，也不保存原始会话凭据。

端侧层以 TrainingController、ImpactController、MarbleController 管理训练、画布、物理和音频。它们是对领域 TrainingRun、ImpactRun、MarbleRun 等对象的前端控制适配，不要求新增对应数据库表。ElectronBridge 只映射白名单窗口能力。

![图1 前端组件与数据边界](figures/F01_components.png)

## 4 建议目录

以下是后续实现的建议位置，不表示仓库已有这些文件。

```text
web/src/app/                 路由 能力入口 错误视图
web/src/features/           account companion records search rehearsal room
web/src/shared/ui/          表单 弹窗 来源卡片 状态视图
web/src/state/              identity session tasks recordCache
web/src/api/                client auth sessions consents tasks records profile
web/src/local/              training impact marble audio lifecycle
web/destroy/                独立 HTML React 根节点 销毁控制器 本地资源
desktop/main/               窗口生命周期 IPC 校验 可见工作区
desktop/preload/            白名单 petWindow 桥
shared/contracts/           由前后端共同引用的 Zod 契约
```

## 5 状态与缓存边界

| 状态类别 | 所持内容与寿命 | 清理规则 |
|---|---|---|
| 身份状态 | 游客或登录状态、CSRF token、可信入口、客户端身份代次；仅内存 | 登录、退出、改密、401及换账号时失效旧身份任务和缓存；不能读取 HttpOnly Cookie |
| 业务会话 | sessionId、activityId、mode、双代次、用户选择的当前消息；仅内存 | END、过期和身份变化后清空；服务重启后提示重新开始，不自动重发正文 |
| 任务状态 | requestId、任务状态、AbortController、轮询句柄和捕获的身份代次 | 完成或终止后停轮询；暂停、重来、切换及撤销后旧结果不可回填 |
| 已保存记录缓存 | 当前身份当前可信入口的详情和列表；仅内存 | 身份或入口变化全清；清除成功失效相关对象与选择引用；不写 Service Worker 或持久浏览器缓存 |
| 普通表单草稿 | 当前页面未提交字段；仅内存 | 普通保存失败可保留编辑；身份变化优先清除私密输入；游客内容需本人选择保留并在登录后重新提交 |
| 设备偏好 | 静音、音量、减少动态效果、桌宠显示等非正文配置 | 可单独本地保存；与账号偏好及 SAVE 授权分开，不夹带正文或账号记录 |
| 销毁视图 | 私有 buffer、DOM 与由原文生成的粒子或纹理 | 销毁、跳过、异常、离开和关闭一律清空；无账号标识、记录、恢复键或次数统计 |

缓存键由客户端身份代次、服务端可信入口与资源标识共同限定，不能仅用昵称或记录 ID。账号基础资料可按服务许可读取，不能据此读取另一入口业务记录。持久化内容和未保存临时内容的生命周期必须分别表达。

## 6 网络请求与身份变化

初始化读取 auth/context 和 capabilities。写请求携带会话绑定的 CSRF token；具体请求头名称在共享契约冻结时确认。登录或退出后重新获取认证上下文，不在 localStorage 保存 token。Cookie、密码和正文均不进入日志或跳转 URL。

AI 与检索使用“创建任务返回 202，再轮询结果”的契约。每任务每客户端最多一个在途轮询，间隔不小于1秒；达到完成、取消、失败或过期立即停止。前端收到结果后，除检查服务端会话与双代次外，还匹配客户端身份代次和当前请求，避免快速换账号时发生视图污染。

AbortController 只负责本地请求中止。前端同时调用服务端取消或会话动作接口，服务端接受后才能撤销结果读取。断网无法确认取消时，界面立即屏蔽旧结果并显示状态未确认，不声称供应商已停止。重试外部任务由用户发起，生成新 requestId，并重新核验授权；持久写入结果未知则用原 requestId 和相同载荷核实，不能直接断言未保存。

退出或改密开始时先锁住私密视图、停止本地活动并清除可见正文；响应确认后显示完成。断网退出只能提示“本机内容已隐藏，服务器退出尚未确认”，联网后继续撤销。浏览器后退或从页面缓存恢复时先校验身份，再展示私密视图。跨标签页如采用 BroadcastChannel，只广播失效事件，不传私密正文。

## 7 物件和排练设计

物件仅允许 TANGLE、STONE、NOTE。游客可创建临时外观，未保存的物件不调用持久房间接口。保存时用户选择是否包含 description；只保存外观时请求省略描述。房间以归一化 x/y 坐标表示位置，最多30件且 recordId 不重复。新房间 expectedVersion 为0；修改须匹配现版，409时重新读取并由用户决定，不自动覆盖。

梳理已保存物件须选择单个资源、携带 resourceId 与 resourceVersion 并取得 AI_PROCESS 许可；临时物件使用 objectDraft，两种来源不能并存。房间显示不授权模型读取其他物件。

排练明确标注 AI 模拟。暂停冻结推进并失效旧回复；重来建立新活动、清空上轮可选表达。FINISH_REHEARSAL 停止角色回复并进入 reviewing，保留本轮本人消息供选择；END 才清空业务会话。首版认可表达仅选本人当前轮消息，整理只传选中表达与必要场景，预览经用户确认后另行 SAVE。完整模拟对话不持久化。

## 8 训练动画和音频资源管理

每个活动登记自己的计时器、动画帧、事件监听、音频节点、物理对象和指针捕获。pause 停推进并停止在播声音；resume 仅由用户触发；stop 或 dispose 幂等释放全部资源。声音由用户操作解锁，静音立即 stopAll，不只是将后续事件音量设为0。

训练定义采用随包审阅的静态内容，固定步骤不逐步请求模型。训练隐藏页面或离开面板自动暂停，返回后不自动继续；暂停期间不累计 elapsedMs。Canvas 使用一致坐标和时间单位，限制帧间隔，避免后台恢复后大步跳跃；具体物理参数需实现测定。

弹珠机以选定预置音阶映射碰撞音高，提供声部上限和事件节流。初始限制为30构件、10球、8声部、同声部至少50毫秒间隔；敲击初始限制为100粒子、8声部。以上为待测配置，不代表已达到帧率或声音性能。

## 9 可用性与降级

所有主要操作提供可见焦点、明确文字和键盘替代。弹窗约束焦点并可取消，关闭后返回触发控件；Esc 对浮层和销毁流程执行对应的停止或清空。拖动房间和构件应提供选中后方向键移动等替代。不能只靠颜色表示错误、情绪或入口能力。

尊重 prefers-reduced-motion，提供简化或跳过动画；音频不可用时保留静音可视反馈。Web 敲击仅发生在本产品画布。Electron 能力未验证时标记未验证或模拟，不显示原生能力已可用。查询文本、用户输入和模型回复按纯文本安全呈现；来源链接校验协议并与摘要绑定，不直接插入外部 HTML。

## 10 实现与验收交接

实施顺序为共享契约和认证纵向链、常规业务页面、三类互动与桌宠集成、异常和安全复测。W2提前做 Electron 透明、置顶、拖动、穿透、缩放、多屏和退出验证，避免推迟至复杂互动完成后才发现平台限制。

本文的设计自查、图表和接口比对由交付工具核验；业务功能运行、性能与安全结果必须由实际实现和合成用例另行产生。章节、图源、接口目录和06号验收交接说明一并交给李泉毅整合，郭昱祺核对交互，关欣和曾俊涛复核专项。
'''

docs['02_组件关系与依赖说明.md'] = r'''# 前端组件关系与依赖说明

版本 v1.0　对应 T03　关联 REQ01～REQ17

## 1 组件总览

图1用实线表示调用或组合依赖。独立销毁入口位于普通业务树之外，图中不与 ApiClient、身份或通用聊天状态连接。图源 F01_components.dot 可编辑，SVG 可缩放，PNG 用于说明书插图。

![图1 前端组件与数据边界](figures/F01_components.png)

| 组件或模块 | 职责 | 允许依赖与边界 |
|---|---|---|
| AppShell 与 Router | 普通导航、入口能力提示、页面装配 | IdentityStore、CapabilityAdapter；路由切换只下达退出事件，不读取销毁正文 |
| 业务页面 | 表单与正常、空、加载、失败、权限视图 | 公共 UI、当前业务状态、ApiClient；不直连模型或数据库 |
| IdentityStore | 游客、登录、过期及客户端身份代次 | auth/context；不持有原始 Cookie 或密码 |
| BusinessSessionStore | 当前模式、活动、消息选择、双代次 | 会话接口和 TaskCoordinator；不自动读历史补上下文 |
| TaskCoordinator | 受理、轮询、取消、代次比较 | Agent 和 Search 适配器；不持久化正文 |
| RecordCache | 当前身份当前入口记录的内存缓存 | records、room、profile 适配器；清除后失效引用 |
| ModeController | 检查能力、确定携带范围、停止旧活动 | TaskCoordinator、ResourceScope、会话切换；失败不得显示成功 |
| ApiClient | 同源通信、CSRF、超时、错误和 Schema 校验 | shared/contracts；不暴露秘密，不做无限重试 |
| ResourceScope | 登记并释放活动资源 | 控制器提供的幂等清理函数；页面卸载也要触发 |
| 端侧控制器 | 训练、敲击和弹珠的运行状态 | 本地定义、物理和音频；没有逐步训练或碰撞上传接口 |
| ElectronBridge | 白名单窗口操作 | preload 桥；不暴露通用 execute、shell、文件读写 |
| TextDestructionView | 私有输入与销毁效果 | 本地效果资源和非正文动效偏好；不挂业务 Provider 或遥测 |

## 2 状态归属与模块通信

组件通过显式事件或参数传递所需数据，避免所有功能共用一份全局正文。跨模式携带 selectedContextIds 必须由用户选择，新的 AI 或 SEARCH 用途另行确认。事件总线若存在，只传活动停止、身份失效和能力变化等控制事件，不广播私密文本。

普通表单输入由功能模块拥有；网络响应由该模块通过协调器接收；记录详情进入当前范围内的内存缓存。销毁输入始终由独立组件私有，销毁图形只生成本地效果缓存。切换离开销毁页只执行 dispose，不提供“带入聊天”操作。

## 3 生命周期接口

| 接口 | 调用场景 | 行为约定 |
|---|---|---|
| start 或 configure | 用户明确开始训练或互动 | 校验状态与能力，建立本次 ResourceScope；音频仅用户手势解锁 |
| pause | 用户暂停、页面隐藏、面板收起 | 停定时推进、物理和音符，保存允许保留的非持久进度 |
| resume | 用户点击继续 | 恢复当前有效活动；不复活旧请求或补播旧声音 |
| reset 或 restart | 用户选择重来 | 清旧进度、球和选定表达；网络活动按服务返回更新代次 |
| stop | 退出、失去运行条件 | 停模拟、音频、计时、输入捕获和新任务 |
| dispose | 卸载、切换身份、窗口关闭 | 幂等释放监听、动画帧、节点、纹理和持有的私密引用 |

这些方法是设计接口，不以类名推断实现完成；实际代码可采用 hook、模块或类，但须保留同等的可观察行为和清理约束。

## 4 Electron 进程边界

![图2 Electron 窗口与进程边界](figures/F07_electron.png)

主进程管理 BrowserWindow、可见工作区、退出和 IPC 参数校验；preload 只提供 petWindow.move、setAlwaysOnTop、setClickThrough、close 和 getCapabilities。React 渲染进程负责宠物、快捷面板及任务呈现。开启 contextIsolation 与 sandbox，关闭 nodeIntegration，阻止任意导航。

窗口坐标为有限整数并限制可见工作区；跨屏和断屏后提供恢复位置。穿透启用前保留可达的恢复或退出入口。C03 验证工程只使用合成数据，实际 DESKTOP 认证和可信入口绑定另行设计；修改 entry 头不构成接入许可。

## 5 与既有 UML 的映射

前端控制器适配 UML 的 BusinessSession、PendingRequest、TrainingRun、ImpactRun、MarbleRun、AudioEngine、TextDestructionView 与 DesktopPet。ApiClient 是应用 HTTP 契约适配层，不替代服务端 AIClient、IdentityRepository 或 RecordRepository。RecordKind 统一为 CONVERSATION、EMOTION、WORRY_OBJECT、REHEARSAL_DRAFT、DEPOSIT、QUERY，不沿用其他缩写枚举。

UML 个别宽泛可选字段与09号严格 DTO 不一致时，前端请求按09号执行。例如物件 UI 可以不强迫用户填写文字，但 title 的请求规则为1～80码点，可为外观提供可编辑的默认名称；description 可省略。不能据 UML 的可选描述向接口发送不合法载荷。
'''

docs['03_关键状态与时序设计.md'] = r'''# 前端关键状态与时序设计

版本 v1.0　状态和动作沿用09号接口规范　图源与插图同版

## 1 通用页面状态

| 状态 | 进入条件 | 可见内容与允许操作 | 离开或清理动作 |
|---|---|---|---|
| idle | 尚未加载或开始 | 功能说明、输入和开始按钮 | 校验后加载；不自动推进 |
| loading | 当前有效请求已发出 | 进度提示；取消或安全返回 | 终态停轮询；切换失效本地请求 |
| ready | 数据有效且属于当前范围 | 当前页面数据和有效操作 | 修改或清除以当前 version 提交 |
| empty | 成功响应明确无记录或无来源 | 空状态及主动创建入口 | 不与错误混用 |
| error | 网络、服务或输出失败 | 实际错误、可恢复输入和手动重试 | 不自动循环调用模型 |
| blocked | 未登录、过期或权限不符 | 登录引导或安全提示，隐藏正文 | 失效旧身份任务、授权和缓存 |
| paused | 用户暂停或运行条件丢失 | 已暂停、继续或退出 | 停计时、音频和模拟；继续须用户操作 |
| ended | 用户结束或临时会话失效 | 已结束和重新开始 | 清临时正文、停止异步回填 |

## 2 训练与互动状态

![图3 训练与互动状态](figures/F02_local_states.png)

训练采用 ready、running、paused、completed、exited。敲击和弹珠采用同样的开始、暂停、继续及退出规则，但不虚构自动完成条件。训练达到规定时长或用户走完有效步骤后才能进入 completed。

| 触发 | 训练 | 敲击与弹珠 | 清理约束 |
|---|---|---|---|
| 开始 | 从0开始计时或步骤 | 建立画布或模拟循环 | 用户手势后才启用声音 |
| 暂停或隐藏 | elapsedMs 冻结 | 停物理步进和新效果 | 停止在播声音，释放不必要捕获 |
| 继续 | 从保留进度继续 | 恢复本轮有效状态 | 不补计后台时间，不补播声音 |
| 重置 | 回到开始前 | 清球和运行痕迹，保留或重置布局须界面说明 | 清旧动画和节点；首版布局仅临时 |
| 静音 | 进度不变 | 模拟可继续 | 立即停止现有声音，后续不发声 |
| 退出或卸载 | 清本轮进度 | 清运行实例 | 清计时器、帧、监听、捕获和音频 |

## 3 外部任务与迟到结果

任务状态为 pending、running、completed、cancelled、failed、expired。取消是任务状态；TIMEOUT 是 failed 下的 failureReason，不新增同名通用 HTTP 错误码。

![图4 外部任务暂停与取消时序](figures/F03_task_sequence.png)

发送前捕获客户端 identityEpoch、可信 entry、sessionId、activityId、双代次和 requestId。创建任务返回202后，以每次完成再间隔至少1秒的方式轮询，始终最多一个在途轮询。只有当前有效身份和活动下匹配的 completed 才可展示。

用户点击暂停时，前端立即关掉旧结果展示通道并停轮询，再发送 PAUSE；响应成功后采用服务端新代次。已知任务可并行申请 cancel，但服务端动作和代次校验才是撤销依据。断网时界面保持“暂停请求未确认”，旧结果继续被屏蔽。服务返回仍在计算不表示前端可恢复旧回复。

RESTART、切换模式、FINISH_REHEARSAL、撤销授权和退出同样先失效本地接收资格。RESUME 不重放旧请求。模型供应商未能中止时，服务仍须拒绝旧任务正文读取；前端忽略结果不能替代服务端保护。

## 4 排练状态

![图5 排练与认可表达状态](figures/F04_rehearsal.png)

| 当前状态与操作 | 服务动作 | 前端行为 |
|---|---|---|
| ready 点击开始 | 创建 REHEARSE 会话，取得许可后生成 | 校验 simulation 的场景、对方、目标和风格 |
| running 点击暂停 | PAUSE | 不再展示角色回复，失效旧请求 |
| paused 点击继续 | RESUME | 不重放原任务；新输入另取许可 |
| running 或 paused 点击重来 | RESTART | 新活动代次，清上轮可选表达和旧许可 |
| running 或 paused 结束模拟 | FINISH_REHEARSAL | 进入 reviewing，停止角色，保留本轮本人消息 |
| reviewing 选表达并整理 | REHEARSAL_SUMMARIZE | 只提交本轮本人 recognizedMessageIds，展示可编辑预览 |
| reviewing 或预览主动保存 | SAVE 许可与 records 创建 | 保存 REHEARSAL_DRAFT，未认可 AI 内容不自动加入 |
| 任一有效活动结束 | END | 清会话正文、选择、任务、临时授权和预览 |

模拟对方的回复不代表现实人物反应。结束模拟与结束会话是两个操作，不能用 END 代替 FINISH_REHEARSAL 后再尝试读取已清空消息。

## 5 主动保存与清除

![图6 主动保存与清除时序](figures/F06_record_sequence.png)

普通保存过程为编辑、展示保存范围、获取 SAVE 许可、提交同一载荷、以成功返回更新记录视图。许可绑定实际操作与版本；用户改了载荷须重新确认。提交期间防重复点击，使用同 requestId 对同载荷核实结果。服务超时不能直接显示“未保存”。

清除过程先按当前版本获取 clear-confirmations，再让用户核对范围。取消不发 clear；确认才提交 confirmationId、expectedVersion 和 confirmed:true。清除确认初始2分钟有效，版本变化或过期须重新确认。成功后清缓存、关联与上下文选择；409时重新读取并让用户重新决定。首版没有全库一键清除接口，批量清除不能被当作既有能力。

## 6 文字销毁状态

![图7 文字销毁与清理状态](figures/F05_destroy.png)

EMPTY 输入后进入 EDITING，点击有效效果进入 ANIMATING，完成后进入 CLEARED，再次输入回到 EDITING。跳过、效果异常、切页和关闭都直接执行 clearOwnedContent；不为动画失败保留原文。

clearOwnedContent 清空由页面持有的 buffer、输入 DOM、拆字节点、纹理、粒子文本、指针轨迹和闭包引用，取消动画帧并释放监听。不存在通用业务会话、HTTP、模型、搜索、持久化、自动恢复或含正文的错误上报路径。这里只约束产品控制的数据通路，不承诺操作系统或输入法的绝对无痕。

## 7 断网退出与会话恢复

身份退出开始即遮蔽私密视图、停止本地活动、递增 identityEpoch，丢弃旧响应并清缓存。服务返回204后确认退出并重新获取匿名上下文。网络故障则保留锁定态，提示服务器撤销未确认；不能只删除前端状态就宣称凭证失效。

业务会话初始无活动30分钟或绝对2小时失效；登录会话初始空闲30分钟或绝对7天过期，由服务端判定。收到401、临时任务 expired 或重启导致不存在时，停止正文读取并提示重新开始，绝不自动恢复重发原文。

09号要求409后核对实际状态，但没有独立 GET 业务会话状态端点。本设计不发明此接口：在未冻结补充契约前，409后保持安全暂停，读取已有响应中的实际状态；无法核实时引导用户新建会话且不自动携带正文。补充的查询方式由李泉毅与程群确认。
'''

docs['04_多入口能力与Electron验证.md'] = r'''# 多入口能力矩阵与桌宠验证方案

版本 v1.0　对应 REQ06 和 C03　目标平台先验证 Windows

## 1 能力标记

AVAILABLE 表示当前可信入口已实现并验证该能力，SIMULATED 表示模拟，UNAVAILABLE 表示不可用。前端从 GET /api/capabilities 读取实际状态；本材料的“目标”用于设计和排期，不能直接当作该接口真实返回。仓库当前是演示原型，真实后端、模型、数据库及原生桌宠运行未验收。

| 功能 | Web 设计目标 | Electron 设计目标 | 微信入口边界 |
|---|---|---|---|
| 账号与资料 | 完整页面和本人私密中心 | 可信 DESKTOP 认证完成后接入；验证工程用合成数据 | 仅在确认接入方式后提供授权页；聊天中不收密码、不按昵称绑定 |
| 陪伴和命名 | 页面及临时任务 | 快捷面板或主动打开完整页 | 可按实际权限适配文本；未接入保持模拟或不可用 |
| 查询与排练 | 完整状态、来源和表达选择 | 简化入口及完整页 | 文本适配或跳转；不默认传聊天正文 |
| 日历和记录 | 本人当前入口的列表与编辑 | 面板或完整页，仍执行入口隔离 | 简化入口或跳转，不能自动读另一入口记录 |
| 房间与寄存 | 物件画布和包裹状态 | 房间、外观和抱包裹状态；不自动展示正文 | 可跳转，不默认原生图形能力 |
| 固定训练 | 本地引导、暂停和退出 | 轻量面板，收起或隐藏自动暂停 | 可适配短文本步骤，按实际可用能力展示 |
| 敲击回弹 | 只在产品画布区域 | 经 C03 验证后才开放原生浮层 | 不承诺聊天窗口内全桌面效果 |
| 文字销毁 | 独立本地打包页面 | 独立端侧视图 | 只提供无正文的入口；不得先在微信消息输入正文 |
| 弹珠机 | 本地互动画布和用户启用音频 | 打开画布或面板 | 跳转或说明，不宣称原生聊天玩法 |
| 记录隔离 | 账号与 WEB 范围 | 账号与 DESKTOP 范围 | 账号与 WECHAT 范围，接入前不可自报启用 |

同账号不代表默认共享业务数据。桌宠打开 Web 时说明即将进入 WEB 范围，默认只携带白名单页面键，不带正文、账号凭据或私密记录 ID。独立销毁页面的链接也不能带待销毁正文。

## 2 当前证据与发布条件

| 入口 | 仓库可核对证据 | 本轮运行结论 | 开放前条件 |
|---|---|---|---|
| Web | HTML 页面与 React 演示源码 | 本次未重跑；不能称真实 API 已联调 | 同源 API、身份和17项对应流程的实际验证 |
| 桌宠 | 浏览器内角色、气泡和拖动演示 | 原生窗口能力未验证 | C03 实测、IPC审查、独立可信身份方案及相应业务回归 |
| 微信 | 规划说明和模拟入口 | 没有真实授权或收发证据 | 明确实际接入形式、权限和跳转范围后再实施 |

## 3 Electron 最小验证工程

W2先建立独立验证工程，复用宠物 React 界面、固定本地资源和合成数据。主进程负责窗口，preload 只暴露白名单桥，渲染层无 Node 集成；contextIsolation 和 sandbox 开启，禁止任意导航、通用 shell 或文件访问。正式 DESKTOP 登录接入与凭据绑定另列契约，不靠修改请求头。

每条能力记录支持、受限或失败，并记录系统与 Electron 版本、窗口参数、屏幕尺寸、DPI、操作步骤、预期、实际、截图或日志位置、执行人和复核人。未执行的行保持“未执行”，不能填写通过或估计帧率。

| 编号 | 验证操作 | 可观察通过条件 | 失败处理 |
|---|---|---|---|
| E01 | 透明窗口与普通应用叠放，切换全屏场景 | 透明区域显示正确，记录全屏和系统窗口的实际限制 | 保留普通窗口或 Web 演示并标明受限 |
| E02 | 开关置顶，打开关闭其他窗口 | 行为与设定一致，不伪称覆盖系统保护界面 | 关闭该能力并说明限制 |
| E03 | 拖宠物、点按钮、触摸气泡边界 | 按钮不误拖，窗口不离开可见工作区 | 提供恢复位置入口 |
| E04 | 切换穿透并操作背后应用 | 非交互时不拦截，恢复或退出入口始终可达 | 禁用穿透或退出浮层 |
| E05 | 分别测100%、125%、150%缩放 | 点击命中、尺寸和气泡位置正确，偏移实测记录 | 使用明确的受限配置 |
| E06 | 跨屏移动，断开副屏，再重开 | 窗口可找回，不在已消失屏幕永久隐藏 | 重置至主屏可见工作区 |
| E07 | Esc、显式退出、关闭窗口、崩溃重开 | 释放声音、帧和捕获；重开不自动恢复私密正文 | 阻止发布相关互动能力 |
| E08 | 非白名单 IPC、错误参数和任意导航 | 主进程拒绝调用，未暴露通用执行或文件能力 | 修复后复测，不开放入口 |
| E09 | 模拟 DESKTOP 或伪造 entry 请求 | 后端不能据客户端自报值授予其他入口数据 | 保持业务入口不可用 |

曾俊涛记录环境与证据，关欣审查 preload 和 IPC，郭昱祺复核操作，程杰负责验证工程。若核心桌宠能力失败，由张王昊记录范围变更并同步说明书和PPT，不静默降低产品承诺。

## 4 性能验证设计

下列均为待执行方法。初始资源上限用于限制开销，数值不是性能结果或已经通过的硬件承诺。

| 对象 | 实验条件 | 指标与停止检查 |
|---|---|---|
| 敲击 | 三种预置效果，静音与有声；逐步达到100粒子、8声部初始上限 | 帧间隔分布、CPU、内存、点击响应；超限丢弃效果；退出后新效果为零 |
| 弹珠 | 5、15、30构件与1、5、10球组合；8声部及至少50毫秒同声部间隔 | 帧间隔、物理稳定性、合法音高、峰值音量；暂停后无模拟推进和新音符 |
| 销毁 | 空输入、普通文本、含emoji且达4000码点；完成、跳过、异常、直接关闭 | 渲染耗时与资源；正文合成标记不出现在网络、存储、日志和重开状态 |
| 生命周期 | 多次开始、暂停、切页、重置和退出；后台恢复；设备音频不可用 | 活动资源登记恢复到基线，无残留定时器、监听、帧与音频；记录实际数值 |

建议记录一轮预热后至少三次同条件运行，标明硬件、供电模式、浏览器与分辨率，并报告帧间隔而非只给平均帧率。具体帧率目标和低配设备降级阈值须由样机结果确定；实现可先减粒子和球数、简化动画，保留隐私和停止语义。
'''

docs['06_需求追踪与验收交接.md'] = r'''# 前端需求追踪与验收交接

版本 v1.0　2026年10月20日　对应仓库 T03 与 C01 C03

## 1 交付与整合方式

01号章节可合入系统设计说明书前端部分；02号及figures用于组件设计；03号用于状态和时序；04号用于多入口与桌面能力；05号用于前后端契约核对。本目录与源图一起放入目标仓库 docs/第三次作业_程杰/ 即可交接，整合时保留相对图片路径。

任务归口为 T03，仓库登记责任人程杰 082402202。本人须核对内容、署名与提交信息，并按团队规则以本人身份提交 commit 和 push；工具生成材料不构成已提交、已合并、成员已签认或真实贡献结算证据。当前工作目录不是该 GitHub 仓库的 Git 检出，因此本次只生成本地交付包，不伪造提交哈希。

## 2 需求与设计证据

| 需求 | 前端责任 | 设计位置 | 后续验收观察点 |
|---|---|---|---|
| REQ01 | 陪伴输入与结果呈现 | 01第2、6节，03第3节，05任务接口 | 只倾听不强制训练；拒绝外发不创建模型任务 |
| REQ02 | 四类固定训练与控制 | 01第8节，03第2节 | 未开始不推进、暂停冻结、退出无新事件 |
| REQ03 | 问题、检索状态与来源 | 01第2节，05检索接口 | 每条事实对应来源；EMPTY与failed分开 |
| REQ04 | 模式切换和携带范围 | 01第3、6节，03第3节 | 无选择不迁移，切换失败不显示成功 |
| REQ05 | 主动保存、历史、清除 | 03第5节，05记录接口 | 未保存不落历史，取消清除不改变内容 |
| REQ06 | 入口能力与桌宠 | 02第4节，04全章 | 入口隔离、模拟标记及原生窗口实测 |
| REQ07 | 身份、授权与安全呈现 | 01第5、6、9节，05错误映射 | 拒绝越权、正文不进日志、求助不称自动救援 |
| REQ08 | 日期记录及编辑 | 01第2、5节，05记录载荷 | 同日多条，用户日历日正确，无模型调用 |
| REQ09 | 命名和任务分流 | 01第2节，05端侧接口 | 未选需要不路由，选词不自动新增记录 |
| REQ10 | 物件、房间和选定梳理 | 01第7节，05房间接口 | 放旁边零AI，外观与正文分离，版本冲突不覆盖 |
| REQ11 | 排练和认可表达 | 01第7节，03第4节 | 暂停无新角色回复，重来不混轮，仅认可表达入稿 |
| REQ12 | 寄存、取出与延期 | 01第2节，05寄存接口 | 到期不展开正文、不催促、不调用模型 |
| REQ13 | 敲击画布和浮层适配 | 03第2节，04第3、4节 | 静音停止在播声音，退出不拦截其他应用 |
| REQ14 | 独立销毁与清理 | 01第5节，03第6节，04第4节 | 完成、跳过、异常与关闭均无产品内留存 |
| REQ15 | 音画物理联动 | 01第8节，03第2节，04第4节 | 音高在集合内、暂停停物理与声音、退出释放 |
| REQ16 | 注册登录改密及退出 | 01第6节，03第7节，05认证接口 | 旧凭据失效，换账号无旧正文与迟到结果 |
| REQ17 | 本人主页与偏好 | 01第2、5节，05资料接口 | 资料取消不改变，失败不假空，无销毁统计 |

## 3 运行验收用例设计

本表是可执行的验收设计，实际执行结果均待实现后填写。数据一律为合成输入，不使用真实密码或私密内容。

| 编号 | 操作 | 预期证据 | 执行状态 |
|---|---|---|---|
| FE01 | 注册密码11、12、128、129码点，含emoji；用户名标准化 | 前后端同一Schema边界结果，不回显密码 | 未执行 |
| FE02 | 正文3999、4000、4001码点及上下文边界 | 前端提示与服务拒绝一致，超限零模型调用 | 未执行 |
| FE03 | 请求中暂停、重来、换模式，模拟供应商迟到 | 双代次和本地身份代次一致，旧结果无读取或回填 | 未执行 |
| FE04 | A账号请求未完成即退出并登录B，后退与恢复缓存页 | A的视图、缓存、选择与异步正文均不出现 | 未执行 |
| FE05 | 保存超时后用同requestId重试；版本变化后再清除 | 无重复记录，无误报失败，无旧确认覆盖新版本 | 未执行 |
| FE06 | 日历只记录；情绪词只选择；物件放旁边 | 对应操作零AI调用，未选择不新增持久记录 | 未执行 |
| FE07 | 排练结束模拟后选本人消息；提交跨轮或AI消息ID | reviewing可选择，非法认可被拒，整轮对话不持久化 | 未执行 |
| FE08 | 寄存到期、提前取出、延期冲突和取消删除 | 到期不展开，提前取出409，失败保持真实版本 | 未执行 |
| FE09 | 销毁唯一标记，分别完成、跳过、报错、切页与关闭 | 网络、存储、日志和重开状态无标记；AI搜索次数零 | 未执行 |
| FE10 | 训练、敲击和弹珠反复暂停、静音、重置、退出 | 停止后无新帧或音频事件，资源回到基线 | 未执行 |
| FE11 | 列表503、查询EMPTY、failed、429、401与404 | 失败与空状态不同；限速可理解且无无限重试 | 未执行 |
| FE12 | 运行E01～E09桌面验证和性能组合 | 环境、原始证据、实际限制、复核人齐备 | 未执行 |

## 4 契约核对与待专业复核事项

| 编号 | 已采用的处理 | 需协作复核的内容与责任 |
|---|---|---|
| R01 | 09号为HTTP细节依据；不使用目录中未定义的422 | 李泉毅同步接口目录错误表，确认CSRF头名称 |
| R02 | 409后安全暂停，不自动覆盖或重发正文 | 李泉毅和程群明确业务会话实际状态读取方式；现无独立GET会话状态端点 |
| R03 | 物件description可省略，title用可编辑默认名称满足非空DTO | 郭昱祺与李泉毅确认外观体验默认名称及UML可选字段映射 |
| R04 | 性能上限为待测初值，不填写帧率结论 | 程杰和曾俊涛实测后确定球、粒子、单位与低配阈值 |
| R05 | 微信和DESKTOP真实认证未接入前不标AVAILABLE | 张王昊确认接入范围，李泉毅与关欣复核可信入口方案 |
| R06 | 无批量清除或恢复接口，不把演示全清按钮直接接正式服务 | 张王昊与李泉毅确认是否新增契约；现按单条确认清除 |

这些事项不阻止本次设计初稿交付；涉及真实接口冻结与发布时由专业负责人形成确认记录。表内不虚构已经讨论或同意的结论。

## 5 交接记录

交付任务：T03 前端、端侧互动与多入口设计，含 C01 前端共享契约协作和 C03 验证方案。版本为v1.0，生成日期为2026年10月20日。设计来源固定至仓库提交8308f0735ae7c33a2055b486f10a620ec3560d31。

本次完成正文、组件图、关键状态与时序图、入口矩阵、完整前端接口清单、需求追踪、运行验收方案与交接说明。静态自查的机器结果见 qa/design-check.json；它不代表FE01～FE12或AT-01～AT-17已经运行通过。

交叉复核分工：李泉毅核对接口和说明书，程群核对任务、双代次及排练，郭昱祺核对页面与入口操作，庄剀涵核对记录载荷、时区与版本，关欣审查销毁与IPC，曾俊涛复核可执行验收方法。当前复核人签认、本人commit、远程push和课程提交证据均未发生，须据实际完成后补录。

## 6 答辩说明素材

前端采用React和Vite，把页面、状态、API适配与端侧互动分开。普通业务通过同源应用API处理身份、授权和记录，任务用会话与活动双代次避免暂停或重来后回填旧回复。文字销毁有独立入口与私有内存，不进入聊天、存储或外部模型。训练、音频和物理统一定义暂停、重置与退出清理。Web先完成业务流程，Electron提前验证原生窗口能力，微信按实际接入状态标记。以上是设计方案，实际支持和性能以实现后的证据为准。
'''

for name, content in docs.items():
    (ROOT / name).write_text(content.strip() + '\n', encoding='utf-8')

api = []
def endpoint(id, group, method, path, page, request, response, behavior, auth='登录或有效匿名上下文'):
    api.append(dict(id=id, group=group, method=method, path=path, page=page, request=request, response=response, behavior=behavior, auth=auth))

endpoint('A01','认证与个人中心','GET','/api/auth/context','应用初始化与身份变化','无body','200 authenticated、csrfToken、expiresAt可选','创建或读取上下文，no-store；不返回Cookie原始凭据。')
endpoint('A02','认证与个人中心','POST','/api/auth/register','P-A02 注册','requestId、loginName、password、confirmPassword','201 accountId','注册成功进入登录，不自动登录；用户名冲突409。')
endpoint('A03','认证与个人中心','POST','/api/auth/login','P-A01 登录','loginName、password、target固定页面键','200 profile、target、expiresAt；Set-Cookie','成功后轮换上下文并重取CSRF；清旧匿名任务；用户选定草稿另行确认保存。')
endpoint('A04','认证与个人中心','POST','/api/auth/logout','退出与账号切换','无body，必须CSRF','204无正文','先隐藏私密视图；服务撤销成功后确认退出；断网显示撤销未确认。','当前会话上下文')
endpoint('A05','认证与个人中心','POST','/api/auth/change-password','P-A03 改密','currentPassword、newPassword、confirmPassword','204无正文','验证旧密码；成功后所有旧登录会话失效并重新登录。','有效登录')
endpoint('A06','认证与个人中心','GET','/api/profile','P-U01 我的','无body','200 nickname、avatarKey、bio、version','仅本人资料；加载失败不显示默认资料冒充成功。','有效登录')
endpoint('A07','认证与个人中心','PATCH','/api/profile','P-U02 资料编辑','requestId、expectedVersion、nickname、avatarKey、bio','200 新资料和version','头像仅预置key；取消不提交，409重新核对后再编辑。','有效登录')
endpoint('A08','认证与个人中心','GET','/api/profile/summary','P-U01 内容入口','无body','200 counts，六种RecordKind','只显示本人当前入口计数，不含正文、情绪分数或销毁次数；503不假全零。','有效登录')
endpoint('A09','认证与个人中心','GET','/api/preferences','P-U03 偏好','无body','200 offerHistorySave、version','仅是否提示保存的账号偏好，不是保存授权。','有效登录')
endpoint('A10','认证与个人中心','PATCH','/api/preferences','P-U03 偏好','requestId、expectedVersion、offerHistorySave','200 新偏好','不隐式启用保存、分析或跨端共享；设备声音偏好独立。','有效登录')
endpoint('S01','会话与用途授权','POST','/api/sessions','陪伴、排练、查询','requestId、mode','201 sessionId、activityId、sessionGeneration=0、activityGeneration=0、mode、state=ready','mode限定LISTEN、ORGANIZE、REHEARSE、SEARCH；ID由服务分配。')
endpoint('S02','会话与用途授权','POST','/api/sessions/:id/switch','P-M01 切模式','requestId、targetMode、expectedSessionGeneration、selectedContextIds','200 新activityId及双代次','先校验目标能力，按用户选择复制；复制不等于AI或搜索许可。')
endpoint('S03','会话与用途授权','POST','/api/sessions/:id/actions','暂停、继续、重来和结束','requestId、action、expectedSessionGeneration、expectedActivityGeneration','200 当前state和双代次','action为PAUSE、RESUME、RESTART、FINISH_REHEARSAL、END；本地训练不逐步调用。')
endpoint('S04','会话与用途授权','POST','/api/consents','外发或保存确认','requestId、purpose、operation、payload；按用途含sessionId、activityId和双代次','201 consentId、purpose、expiresAt','purpose为AI_PROCESS、SEARCH_PROCESS、SAVE；绑定同载荷、身份、入口及版本，初始5分钟。SAVE要求登录。')
endpoint('S05','会话与用途授权','POST','/api/consents/:id/revoke','撤销许可','requestId','200 revoked','取消相关在途任务；不隐式清除已保存记录。')
endpoint('T01','AI与检索任务','POST','/api/agent/tasks','陪伴、物件梳理、排练','requestId、sessionId、activityId、双代次、mode、operation、selectedText、selectedContextIds、consentId；按操作补资源或simulation','202 requestId、status=pending、会话与双代次','仅LISTEN、ORGANIZE、REHEARSE；operation及附加字段详见下方。')
endpoint('T02','AI与检索任务','GET','/api/agent/tasks/:requestId','任务轮询','无body','200 status；completed含result及服务端消息ID','每任务至少1秒且最多1个在途轮询；终态即停；迟到、失效代次或身份不符不显示。')
endpoint('T03','AI与检索任务','POST','/api/agent/tasks/:requestId/cancel','取消AI任务','requestId为本次取消操作ID','200 目标status=cancelled','路径ID是目标任务，body是新取消操作ID；不混用。取消后服务不再返回正文。')
endpoint('T04','AI与检索任务','POST','/api/search/tasks','P-S01 查询','requestId、sessionId、activityId、双代次、question、selectedContextIds、consentId；模型整理另需aiConsentId','202 任务状态与关联标识','使用SEARCH业务会话和SEARCH_PROCESS；不把SEARCH塞入agent三种mode。')
endpoint('T05','AI与检索任务','GET','/api/search/tasks/:requestId','检索轮询与结果','无body','200 status；completed含searchState、claims、sources、hasConflict、partial','EMPTY是无资料；failed是执行失败；来源不明、过期、冲突明确呈现。')
endpoint('T06','AI与检索任务','POST','/api/search/tasks/:requestId/cancel','取消检索','requestId为本次取消操作ID','200 目标status=cancelled','与AI相同的取消和迟到保护；取消不应被外部任务创建额度阻断。')
endpoint('R01','记录与房间','POST','/api/records','主动保存六类记录','requestId、kind、payload、consentId','201 Record','有效登录和SAVE；同操作同requestId同载荷幂等。','有效登录')
endpoint('R02','记录与房间','GET','/api/records','历史、日历、物件、寄存等列表','query含kind、cursor、limit及类别过滤','200 items、nextCursor','列表不返回全文；日历可用from/to，跨度最多366天，同日可多条；不把正文放URL。','有效登录')
endpoint('R03','记录与房间','GET','/api/records/:id','记录详情','无body','200 Record','本人当前入口；寄存未主动取出前详情不含body；404不区分不存在和越权。','有效登录')
endpoint('R04','记录与房间','PATCH','/api/records/:id','可编辑记录','requestId、expectedVersion、payload、consentId','200 新Record','不能改kind、owner或entry；CONVERSATION、QUERY只读，DEPOSIT首版拒绝PATCH。','有效登录')
endpoint('R05','记录与房间','POST','/api/records/:id/clear-confirmations','清除前确认','requestId、expectedVersion','201 confirmationId、expiresAt、recordId、version、kind','初始2分钟有效；只发确认不清除，界面展示对象和范围。','有效登录')
endpoint('R06','记录与房间','POST','/api/records/:id/clear','确认清除','requestId、expectedVersion、confirmationId、confirmed=true','200 cleared、recordId','取消不发请求；成功使缓存、关联和上下文选择失效。','有效登录')
endpoint('R07','记录与房间','GET','/api/room','P-O02 房间','无body','200 id、version、objects数组','无房间返回id=null、version=0及空objects；失败不能假空；游客只用临时房间。','有效登录')
endpoint('R08','记录与房间','PUT','/api/room','保存房间布局','requestId、expectedVersion、objects[{recordId,shape,x,y}]','200 新房间与版本','最多30件，ID不重复且为本入口已保存物件；x/y为0～1；创建版本0；移出仅取消关联。','有效登录')
endpoint('D01','寄存与入口能力','POST','/api/deposits/:id/retrieve','P-L02 主动取出','requestId、expectedVersion','200 id、state=RETRIEVED、version、body','仅到期后主动操作；未到期409，不因到期自动请求取出。','有效登录')
endpoint('D02','寄存与入口能力','POST','/api/deposits/:id/postpone','P-L02 延期','requestId、expectedVersion、reopenAt','200 id、state=STORED、version、reopenAt','新时间为未来时刻，冲突不覆盖；寄存正文首版不开放直接编辑。','有效登录')
endpoint('D03','寄存与入口能力','GET','/api/capabilities','应用与入口初始化','无body，不接受自报entry授权','200 entry、features[{reqId,status,reason?,fallback?}]','状态AVAILABLE、SIMULATED、UNAVAILABLE；实际入口由可信接入和会话绑定决定。')

(ROOT/'sources'/'api-catalog.json').write_text(json.dumps(api, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

intro = r'''# 前端接口使用清单

版本 v1.0　唯一详细业务依据为09号全功能接口与限制规范

## 1 全局调用约定

本清单列出32个唯一的HTTP方法与路径。日历筛选复用GET /api/records，是额外使用场景而不是新增端点；原接口目录将该过滤示例另列，故显示33项。接口尚待实现和联调，本包不构成调用通过证据。

前端同源访问 /api，JSON最大128 KiB。前后端复用严格Zod输入输出Schema，拒绝未知字段，业务归属仍由服务核查。所有写操作校验会话CSRF与Origin；CSRF请求头名称待共享契约冻结。不得提交可信ownerId或entry，不读取原始HttpOnly Cookie。

成功为 {data,meta:{requestId}}，204无正文；错误为 {error:{code,message,fields?,retryAfterSeconds?},meta:{requestId}}。私密及临时任务响应no-store，前端缓存只在内存，API不进入Service Worker离线缓存。仅观测脱敏ID、状态和耗时，不记录正文、密码或Cookie。

表内“有效匿名上下文”也需要通过auth/context建立，不能理解成无任何会话限制。创建、保存和业务动作按接口显式携带requestId；登录、退出和改密不擅自添加09号未定义字段。

## 2 字段与输入限制

| 字段 | 采用规则 | 前端行为 |
|---|---|---|
| loginName | NFKC后3～64 ASCII字母、数字或下划线；统一小写索引 | 昵称不能代替登录名；与共享Schema一致 |
| 新密码 | 12～128 Unicode码点，不trim或规范化 | 注册和改密执行；登录只校验非空与上限 |
| nickname、bio、title | 1～32、0～200、1～80码点 | 可trim，纯文本；预置头像key |
| 正文与selectedText | 每字段最多4000码点 | 用Array.from(text).length计数，避免把UTF16长度当码点数 |
| 上下文 | 最多20个不重复消息ID；展开总文本最多12000码点 | 包含场景和物件等展开正文，不自动裁掉认可表达 |
| emotionWords、intensity | 1～5个不重复词，每词1～20码点；强度整数1～5 | 是用户记录标尺，不当成健康评分 |
| date、instant | 真实YYYY-MM-DD；带偏移ISO8601时刻 | 日历按用户本地日期，instant存储交服务；使用允许的IANA时区 |
| 分页和版本 | limit默认20最大50；opaque cursor；expectedVersion正整数 | 不跨过滤范围复用游标；房间创建版本0为明确例外 |

## 3 接口目录
'''
parts = [intro]
group = None
for item in api:
    if item['group'] != group:
        group = item['group']
        parts.append(f"\n### {group}\n")
    parts.append(f"\n#### {item['id']} {item['page']}\n\n`{item['method']} {item['path']}`\n\n鉴权：{item['auth']}。输入：{item['request']}。\n\n响应：{item['response']}。前端处理：{item['behavior']}\n")
parts.append(r'''
## 4 操作附加字段和记录载荷

Agent 的 operation 为 REPLY、OBJECT_ORGANIZE、REHEARSAL_REPLY、REHEARSAL_SUMMARIZE。普通REPLY仅LISTEN或ORGANIZE；OBJECT_ORGANIZE仅ORGANIZE，已保存来源加resourceId/resourceVersion，临时来源用objectDraft，二者互斥。REHEARSE必须给simulation中的scene、counterpart、goal、style；整理额外给本轮本人recognizedMessageIds，1～20个。

| kind | 创建或可编辑payload | 展示与编辑边界 |
|---|---|---|
| CONVERSATION | title、sessionId、selectedMessageIds | 当前活动1～20条消息，展开总正文不超过12000码点；保存快照只读 |
| EMOTION | date、emotionWords、intensity、event、timeZone | event可空，同日多条；列表可含情绪和强度，不含event正文 |
| WORRY_OBJECT | shape、title、description可选 | shape为TANGLE、STONE、NOTE；外观保存省略description |
| REHEARSAL_DRAFT | scene、sessionId、activityId、recognizedMessageIds、expressions | expressions为1～20条非空文本，总计最多12000码点；仅认可表达 |
| DEPOSIT | title、body、reopenAt | body非空，未来时刻；列表无正文；首版不支持通用PATCH |
| QUERY | searchRequestId | 只引用本入口已完成且有来源的SUCCESS查询；服务端复制证据，客户端不提交自造claims |

Record返回id、kind、title、payload、createdAt、updatedAt、version。QUERY持久状态按CONFLICTED、PARTIAL_SUCCESS、STALE_SOURCE、SUCCESS的优先级确定，不把临时SearchState=SUCCESS/EMPTY直接用于持久状态。取出后的DEPOSIT保持RETRIEVED，不随时钟自动变回AVAILABLE。

## 5 前端错误处理

| HTTP与业务码 | 页面动作 | 禁止行为 |
|---|---|---|
| 400或413 INVALID_INPUT | 定位字段、修改后重试；不回显敏感载荷 | 用过时长度限制或继续调用模型 |
| 401 AUTH_REQUIRED | 停私密请求、遮蔽正文、清旧缓存并引导登录 | 把正文放returnTo或继续展示前一账号 |
| 403 ACCESS_DENIED | 显示用途或权限提示；必要时重取上下文 | 无条件重新授权或循环重试 |
| 404 NOT_FOUND | 显示内容不可用，移除无效选择引用 | 区分他人对象确实存在 |
| 409 CONFLICT或INVALID_STATE | 核对实际版本或活动；重新读取、由用户决定 | 自动覆盖新版本、复活旧请求或提前显示成功 |
| 429 RATE_LIMITED | 按Retry-After和安全提示显示可重试时间 | 无限轮询或自动重复外部任务创建 |
| 503 SERVICE_UNAVAILABLE | 保留允许保留的编辑态，显示服务暂不可用 | 显示为空历史、空检索或全零统计 |

接口目录摘要中的422在09号没有定义，本包不新增该错误；后端若需采用，先更新唯一契约并同步共享Schema。任务取消和超时读取正常任务状态；failureReason只允许TIMEOUT、PROVIDER_UNAVAILABLE、OUTPUT_INVALID等已定义值，不展示供应商原始异常。

普通API初始总时限5秒，外部任务含排队总时限30秒。前端超时不等于服务未提交，持久写入用相同requestId核实；外部任务失败的人工重试使用新requestId并重新校验许可和额度。默认不叠加SDK自动重试。

## 6 非HTTP端侧契约

| 对象 | 接口 | 返回或边界 |
|---|---|---|
| TrainingController | start、pause、resume、stop、reset | state、stepIndex、elapsedMs；静态training-definitions内容，不逐步联网 |
| NamingCard | select({emotionWords,need}) | targetMode、emotionWords、requiresQuestion；need未选不路由 |
| ModeController | switchTo(target,{selectedContextIds}) | 校验能力、用户选择和停止旧活动；切离销毁直接清空 |
| ImpactController | start、hit、pause、resume、reset、stop | effect预置，strength/volume为0～1，坐标在画布；无敲击HTTP接口 |
| TextDestructionView | setBuffer、destroy、clear、dispose | 最多4000码点，SHRED/BURN/BLACK_HOLE；无HTTP、账号、仓储、模型或遥测依赖 |
| MarbleController | configure、release、pause、resume、reset、stop、setMuted | 30构件、10球、8声部和50ms初始待测限制；布局仅临时 |
| petWindow | move、setAlwaysOnTop、setClickThrough、close、getCapabilities | preload白名单，主进程验来源与参数；不暴露通用invoke或文件能力 |

## 7 接口冻结检查

前后端共同复核输入输出Schema、CSRF头名、错误映射、任务取消、409状态核对、寄存版本变化与列表裁剪。共享Schema应在浏览器和服务端实际import后再记录通过；本包只提供契约使用清单，不替代C01实现、C02登录会话实现或C03原生能力实测。
''')
(ROOT/'05_前端接口使用清单.md').write_text('\n'.join(parts).strip()+'\n',encoding='utf-8')

references = [
 ('需求范围 v0.3','docs/需求范围_v0.3.md'),
 ('当前任务分工 T03及第9节','docs/当前任务分工.md'),
 ('团队协作规则','docs/团队协作规则.md'),
 ('03号技术基线','docs/第三次作业_张王昊/03_技术决策与Agent接入基线.md'),
 ('09号全功能接口与限制规范','docs/第三次作业_张王昊/09_全功能接口与限制规范.md'),
 ('10号三项工程任务交接','docs/第三次作业_张王昊/10_三项工程任务与验收交接.md'),
 ('完整设计类图 V1.2','docs/第三次作业_李泉毅/02_完整设计类图_V1.2.md'),
 ('后端接口目录','docs/第三次作业_李泉毅/04_接口目录.md'),
 ('逐周开发计划','docs/第三次作业_张王昊/04_工作流程与逐周开发计划.md'),
]
(ROOT/'sources'/'依据与版本.md').write_text('# 前端设计依据与版本\n\n核对日期：2026年10月20日。远程main核对结果与本地阅读快照均为提交`'+COMMIT+'`。\n\n业务范围按v0.3，技术按03号，HTTP细节按09号。原型和旧说明书仅作流程或历史参考。\n\n'+'\n'.join(f'- [{title}]({BASE}{path})' for title,path in references)+'\n',encoding='utf-8')

manifest = dict(version='1.0',date='2026-10-20',task='T03',sourceCommit=COMMIT,
    scope='本次设计交付包，不含业务实现、运行验收或远程提交',
    requirements=[f'REQ{i:02d}' for i in range(1,18)],
    documents=['01_前端设计章节.md','02_组件关系与依赖说明.md','03_关键状态与时序设计.md','04_多入口能力与Electron验证.md','05_前端接口使用清单.md','06_需求追踪与验收交接.md'],
    uniqueHttpEndpointCount=len(api), runtimeValidation='未执行', peerReview='待专业负责人复核', gitSubmission='未提交')
(ROOT/'sources'/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

readme = '''# 404烦恼未找到前端设计交付包

本包完成T03的五项设计交付，附17项需求追踪、验收方案和交接说明。责任归口为仓库前端工程师任务，版本v1.0，日期2026年10月20日。

2026年10月21日提交交接：由程杰授权将本包提交至个人分支 `chengjie/t03-frontend-design`。正文、PDF及 `sources/manifest.json` 保留10月20日编制时的状态快照，其中“未提交”等表述属于该快照；当前提交与推送状态以本仓库的 Git 记录为准。材料仍为待交叉复核的设计初稿，未标记已验收。

## 阅读入口

- [合并评审稿 PDF](output/404烦恼未找到_前端设计交付包_v1.0.pdf)
- [01 前端设计章节](01_前端设计章节.md)
- [02 组件关系与依赖说明](02_组件关系与依赖说明.md)
- [03 关键状态与时序设计](03_关键状态与时序设计.md)
- [04 多入口能力与Electron验证](04_多入口能力与Electron验证.md)
- [05 前端接口使用清单](05_前端接口使用清单.md)
- [06 需求追踪与验收交接](06_需求追踪与验收交接.md)
- [依据与版本](sources/依据与版本.md)

figures保留可编辑DOT或Mermaid图源、可缩放SVG和说明书用PNG。sources保留32个唯一HTTP端点的结构化目录和交付清单。qa/design-check.json记录实际执行的静态检查，运行用例仍为未执行。

## 交接方法

本目录为仓库中的 `docs/第三次作业_程杰/`，包含可编辑正文、图源、导出PDF、结构化清单和生成工具。01号供李泉毅合并系统设计说明书，其余材料用于接口、交互、安全和验收复核。没有修改其他成员的文件。

内部初稿节点为10月21日18:00，课程正式截止以团队核验通知为准。成员复核、合并、运行验收与课程提交须分别登记，不以个人分支提交替代。

## 状态与格式

设计内容已编制；实现、真实接口联调、原生桌宠和性能验证均未执行。专业复核事项集中在06号，不把演示或建议描述为生产系统。

本机没有可用的Word文档渲染器，交付采用可编辑Markdown及经过渲染检查的PDF，未输出无法验证排版的Word文件。正文和图源可直接用于团队Word整合。

## 复现生成

tools/write_sources.py写出正文和结构化清单，tools/render_diagrams.cjs生成图，tools/build_pdf.py生成合并PDF，tools/check_package.py检查覆盖与链接。脚本使用Codex打包运行时，不要求后续业务工程采用这些文档工具。工具路径可通过CODEX_DEPENDENCIES变量指定。
'''
(ROOT/'README.md').write_text(readme,encoding='utf-8')
print(json.dumps({'documents':len(docs)+1,'uniqueHttpEndpoints':len(api),'root':str(ROOT)},ensure_ascii=False))
