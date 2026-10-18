# 404烦恼未找到——数据库设计说明书（庄剀涵初稿）

**版本**：v0.1（2026-10-18）  
**主责**：庄剀涵（102400435，搜索 / 数据工程）  
**文档状态**：设计初稿，未宣称已部署或已执行测试  
**关联课程要求**：[团队第三次作业——概要设计与数据库设计](https://bbs.csdn.net/topics/620554714)

## 0. 阅读说明与范围冻结

### 0.1 本文回答的问题

本文为数据库设计说明书源稿，覆盖概念模型、逻辑模型、物理设计、访问规则、数据生命周期、备份恢复、信息检索契约和验收准备。它服务于课程要求中的“ER 分析 + 表结构设计、接口设计”，不等同于已经开发完成的数据库。

### 0.2 指令与历史材料的冲突处理

本次八人分工文档是当前任务的执行约束；此前的 `404烦恼未找到_项目功能总览与新增需求_v0.3.md` 是需求来源，不能覆盖本次明确的范围约束。两者存在以下差异：

| 事项 | 本次分工文档的约束 | v0.3 历史材料 | 本文处理 |
|---|---|---|---|
| 需求编号 | REQ01～REQ17 | 曾写成 REQ01～REQ18 | 以 REQ01～REQ17 为本次交付基线；REQ18 个人主页若继续保留，按 `user_profile` 私密资料纳入，不增加公开主页需求 |
| 模块数量 | 六个模块 | 曾写成七个模块 | 以六模块为验收口径；账号与资料合并到“账号与个人中心” |
| 密码找回/重置 | 不重新加入 | v0.3 曾列入登录子功能 | 不建找回凭据、重置令牌或恢复渠道表 |
| 烦恼漂流瓶 | 不重新加入 | v0.3 曾列入 REQ13 | 不建投递/公开内容表 |
| 公开主页/账号注销 | 不重新加入 | v0.3 曾列入目标 | 仅保留私密资料；不建公开视图和注销流程 |
| 自动跨端同步 | 禁止 | v0.3 仅允许明确授权 | 默认隔离，跨端仅由 `consent_record` 显式授权 |

如团队在评审后重新冻结 v0.3 的 18 项范围，应新增版本记录和迁移评估，不直接把未确认功能写入本版结论。

### 0.3 未决技术决策

| 决策项 | 本文设计基线 | 状态/确认人 | 影响 |
|---|---|---|---|
| 关系数据库 | PostgreSQL 16 兼容语法 | 待李泉毅、张王昊确认 | 决定 `uuid`、`timestamptz`、`jsonb` 和索引语法 |
| 数据库位置 | 生产目标为受控云关系数据库（华为云 RDS 或等价服务）；开发使用隔离实例 | 待团队确认 | 决定网络边界、密钥和备份策略；不能把仓库当数据库 |
| 敏感正文 | 应用层加密后以 `bytea` 保存；密钥放密钥管理服务，不入仓库/数据库 | 待关欣、李泉毅确认 | 影响字段长度、轮换与删除传播 |
| 检索索引 | 首版只保存用户主动保存的查询摘要及来源；全文/向量索引为后续可选组件 | 待团队确认 | 文字销毁和默认临时会话不进入索引 |
| 时区 | 存储 UTC `timestamptz`；展示时使用用户明确设置的 IANA 时区，默认 `Asia/Shanghai` 仅为展示基线 | 待团队确认 | 影响日历日期、寄存到期和审计时间 |

本文其余章节按上述基线展开，所有“已设计”均表示可审查的设计结论，不表示运行环境已存在。

## 1. 设计目标与原则

1. **默认临时**：陪伴、训练、排练、互动和文字销毁的运行态只在端侧或服务内存中存在，未主动保存不写业务持久表。
2. **主动保存分域**：会话、情绪记录、物件、认可表达、寄存和已保存查询分别保存，授权一类不推导另一类。
3. **账号 + 入口隔离**：所有可回看的业务对象同时绑定 `owner_user_id` 和 `entry_point_id`；跨端访问必须有用途明确、可撤回的授权。
4. **最小化检索**：检索适配器只接收规范化问题及必要约束；原始会话正文不自动进入搜索、模型、日志或分析。
5. **可追踪删除**：清除不仅删除主行，还跟踪缓存、搜索索引、派生摘要和备份延迟；部分失败可重试。
6. **不可伪造状态**：保存、删除、查询空结果/超时/冲突和寄存到期均有独立状态，不以空列表或成功提示掩盖失败。
7. **文字销毁零持久化**：REQ15 的正文不建表、不建接口存储字段、不进入数据库备份、检索索引、日志和遥测。

## 2. 范围、数据分类与模块映射

### 2.1 六模块与数据库对象

| 模块 | 需求 | 主要数据对象 | 持久化边界 |
|---|---|---|---|
| 账号与个人中心 | REQ17（登录/退出/私密资料） | `user_account`、`user_profile`、`auth_session`、`entry_point` | 凭据只存哈希；资料仅本人可见；不含找回/公开主页 |
| 陪伴与沟通 | REQ01、REQ09、REQ11 | `conversation`（仅主动保存）、`accepted_expression` | 普通聊天/排练默认临时；只保存用户认可的表达 |
| 记录与整理 | REQ08、REQ10、REQ12 | `emotion_record`、`worry_object`、`stored_concern` | 分别授权；物件可只保存外观；寄存到期只变状态 |
| 压力缓解 | REQ02、REQ14、REQ15、REQ16 | 无持久业务正文；可选最小 `interaction_audit` 元数据 | 运行态端侧；REQ15 正文禁止任何持久化 |
| 信息支持 | REQ03 | `saved_query`、`source`、`claim`、`evidence` | 查询结果/来源仅在用户主动保存时持久化；临时结果不落库 |
| 基础与多端 | REQ04～REQ07 | `consent_record`、`retention_policy`、`deletion_job`、`audit_event` | 模式状态临时；权限、留存和删除元数据持久化 |

### 2.2 数据分类

| 分类 | 示例 | 默认状态 | 允许存储位置 | 敏感级别 |
|---|---|---|---|---|
| D0 临时端侧 | 文字销毁正文、浮层输入、弹珠运行态 | 关闭/退出即清理 | 端侧内存 | 高 |
| D1 临时服务态 | 陪伴/训练/排练未保存上下文、检索中间结果 | 请求结束或超时清理 | 服务内存 | 高 |
| D2 主动保存正文 | 用户保存的会话、寄存正文、认可表达 | 用户选择后保存 | 加密业务表 | 高 |
| D3 结构化记录 | 情绪词、强度、物件外观、状态、日期 | 用户点击保存后保存 | 业务表 | 中高 |
| D4 检索证据 | 来源元数据、主张、证据关系 | 仅随保存查询保存 | 证据表 | 中 |
| D5 安全元数据 | 会话撤销、授权、删除作业、最小审计 | 按策略保留 | 安全/治理表 | 中高 |

## 3. 概念模型（ER 分析）

### 3.1 实体与关系

- `UserAccount` 1:1 `UserProfile`；1:N `AuthSession`、`ConsentRecord`、业务对象。
- `EntryPoint` 1:N `AuthSession` 和业务对象。业务对象的 `(owner_user_id, entry_point_id)` 是隔离边界，不允许只凭前端传入的用户 ID 查询。
- `Conversation` 1:N `AcceptedExpression`；普通消息正文不作为独立持久表，只有用户主动保存的会话才有加密正文。
- `EmotionRecord`、`WorryObject`、`StoredConcern`、`SavedQuery` 均属于一个账号和一个入口；`StoredConcern` 的到期状态由 `reopen_at` 与当前 UTC 时间计算/更新。
- `SavedQuery` 1:N `Claim`；`Claim` N:M `Source` 通过 `Evidence` 关联。一个来源可支撑多个主张，也可被多个保存查询引用。
- `UserAccount` 1:N `DeletionJob`；`DeletionJob` 1:N `DeletionTarget`，用于跨主存储、缓存、索引、派生文件和备份副本追踪。
- `ConsentRecord` 记录跨入口或外发用途，不等于保存许可；保存操作另由业务服务显式确认。

### 3.2 ER 图

可编辑源文件：[`diagrams/404NOTFOUND_database_er.mmd`](diagrams/404NOTFOUND_database_er.mmd)。图中只展示持久化实体；`TemporaryDestructionState`、普通聊天消息和检索中间结果明确不入图。

![数据库 ER 图](diagrams/404NOTFOUND_database_er.svg)

## 4. 逻辑模型与数据字典

### 4.1 命名约定

- 表名和字段名使用 `snake_case`；主键统一 `id uuid`；外键以 `_id` 结尾。
- 所有时间字段使用 `timestamptz` 保存 UTC；业务日期（如情绪日历）使用 `date`，由用户时区解释。
- 正文不使用明文 `text` 字段；需保存的正文使用应用层加密后的 `bytea`，并记录 `cipher_key_version`。
- 软删除只用于需要恢复/传播清除的业务对象；对外读取必须过滤 `deleted_at is null`。安全删除完成后再按保留策略物理清除。

### 4.2 核心表数据字典

字段完整约束以 [`sql/404notfound_postgresql.sql`](sql/404notfound_postgresql.sql) 为准。下表是答辩可读版，`PK`/`FK`/`UQ` 分别表示主键/外键/唯一约束。

#### 身份、入口与授权

| 表 | 字段（类型） | 可空/默认 | 约束与索引 | 用途/敏感等级 |
|---|---|---|---|---|
| `user_account` | `id uuid` | 否/uuid | PK | 账号主体；中 |
|  | `login_identifier varchar(160)` | 否/无 | UQ（规范化后）；普通索引 | 登录标识；高 |
|  | `password_hash varchar(255)` | 否/无 | 禁止明文密码；不进入日志 | 认证凭据哈希；高 |
|  | `status account_status` | 否/ACTIVE | CHECK | 账号生命周期；中 |
|  | `created_at/updated_at timestamptz` | 否/now() | 审计索引 | 变更时间；低 |
| `user_profile` | `id uuid`、`user_id uuid` | 否/uuid | PK、FK、UQ(user_id) | 私密资料；中 |
|  | `nickname varchar(64)` | 否/无 | 长度 CHECK | 个人昵称，不用于身份判断；中 |
|  | `avatar_ref varchar(512)`、`bio_ciphertext bytea` | 是/null | 不公开；正文加密 | 资料引用/简介；中高 |
| `entry_point` | `id uuid`、`code varchar(32)` | 否 | PK、UQ(code) | WEB/DESKTOP/WECHAT_SIMULATED 等入口；低 |
|  | `capability_state jsonb` | 否/'{}' | 仅能力元数据 | 入口能力声明，不表示已接入；低 |
| `auth_session` | `id uuid`、`user_id`、`entry_point_id` | 否 | PK、FK；(user,entry) 索引 | 登录会话；高 |
|  | `token_hash bytea`、`expires_at`、`revoked_at` | 否/无；是/null | token 只存哈希；过期/撤销索引 | 会话控制；高 |
| `consent_record` | `id`、`user_id`、`source_entry_point_id`、`target_entry_point_id` | 否 | PK、FK | 跨入口授权；高 |
|  | `purpose consent_purpose`、`scope jsonb`、`granted_at`、`expires_at`、`revoked_at` | 否/无；是/null | scope 非空；有效期 CHECK | 授权用途/范围；高 |

#### 用户主动保存的业务对象

| 表 | 字段（类型） | 可空/默认 | 约束与索引 | 用途/敏感等级 |
|---|---|---|---|---|
| `conversation` | `id`、`owner_user_id`、`entry_point_id` | 否 | PK、FK | 仅主动保存的会话壳；高 |
|  | `mode conversation_mode`、`content_ciphertext bytea` | 否/无 | 模式 CHECK；正文加密 | 保存范围由服务层确认；高 |
|  | `version_no int`、`deleted_at` | 否/1；是/null | UQ(id,version_no)；删除索引 | 乐观并发/删除传播；中 |
| `emotion_record` | `id`、`owner_user_id`、`entry_point_id`、`record_date date` | 否 | PK、FK；(owner,entry,date) 索引 | 日历记录；中高 |
|  | `emotion_code varchar(32)`、`intensity smallint`、`event_ciphertext bytea` | 否；是/null | intensity 1..5；正文加密 | 只记不分析；中高 |
| `worry_object` | `id`、`owner_user_id`、`entry_point_id` | 否 | PK、FK | 物件外观/标题；中高 |
|  | `shape_code varchar(32)`、`title_ciphertext bytea`、`body_ciphertext bytea` | 否；是/null | 未授权正文保持 NULL | 可只存外观；高 |
| `accepted_expression` | `id`、`conversation_id`、`owner_user_id`、`entry_point_id` | 否 | FK；owner/entry 冗余校验 | 排练中用户认可的表达；高 |
|  | `expression_ciphertext bytea`、`version_no` | 否 | 加密、乐观锁 | 不保存未认可 AI 回复；高 |
| `stored_concern` | `id`、`owner_user_id`、`entry_point_id` | 否 | PK、FK；到期索引 | 寄存对象；高 |
|  | `title_ciphertext bytea`、`body_ciphertext bytea`、`reopen_at`、`status` | 否 | 状态 CHECK；到期不自动展开 | 到期只变为可取出；高 |
| `saved_query` | `id`、`owner_user_id`、`entry_point_id` | 否 | PK、FK | 主动保存的检索结果；中高 |
|  | `raw_query_ciphertext bytea`、`normalized_query_ciphertext bytea`、`status`、`uncertainty_note` | 否/无；是/null | 状态 CHECK；不保存整段会话 | 保留原意与不确定性；高 |
| `source` | `id uuid`、`canonical_url varchar(2048)` | 否 | PK、UQ(canonical_url) | 去重后的来源元数据；中 |
|  | `title`、`publisher`、`source_tier`、`published_at`、`retrieved_at`、`verification_state` | 依来源可空 | source_tier/verification CHECK | 来源证据链；中 |
| `claim` | `id`、`saved_query_id`、`claim_text_ciphertext bytea`、`status` | 否 | FK；状态 CHECK | 主张及支持状态；中高 |
| `evidence` | `claim_id`、`source_id`、`relation` | 否 | PK(claim,source)；索引 | 主张—来源关系；中 |

#### 治理、删除与审计

| 表 | 字段（类型） | 可空/默认 | 约束与索引 | 用途/敏感等级 |
|---|---|---|---|---|
| `retention_policy` | `id`、`data_class`、`retention_days`、`backup_grace_days` | 否 | UQ(data_class)；非负 CHECK | 保留与备份延迟；中 |
| `deletion_job` | `id`、`owner_user_id`、`requested_at`、`status` | 否 | PK；状态索引 | 删除传播总任务；高 |
| `deletion_target` | `id`、`deletion_job_id`、`target_kind`、`target_ref`、`status`、`last_error` | 否；是/null | 状态索引；重试次数 CHECK | 主库/缓存/索引/备份逐面追踪；高 |
| `audit_event` | `id`、`actor_user_id`、`entry_point_id`、`event_code`、`occurred_at` | 否；是/null | 时间和主体索引 | 仅最小元数据；禁止正文、密码和销毁内容 |

### 4.3 不建表的对象

| 对象 | 原因 | 验证方式 |
|---|---|---|
| `TemporaryDestructionState`（REQ15） | 文字焚化/黑洞正文只能在当前页面内存，不能持久化 | 网络、数据库、浏览器持久缓存、日志、崩溃上报和重开检查均无唯一标记 |
| 普通 `Message` | 会话默认临时；只有用户明确保存时才写入 `conversation.content_ciphertext` | 未点击保存后检查历史为空 |
| 检索中间结果 | 只为完成当前查询服务；避免默认保存用户问题和来源 | 断开数据库后仍能显示“未保存”状态，不伪造历史 |
| 日历分析结果 | REQ08 只记录不分析，分析需另行需求和授权 | 保存日历记录时无模型/分析调用 |
| 公开主页/漂流瓶/找回令牌 | 被本次分工文档明确排除 | 范围审查表中列为 out-of-scope |

## 5. 物理设计与约束

### 5.1 事务边界

| 事务 | 原子操作 | 失败处理 |
|---|---|---|
| 登录 | 校验哈希、创建 `auth_session`、更新最后登录元数据 | 回滚；统一返回认证失败，不泄露账号存在性 |
| 主动保存 | 校验会话/授权、写目标业务表、写最小审计 | 任一失败整体回滚；前端保留未提交输入，不显示成功 |
| 查询保存 | 写 `saved_query`、`claim`、`source`、`evidence` | 证据不完整则状态为 PARTIAL，不生成无依据主张 |
| 删除请求 | 业务对象标记不可见、创建 `deletion_job`/targets | 同一事务提交；后台传播可重试 |
| 跨端读取 | 校验当前入口、对象归属和有效 `consent_record` | 外部调用前拒绝；不得先读取全文再隐藏 |
| 寄存延期 | 锁定对象版本，校验未删除，更新 `reopen_at` 和 `version_no` | 版本冲突返回 CONFLICT，不覆盖他方更新 |

### 5.2 并发、幂等与版本

- 写接口携带 `request_id`；保存、删除、投递（本版不实现真实投递）按请求号幂等。
- 业务对象使用 `version_no` 乐观锁；`UPDATE ... WHERE id = ? AND version_no = ?`，影响行数为 0 即并发冲突。
- 查询结果的迟到回复必须比对 `request_id`、`auth_session` 和当前任务代次，不能回填已退出或已切换账号的页面。
- 读操作按 `owner_user_id`、`entry_point_id`、`deleted_at is null` 三个条件过滤；跨端读取额外要求有效授权。

### 5.3 索引依据

| 索引 | 依据 | 不做的索引 |
|---|---|---|
| `auth_session(user_id, entry_point_id, expires_at)` | 退出/过期和入口隔离查询 | 不索引 token 明文 |
| `emotion_record(owner_user_id, entry_point_id, record_date)` | 按账号、入口、日期回看 | 不对情绪正文做全文索引 |
| `stored_concern(status, reopen_at)` | 到期状态扫描 | 不自动展开正文 |
| `saved_query(owner_user_id, entry_point_id, created_at)` | 用户查询历史 | 不保存未授权临时查询 |
| `source(canonical_url)` | URL 去重 | 不把转载默认当独立证据 |
| `deletion_target(status, next_retry_at)` | 删除传播重试 | 不把正文写入错误字段 |

## 6. 访问规则、隐私与生命周期

### 6.1 权限规则

| 主体 | 允许 | 禁止 |
|---|---|---|
| 游客 | 端侧互动、临时陪伴/查询/训练 | 读取或创建持久业务对象；跨端授权 |
| 本人+当前入口有效会话 | 读写本人且同入口的已保存对象；主动保存/清除 | 读取其他账号、其他入口对象；默认跨端读取 |
| 本人+明确跨端授权 | 仅在授权 scope、purpose、有效期内读取指定对象 | 超出 scope、撤销后读取、自动复制历史 |
| 其他账号 | 无 | 所有私密对象 |
| 失效会话 | 无 | 任何私密读取/写入 |
| 运维/审计服务 | 只读最小状态和错误码 | 读取正文、密码、销毁内容；不得绕过应用授权 |

### 6.2 生命周期表

| 数据对象 | 创建 | 使用 | 主动保存/外发 | 清除 | 备份与到期 |
|---|---|---|---|---|---|
| 陪伴/训练/排练临时态 | 用户开始任务 | 当前任务 | 仅确认保存时转为持久对象 | 结束/退出立即清理 | 不进入备份 |
| 情绪记录 | 用户填写 | 日历回看 | 点击保存；分析另行授权 | 用户删除；传播到索引/缓存 | 按策略保留，备份到期后物理清除 |
| 物件 | 选择外观 | 房间展示 | 可只保存外观或另存正文 | 分别删除外观/正文 | 不因登录自动迁移游客输入 |
| 认可表达 | 排练中选择 | 整理稿查看 | 用户主动保存 | 删除整理稿 | 不保存未认可 AI 回复 |
| 寄存 | 填写标题/正文 | 到期前只显示状态 | 点击寄存并选时间 | 用户删除 | 到期只改 `READY`，不自动打开/外发 |
| 已保存查询 | 用户确认保存 | 查看摘要、主张和来源 | 仅主动保存；来源随证据链保存 | 删除查询并启动传播 | 不以备份恢复到在线系统 |
| 文字销毁正文 | 当前页面输入 | 动画期间 | 禁止 | 动画/关闭/跳过后清理 | 无备份、无日志、无索引 |

### 6.3 备份恢复设计

1. 生产数据库只允许服务端私网访问；应用密钥和数据库凭据进入密钥管理服务，SQL 仓库只保留占位配置。
2. 建议采用加密自动备份和定期恢复演练；RPO/RTO 为待团队确认的目标，不在本稿伪造数值。
3. 备份包含加密正文和治理元数据，访问与恢复均需双人审批/审计；恢复到隔离环境后再验证，不直接覆盖生产。
4. 用户删除后，在线主库立即不可见；备份按 `backup_grace_days` 到期淘汰。恢复作业必须读取删除清单，禁止把已删除对象重新暴露到在线系统。
5. 备份失败告警只含任务 ID、目标和错误码，不含正文、密码、查询原文或文字销毁内容。

## 7. 信息检索设计与服务契约

### 7.1 检索流程

`明确问题 → 保留限制词的规范化 → 入口/授权校验 → SearchAdapter 检索 → URL/标题/内容指纹去重 → Claim/Evidence/Source 绑定 → 展示状态与不确定性 → 用户选择是否保存`

### 7.2 QueryRequest / Answer 契约

请求（`QueryRequest`）只在任务生命周期内存在；`SavedQuery` 仅在用户主动保存后落库。

```json
{
  "requestId": "uuid",
  "entryPointId": "uuid",
  "mode": "FACT_QUERY",
  "rawQuery": "用户问题",
  "normalizedQuery": "保留时间、地区、版本限制的规范化问题",
  "locale": "zh-CN",
  "timeConstraint": {"from": null, "to": "2026-10-13"},
  "filters": {},
  "traceId": "opaque",
  "saveIntent": "NONE|ASKED|CONFIRMED"
}
```

```json
{
  "answerId": "uuid",
  "status": "SUCCESS|PARTIAL_SUCCESS|EMPTY_RESULT|TIMEOUT|CONFLICTED|STALE_SOURCE",
  "summary": "不超过界面限制的摘要",
  "claims": [{"text": "事实主张", "status": "SUPPORTED|CONFLICTED|UNKNOWN", "evidenceIds": ["uuid"]}],
  "sources": [{"title": "标题", "publisher": "发布者", "url": "https://example.org", "sourceTier": "S1", "publishedAt": null, "retrievedAt": "2026-10-18T00:00:00Z", "verificationState": "VERIFIED|PARTIAL|UNAVAILABLE"}],
  "uncertaintyNote": null,
  "canSave": true,
  "traceId": "opaque"
}
```

### 7.3 状态与异常

| 状态 | 触发 | 页面行为 | 数据行为 |
|---|---|---|---|
| `NEEDS_CLARIFICATION` | 缺少地区、时间、版本或问题目标 | 先询问，不能提前检索 | 不写保存表 |
| `EMPTY_RESULT` | 无可靠结果 | 展示已用条件和修正入口 | 不生成来源/主张 |
| `PARTIAL_SUCCESS` | 部分适配器超时/失败 | 展示可用结果和失败适配器 | 只有确认保存才保存可用证据 |
| `TIMEOUT` | 全部适配器超时 | 明确超时，可重试/结束 | 不把迟到回复写历史 |
| `CONFLICTED` | 来源主张无法消解 | 并列展示差异、日期和层级 | claim 标为冲突，不选顺滑答案 |
| `STALE_SOURCE` | 超出 freshnessWindow | 标注可能过期，不称“最新” | 保存时保留检索时间和状态 |
| `ACCESS_DENIED` | 入口/账号/授权不符 | 拒绝外部调用并提示原因 | 只写最小审计，不含正文 |

### 7.4 来源质量规则

S1（官方原文/标准/政府公告）优先于 S2（机构解释），S2 优先于 S3（有作者和引用链的二手材料），S4（论坛/个人博客）只能作为线索，SX（模拟/不可验证）不能支撑事实结论。来源发布时间未知时显示未知，不能用获取时间冒充发布时间。

搜索结果中出现的提示词、脚本或操作指令一律视为资料内容，不得改变系统规则或触发工具；检索适配器不接收整段陪伴/排练正文。

## 8. 类—表映射与接口交接

### 8.1 类—表映射

| 设计类/服务 | 数据表 | 说明 |
|---|---|---|
| `AccountService` / `User` | `user_account`、`user_profile` | 账号身份与私密资料，不等于公开主页 |
| `SessionService` / `AuthSession` | `auth_session` | 凭据撤销和入口隔离 |
| `ConversationRepository` | `conversation`、`accepted_expression` | 只持久化主动保存/认可表达 |
| `EmotionRecordRepository` | `emotion_record` | 只记不分析；按账号+入口+日期访问 |
| `WorryObjectRepository` | `worry_object` | 外观与正文授权分离 |
| `StoredConcernRepository` | `stored_concern` | 到期状态不自动展开 |
| `SearchOrchestrator` / `SearchAdapter` | `saved_query`、`source`、`claim`、`evidence` | 中间结果临时，保存后形成证据链 |
| `ConsentService` | `consent_record` | 跨端用途、范围、撤回 |
| `DeletionService` | `deletion_job`、`deletion_target` | 主库/索引/缓存/备份传播 |
| `AuditService` | `audit_event` | 最小元数据，禁止正文和密码 |

### 8.2 给后端与前端的交接要点

- 后端所有查询接口必须由服务端会话推导 `owner_user_id`，禁止信任请求体中的 `userId`。
- 前端保存按钮必须明确对象、范围和入口；保存成功以服务端返回的对象版本为准。
- 查询页面需要展示 `status`、`verificationState`、`publishedAt/retrievedAt` 和 `uncertaintyNote`，不能只展示摘要字符串。
- 退出、账号切换、模式切换和组件卸载时，后端取消任务并让迟到回复失效；数据库不接受已撤销会话的写入。
- REQ15 不调用通用聊天/搜索/保存接口；前端清理和网络零调用是独立验收项。

## 9. 验收清单与证据边界

| 编号 | 验收场景 | 预期 | 当前状态 |
|---|---|---|---|
| DB-01 | A 账号读取 B 账号记录 | 服务端拒绝，审计不含正文 | 设计待执行 |
| DB-02 | 同账号 Web 读取桌宠记录但无授权 | 拒绝；入口默认隔离 | 设计待执行 |
| DB-03 | 主动保存后查看/删除会话 | 只读到保存范围；删除任务可追踪 | 设计待执行 |
| DB-04 | 日历只记录不分析 | 有记录，无模型/分析写入 | 设计待执行 |
| DB-05 | 寄存到期 | 状态 READY，可取出；正文不自动展开 | 设计待执行 |
| DB-06 | 查询空结果/超时/冲突/过期 | 状态分别显示，不伪造来源 | 设计待执行 |
| DB-07 | REQ15 输入唯一标记后销毁 | 数据库、网络、日志、缓存、重开均无标记 | 设计待执行 |
| DB-08 | 并发延期同一寄存对象 | 版本冲突，不覆盖他方更新 | 设计待执行 |
| DB-09 | 删除传播某一目标失败 | UI 显示部分失败，任务可重试 | 设计待执行 |
| DB-10 | 恢复备份 | 已删除对象不回到在线系统 | 设计待执行 |

本表全部是计划/设计验收，不能在没有运行证据时写“通过”。DDL 同样是约束验证附件，尚未宣称已在选定数据库执行。

## 10. 交付清单与变更记录

| 文件 | 用途 | 状态 |
|---|---|---|
| `404NOTFOUND_数据库设计说明书_庄剀涵_v0.1.md` | 数据库设计说明书源稿 | 已生成，待交叉评审 |
| `diagrams/404NOTFOUND_database_er.mmd` | ER 图可编辑源文件 | 已生成 |
| `diagrams/404NOTFOUND_database_er.svg` | ER 图导出图 | 已生成/待视觉复核 |
| `sql/404notfound_postgresql.sql` | PostgreSQL 设计验证 DDL | 已生成，未执行声明 |
| `类表映射与检索契约.md` | 可单独交接给李泉毅/郭昱祺的摘要 | 已生成 |
| `数据库答辩讲稿_庄剀涵.md` | 100 秒数据库讲解与备讲提纲 | 已生成 |
| `evidence/数据库设计验收清单.md` | 现场/交叉评审记录模板 | 已生成 |

**版本记录**：v0.1 依据 2026-10-18 分工文档和历史需求 v0.3 整理；将范围冲突、未决技术选择和未执行证据显式化。

