import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Check, ChevronDown, ExternalLink, Eye, EyeOff, FileSearch, Inbox, Info, LoaderCircle, Menu, Send, Sparkles, X } from 'lucide-react';
import { Button as PrototypeButton, Panel } from '../ui.jsx';
import { Sidebar, SiteTopbar } from '../components/SiteChrome.jsx';
import { codePoints, safeSourceUrl } from './data.js';

/** @typedef {'normal'|'loading'|'empty'|'error'|'timeout'} UIStatus */

// C01：复用原型 Button；展示层新增 loading，不承担 API 调用。
export function Button({ loading = false, disabled, children, ...props }) {
  return <PrototypeButton {...props} disabled={disabled || loading} aria-busy={loading || undefined}>
    {loading && <LoaderCircle className="spin" size={18} aria-hidden="true" />}{children}
  </PrototypeButton>;
}
export { Panel };
export function StatusBadge({ children, tone = 'soft', icon: Icon }) {
  return <span className={`status-badge ${tone}`}>{Icon && <Icon size={15} aria-hidden="true" />}{children}</span>;
}
export function InfoNotice({ children, tone = 'soft' }) {
  return <div className={`info-notice ${tone}`}><Info size={18} aria-hidden="true" /><span>{children}</span></div>;
}
export function FormField({ id, label, hint, error, children }) {
  return <div className="form-field"><label htmlFor={id}>{label}</label>{children}
    {hint && <small id={`${id}-hint`}>{hint}</small>}
    {error && <span className="field-error" role="alert" id={`${id}-error`}>{error}</span>}
  </div>;
}
export function PasswordField({ value, onChange, disabled, error }) {
  const [visible, setVisible] = useState(false);
  return <FormField id="demo-password" label="演示密码" hint="仅输入虚构内容；密码不做裁剪或规范化。" error={error}>
    <div className="password-field"><input id="demo-password" name="demo-password" type={visible ? 'text' : 'password'} value={value} onChange={event => onChange(event.target.value)} disabled={disabled} autoComplete="off" aria-invalid={!!error} aria-describedby={`demo-password-hint${error ? ' demo-password-error' : ''}`} />
      <button className="icon-button" type="button" disabled={disabled} aria-label={visible ? '隐藏演示密码' : '显示演示密码'} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button>
    </div>
  </FormField>;
}
/**
 * C04 受控表单；不保留凭据、不发请求。
 * @param {{values:{loginName:string,password:string},status:UIStatus,
 * fieldErrors:Object,onChange:Function,onSubmit:Function,onGuest:Function}} props
 * onSubmit 同步返回首个错误字段的元素 ID，或 null；组件据此聚焦。
 */
export function AuthForm({ values, status, fieldErrors, onChange, onSubmit, onGuest }) {
  const form = useRef(null);
  function submit(event) {
    event.preventDefault();
    const invalid = onSubmit(values);
    if (invalid) form.current?.querySelector(`#${invalid}`)?.focus();
  }
  return <form className="form-stack" noValidate ref={form} onSubmit={submit} aria-busy={status === 'loading'}>
    <FormField id="demo-login-name" label="登录名" hint="3～64 位字母、数字或下划线；全角字符按 NFKC 校验。" error={fieldErrors.loginName}>
      <input id="demo-login-name" name="demo-login-name" value={values.loginName} onChange={event => onChange({ ...values, loginName: event.target.value })} disabled={status === 'loading'} autoComplete="off" spellCheck="false" aria-invalid={!!fieldErrors.loginName} aria-describedby={`demo-login-name-hint${fieldErrors.loginName ? ' demo-login-name-error' : ''}`} />
    </FormField>
    <PasswordField value={values.password} onChange={password => onChange({ ...values, password })} disabled={status === 'loading'} error={fieldErrors.password} />
    {status === 'error' && <div className="error-inline" role="alert"><AlertCircle size={20} aria-hidden="true" /><div><strong>登录未成功</strong><p>请检查登录名和密码后重试。</p><small>失败态示例；不透露账号是否存在。</small></div></div>}
    {status === 'loading' && <p role="status" className="waiting">正在验证演示输入，请稍候…</p>}
    <Button type="submit" loading={status === 'loading'}>{status === 'loading' ? '正在登录' : status === 'error' ? '重试演示登录' : '演示登录'}<ArrowRight size={18} aria-hidden="true" /></Button>
    <Button variant="neutral" onClick={onGuest}>以访客方式看看</Button>
  </form>;
}
/**
 * C17 区域状态；只渲染状态及恢复意图，不推断服务端任务结果。
 * @param {{status:UIStatus,title?:string,description?:string,onRetry?:Function,
 * retryLabel?:string,onStart?:Function,startLabel?:string,children?:React.ReactNode}} props
 */
export function AsyncState({ status, title, description, onRetry, retryLabel = '重试演示', onStart, startLabel = '开始', children }) {
  if (status === 'normal') return children;
  const Icon = status === 'error' || status === 'timeout' ? AlertCircle : status === 'loading' ? LoaderCircle : Inbox;
  return <div className={`async-state ${status}`} role={status === 'error' || status === 'timeout' ? 'alert' : 'status'} aria-busy={status === 'loading'}>
    <div className="state-icon"><Icon size={29} className={status === 'loading' ? 'spin' : ''} aria-hidden="true" /></div>
    <h3>{title}</h3><p>{description}</p>
    {status === 'loading' && <div className="skeleton-lines" aria-hidden="true"><i /><i /><i /></div>}
    {onRetry && <Button variant="neutral" onClick={onRetry}>{retryLabel}</Button>}
    {onStart && <Button onClick={onStart}>{startLabel}<ArrowRight size={16} aria-hidden="true" /></Button>}
  </div>;
}
export function FeatureEntryCard({ title, description, icon: Icon, onActivate, actionLabel }) {
  return <button className="feature-card" type="button" onClick={onActivate}>
    <span className="feature-icon"><Icon size={23} aria-hidden="true" /></span><strong>{title}</strong><p>{description}</p><span className="feature-action">{actionLabel}<ArrowRight size={16} aria-hidden="true" /></span>
  </button>;
}
export function RecentRecordList({ items, status, onRetry, onStart, onOpen }) {
  const copy = {
    empty: ['还没有主动保存的记录', '确认空列表的演示。可以先聊一会儿，是否保存由你决定。'],
    loading: ['正在读取最近记录', '这里只等待记录分区，其余功能入口仍然可用。'],
    error: ['最近记录暂时无法读取', '读取失败不代表没有历史记录。可以重试，或先使用其他功能。'],
  }[status] || [];
  return <AsyncState status={status} title={copy[0]} description={copy[1]} onRetry={status === 'error' ? onRetry : undefined} retryLabel="重试读取示例记录" onStart={status === 'empty' ? onStart : undefined} startLabel="先去聊一会儿">
    <div className="record-list">{items.map(item => <button className="record-item" key={item.id} onClick={() => onOpen(item)}><span className="record-icon"><FileSearch size={22} aria-hidden="true" /></span><span><strong>{item.title}</strong><small>{item.kind} · {item.time}</small></span><ArrowRight size={18} aria-hidden="true" /></button>)}</div>
  </AsyncState>;
}
export function SessionToolbar({ onEnd }) {
  return <div className="session-toolbar"><div><span className="companion-avatar"><Sparkles size={23} aria-hidden="true" /></span><div><strong>小烦 · 陪你聊聊</strong><small>倾听模式 · 当前页临时内容</small></div></div><Button variant="neutral" onClick={onEnd}>结束演示</Button></div>;
}
export function MessageBubble({ message }) {
  return <div className={`message ${message.role}`}><span className="message-avatar" aria-hidden="true">{message.role === 'user' ? '你' : '烦'}</span><div><small>{message.role === 'user' ? '你' : '小烦 · 固定示例回复'}</small><p>{message.text}</p></div></div>;
}
export function MessageList({ messages, status, onStart, onRetry, onRestore, onCancel, onCheck, submittedDraft }) {
  return <div className={`message-list ${status}`} role="log" aria-live="polite" aria-label="演示消息" aria-busy={status === 'loading'}>
    {status === 'empty' ? <AsyncState status="empty" title="不用组织好语言，再开口" description="此刻没有会话消息。可以用一句简单的话开始，内容只留在当前页。" onStart={onStart} startLabel="填入一句示例" /> : <>
      {messages.map(message => <MessageBubble key={message.id} message={message} />)}
      {status === 'loading' && <div className="pending-bubble" role="status"><LoaderCircle className="spin" size={19} aria-hidden="true" />正在等待演示回复…<Button variant="neutral" onClick={onCancel}>停止本次演示</Button></div>}
      {status === 'timeout' && <div className="chat-error timeout-notice" role="alert"><AlertCircle size={22} aria-hidden="true" /><div><h3>等待超时，结果待确认</h3><p>超时不能证明请求失败。保留提交快照，不自动重发；此处仅演示状态核实。</p><blockquote>{submittedDraft}</blockquote><div className="button-row"><Button onClick={onCheck}>查看明确失败示例</Button><Button variant="neutral" onClick={onCancel}>停止本地等待并取回</Button></div></div></div>}
      {status === 'error' && <div className="chat-error" role="alert"><AlertCircle size={22} aria-hidden="true" /><div><h3>本次回复未生成</h3><p>这是明确失败的模拟。已保留本次提交快照，可重试或取回编辑。</p><blockquote>{submittedDraft}</blockquote><div className="button-row"><Button onClick={onRetry}>重试本次演示</Button><Button variant="neutral" onClick={onRestore}>取回快照编辑</Button></div></div></div>}
    </>}
  </div>;
}
/**
 * C11 受控草稿；按 Unicode 码点计数，不截断输入，中文输入法组合期间不发送。
 * @param {{value:string,onChange:Function,busy:boolean,onSend:Function,
 * onClear:Function,inputRef:React.RefObject}} props
 */
export function MessageComposer({ value, onChange, busy, onSend, onClear, inputRef }) {
  const count = codePoints(value), invalid = count > 4000;
  return <form className="message-composer" onSubmit={event => { event.preventDefault(); if (!busy && !invalid && value.trim()) onSend(); }}>
    <label htmlFor="demo-message">想说的话</label><textarea ref={inputRef} id="demo-message" value={value} onChange={event => onChange(event.target.value)} rows="3" placeholder="从一句话开始，也可以慢慢想…" aria-invalid={invalid} aria-describedby="message-limit" onKeyDown={event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
        event.preventDefault(); if (!busy && !invalid && value.trim()) onSend();
      }
    }} />
    <div className="composer-bottom"><small id="message-limit" className={invalid ? 'field-error' : ''}>{count} / 4000 码点 · Enter 发送，Shift+Enter 换行{invalid && ' · 已超出上限'}</small><div className="button-row"><Button variant="neutral" onClick={onClear} disabled={!value}>清空草稿</Button><Button type="submit" disabled={busy || invalid || !value.trim()} icon={Send}>发送演示</Button></div></div>
  </form>;
}
export function SearchBar({ value, onChange, busy, pendingUnknown = false, onSearch, onClear, onCancel }) {
  const count = codePoints(value), invalid = count > 4000;
  return <form className="search-form" onSubmit={event => { event.preventDefault(); if (!busy && !invalid && value.trim()) onSearch(); }}>
    <label htmlFor="demo-question">你想查找什么？</label><div className="search-input-row"><input id="demo-question" value={value} onChange={event => onChange(event.target.value)} placeholder="写下一个问题" aria-invalid={invalid} aria-describedby="question-limit" /><Button type="submit" loading={busy && !pendingUnknown} disabled={busy || !value.trim() || invalid} icon={FileSearch}>{pendingUnknown ? '结果待确认' : busy ? '查找中' : '查找示例'}</Button><Button variant="neutral" onClick={onClear}>清空</Button>{busy && <Button variant="neutral" onClick={onCancel}>停止演示查询</Button>}</div>
    <small id="question-limit" className={invalid ? 'field-error' : ''}>{count} / 4000 码点{invalid && ' · 已超出上限，请编辑后再提交'}</small>
  </form>;
}
const qualityLabels = { CURRENT: '时效正常', STALE: '可能过时', UNKNOWN: '时效未知' };
export function UncertaintyNotice({ children }) { return <InfoNotice tone="caution">{children}</InfoNotice>; }
/**
 * C13 仅按当前 sources 的 ID 关系建立引用；缺失引用显式反馈。
 * @param {{claim:{id:string,summary:string,sourceIds:string[]},
 * sources:Array,onLocateSource:Function}} props
 */
export function ClaimItem({ claim, sources, onLocateSource }) {
  const linked = claim.sourceIds.map(id => sources.find(source => source.id === id)).filter(Boolean);
  return <article className="claim-item"><p>{claim.summary}</p><div className="citation-row"><span>示例依据</span>{linked.map(source => <button type="button" key={source.id} onClick={() => onLocateSource(source.id)} aria-controls={`source-${source.id}`} aria-label={`定位来源 ${sources.indexOf(source) + 1}`}>[{sources.indexOf(source) + 1}]</button>)}</div>
    {!linked.length && <small className="field-error">缺少可核查依据</small>}
    {linked.some(source => source.quality !== 'CURRENT') && <small className="claim-limit">引用包含时效未知或可能过时的来源，请核对原文。</small>}
  </article>;
}
/**
 * C15 展示适配后的来源数据。未知日期保持未知，合法链接以新窗口打开。
 * @param {{source:{id:string,title:string,url:string,publishedAt:string|null,
 * retrievedAt:string|null,quality:string},index:number,expanded:boolean,
 * active:boolean,onToggle:Function}} props
 */
export function SourceCard({ source, index, expanded, active, onToggle }) {
  const parsedUrl = safeSourceUrl(source.url);
  return <article id={`source-${source.id}`} tabIndex={-1} className={`source-card ${active ? 'active' : ''}`}>
    <div className="source-head"><span className="source-number">{String(index + 1).padStart(2, '0')}</span><div><h3>{source.title}</h3><small>{parsedUrl?.hostname || '链接不可用'}</small></div><button className="icon-button" type="button" onClick={() => onToggle(source.id)} aria-label={`${expanded ? '收起' : '展开'}来源 ${index + 1} 详情`} aria-expanded={expanded} aria-controls={`source-detail-${source.id}`}><ChevronDown size={20} className={expanded ? 'rotate' : ''} /></button></div>
    <StatusBadge tone="caution" icon={Info}>{qualityLabels[source.quality] || qualityLabels.UNKNOWN}</StatusBadge>
    <div className="source-details" id={`source-detail-${source.id}`} hidden={!expanded}><p>发布时间：{source.publishedAt || '未知'}</p><p>获取时间：{source.retrievedAt || '未抓取（固定示例）'}</p>{!source.publishedAt && <small>发布时间未知，无法仅凭链接判断是否最新。</small>}<small>时效标签不代表事实可信度；本地未验证链接可访问性。</small>
      {parsedUrl ? <a href={parsedUrl.href} target="_blank" rel="noopener noreferrer">打开原始来源（新窗口）<ExternalLink size={15} aria-hidden="true" /></a> : <span className="field-error">来源地址无效，无法打开</span>}
    </div>
  </article>;
}
export function SourceList({ sources, expandedIds, activeId, onToggle }) {
  return <div className="source-list">{sources.map((source, index) => <SourceCard key={source.id} source={source} index={index} expanded={expandedIds.includes(source.id)} active={activeId === source.id} onToggle={onToggle} />)}</div>;
}
export function AppShell({ scene, onNavigate, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const close = event => { if (event.key === 'Escape') setMobileOpen(false); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, []);
  const activePage = { home: 'home', login: 'home', chat: 'companion', sources: 'search', emotion: 'emotion', training: 'games' }[scene];
  const title = { home: '首页', login: '登录', chat: '陪伴交流', sources: '信息查询', emotion: '情绪命名卡', training: '训练操作' }[scene];
  const dateLabel = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  function navigateLink(key) {
    const target = { home: 'home', companion: 'chat', search: 'sources', emotion: 'emotion', games: 'training' }[key];
    if (!target) return false;
    onNavigate(target);
    return true;
  }
  return <div className="current-home ux-showcase">
    <button className="mobile-home-bar" aria-label={mobileOpen ? '关闭导航菜单' : '打开导航菜单'} aria-expanded={mobileOpen} onClick={() => setMobileOpen(open => !open)}>{mobileOpen ? <X size={21} /> : <Menu size={21} />}<strong>404NOTFOUND</strong></button>
    <Sidebar mobileOpen={mobileOpen} closeMobile={() => setMobileOpen(false)} authenticated={false} onLogin={mode => { if (mode === 'register') window.location.href = './register.html'; else onNavigate('login'); }} onAccount={() => onNavigate('login')} activePage={activePage} onNavigate={navigateLink} guestDescription="本页为组件状态展示，使用固定示例数据。" />
    <div className="home-workspace"><SiteTopbar title={title} dateLabel={dateLabel} authStatus="guest" showAccount={() => onNavigate('login')} activePage={activePage} onNavigate={navigateLink} /><main className="home-main"><div className="home-content">{children}</div></main></div>
  </div>;
}
export function PreviewNotice({ title, onClose }) {
  return <div className="preview-notice" role="status"><Check size={19} aria-hidden="true" /><span>{title}</span><button type="button" className="icon-button" onClick={onClose} aria-label="关闭操作反馈"><X size={18} /></button></div>;
}
// 原生 dialog 管理模态焦点与 Escape；此处仅确认清除本地演示内容。
export function ConfirmDialog({ onCancel, onConfirm }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    return () => { dialog.current?.close(); previous?.focus?.(); };
  }, []);
  return <dialog ref={dialog} className="confirm-dialog" aria-labelledby="end-title" aria-describedby="end-description" onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id="end-title">结束这次演示？</h2><p id="end-description">当前页的消息、提交快照和草稿将被清空。这里没有保存记录，也没有服务端任务需要结束。</p><div className="button-row"><Button variant="neutral" autoFocus onClick={onCancel}>继续留在这里</Button><Button onClick={onConfirm}>结束并清空</Button></div>
  </dialog>;
}
