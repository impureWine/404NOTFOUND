import React, { useEffect, useId, useRef } from 'react';
import { ArrowLeft, Bookmark, FileText, History, ShieldCheck } from 'lucide-react';
import { AsyncState, Button, InfoNotice, StatusBadge } from './components.jsx';
import { codePoints } from './data.js';

export const RECORD_KINDS = {
  CONVERSATION: '倾诉片段',
  EMOTION: '心情记录',
  QUERY: '查询记录',
};

/** Display-only identity selector. It never establishes an authenticated session. */
export function RecordSceneHeader({ title, description, identity, onIdentity, children }) {
  return <header className="record-scene-heading">
    <div><span className="eyebrow">由你决定，留下多少</span><h2 tabIndex={-1}>{title}</h2><p>{description}</p></div>
    <div className="record-identity"><label htmlFor="record-demo-identity">模拟身份</label>
      <select id="record-demo-identity" value={identity} onChange={event => onIdentity(event.target.value)}>
        <option value="guest">游客</option><option value="account-a">示例账号 A</option><option value="account-b">示例账号 B</option>
      </select><small>切换即清空当前选择、确认与详情；仅用于组件演示。</small>
    </div>{children}
  </header>;
}

/** Native dialog keeps focus within the confirmation and restores the trigger. */
export function RecordDialog({ title, description, children, onCancel }) {
  const ref = useRef(null);
  const id = useId();
  useEffect(() => {
    const trigger = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    dialog.querySelector('[data-dialog-initial]')?.focus();
    return () => { dialog.close(); if (trigger?.isConnected) trigger.focus(); };
  }, []);
  return <dialog ref={ref} className="record-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id={`${id}-title`}>{title}</h2><p id={`${id}-description`}>{description}</p>{children}
  </dialog>;
}

/** Controlled selection. Saving permission belongs to the exact reviewed snapshot. */
export function SaveSelection({ items, selectedIds, title, locked, onToggle, onTitle, onPreview }) {
  const picked = items.filter(item => selectedIds.includes(item.id));
  const titleInvalid = !title.trim() || codePoints(title.trim()) > 80;
  const titleError = !title.trim() ? '请填写记录标题，不能只输入空格。' : codePoints(title.trim()) > 80 ? '标题超过 80 码点，请缩短后再预览。' : '';
  const count = picked.reduce((sum, item) => sum + codePoints(item.text), 0);
  const invalid = titleInvalid || !picked.length || picked.length > 20 || count > 12000;
  return <form className="save-selection" onSubmit={event => { event.preventDefault(); if (!locked && !invalid) onPreview(); }}>
    <label className="record-field" htmlFor="record-save-title"><span>记录标题</span>
      <input id="record-save-title" value={title} onChange={event => onTitle(event.target.value)} disabled={locked}
        aria-invalid={titleInvalid} aria-describedby={`record-title-limit${titleError ? ' record-title-error' : ''}`} />
      <small id="record-title-limit">{codePoints(title.trim())} / 80 码点 · 不能全为空格</small>
      {titleError && <small id="record-title-error" className="field-error" role="alert">{titleError}</small>}
    </label>
    <fieldset disabled={locked}><legend>选择要保存的内容</legend><p>默认不选；仅保存这次明确勾选的片段。</p>
      {items.map(item => <label className={`save-message-option ${selectedIds.includes(item.id) ? 'chosen' : ''}`} key={item.id}>
        <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => onToggle(item.id)} />
        <span><strong>{item.role === 'user' ? '我说的话' : '示例回复'}</strong><span className="record-body-text">{item.text}</span></span>
      </label>)}
    </fieldset>
    <div className="record-selection-summary" role="status">已选 {picked.length} / 20 条，共 {count} / 12000 码点</div>
    {!picked.length && <p className="record-muted">请至少选择一条片段，再预览保存范围。</p>}
    {picked.length > 20 && <p className="field-error" role="alert">最多选择 20 条片段，请减少选择后再预览。</p>}
    {count > 12000 && <p className="field-error" role="alert">所选内容超出上限，请减少片段；内容不会被静默截断。</p>}
    <Button type="submit" disabled={locked || invalid} icon={Bookmark}>预览保存范围</Button>
  </form>;
}

export function SaveConfirmation({ snapshot, consent, onConsent, onCancel, onConfirm }) {
  return <RecordDialog title="确认这次保存范围" description="仅把下方内容加入当前账号、当前 Web 入口的记录；未选中的消息不会保存。" onCancel={onCancel}>
    <div className="record-snapshot"><h3>{snapshot.title}</h3>{snapshot.items.map(item => <p className="record-body-text" key={item.id}>{item.text}</p>)}</div>
    <InfoNotice>保存许可与 AI 处理许可分开；这次操作不调用 AI。这里仅加入页面内的模拟历史。</InfoNotice>
    <label className="record-check"><input type="checkbox" checked={consent} onChange={event => onConsent(event.target.checked)} />
      <span>我确认仅保存以上内容</span></label>
    <div className="button-row"><Button variant="neutral" data-dialog-initial onClick={onCancel}>返回修改</Button>
      <Button onClick={onConfirm} disabled={!consent}>确认加入示例历史</Button></div>
  </RecordDialog>;
}

export function GuestSaveGate({ keepSelection, onKeepSelection, onCancel, onLogin }) {
  return <RecordDialog title="登录后，仍由你确认保存" description="游客内容不会自动转入账号。可只在本页内存临时保留本次选中片段，模拟登录后再次预览和确认。" onCancel={onCancel}>
    <label className="record-check"><input type="checkbox" checked={keepSelection} onChange={event => onKeepSelection(event.target.checked)} />
      <span>仅在本页临时保留当前选中片段（默认不保留）</span></label>
    <p className="record-muted">离开、刷新或主动切换账号会丢弃这份临时选择。此处不输入凭据、不建立真实登录会话。</p>
    <div className="button-row"><Button variant="neutral" data-dialog-initial onClick={onCancel}>继续作为游客</Button>
      <Button onClick={onLogin}>模拟登录为账号 A</Button></div>
  </RecordDialog>;
}

export function RecordHistoryList({ items, filter, onFilter, status, onRetry, onStart, onOpen, onLogin }) {
  const visible = items.filter(item => filter === 'ALL' || item.kind === filter);
  const actualStatus = status === 'normal' && !visible.length ? 'empty' : status;
  const filteredEmpty = actualStatus === 'empty' && filter !== 'ALL';
  const copy = {
    loading: ['正在读取本人历史', '读取期间不显示旧身份的记录；你可以使用其他入口。'],
    error: ['历史暂时无法读取', '读取失败不代表没有记录。请重试，不会用空列表替代失败。'],
    empty: [filter === 'ALL' ? '还没有主动保存的记录' : '当前筛选下没有记录', '内容只有在你明确保存后才会出现在这里。'],
    expired: ['登录已失效，请重新登录', '本人历史已从当前展示中隐藏。重新登录后需要再次读取。'],
    guest: ['登录后查看本人历史', '游客没有本人历史。登录不会自动收集或迁移游客内容。'],
  }[actualStatus] || [];
  return <>
    <div className="history-filter"><label htmlFor="history-kind">记录类型</label><select id="history-kind" value={filter}
      disabled={['loading', 'expired', 'guest'].includes(status)} onChange={event => onFilter(event.target.value)}>
      <option value="ALL">全部类型</option>{Object.entries(RECORD_KINDS).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
    </select><span>仅当前模拟账号 · Web 入口</span></div>
    <AsyncState status={actualStatus} title={copy[0]} description={copy[1]} onRetry={status === 'error' ? onRetry : undefined}
      retryLabel="重试读取示例历史" onStart={filteredEmpty ? () => onFilter('ALL') : actualStatus === 'empty' ? onStart : ['expired', 'guest'].includes(actualStatus) ? onLogin : undefined}
      startLabel={filteredEmpty ? '清除筛选，查看全部' : actualStatus === 'expired' ? '重新模拟登录' : actualStatus === 'guest' ? '模拟登录查看' : '去选择保存内容'}>
      <ul className="history-records" aria-label="本人历史记录">{visible.map(item => <li key={item.id}>
        <button className="history-record-button" type="button" onClick={() => onOpen(item.id)}>
          <span className="record-icon"><FileText size={23} aria-hidden="true" /></span>
          <span><strong>{item.title}</strong><small>{RECORD_KINDS[item.kind]} · {item.time}</small></span>
          <span className="history-open">查看详情 →</span>
        </button>
      </li>)}</ul>
      <p className="history-end">已显示本次示例的全部 {visible.length} 条记录</p>
    </AsyncState>
  </>;
}

export function RecordDetail({ record, status, onRetry, onBack, onClear, onLogin }) {
  const actualStatus = status === 'normal' && !record ? 'unavailable' : status;
  const copy = {
    loading: ['正在读取记录详情', '不预先显示缓存中的正文。'],
    empty: ['还没有选中记录', '先从本人历史列表中选择一条记录。'],
    error: ['记录详情读取失败', '尚未读取到正文。可以重试，或返回本人历史。'],
    expired: ['登录已失效，请重新登录', '详情正文已从当前界面隐藏；重新登录后再次打开记录。'],
    guest: ['登录后查看本人记录', '游客不能打开本人记录详情；登录后请从本人历史重新选择。'],
    unavailable: ['这条记录暂不可用', '可能已被清除或当前无法访问。请返回本人历史重新选择。'],
    conflict: ['记录状态已变化', '本次清除没有继续。请重新读取最新内容，再决定是否清除。'],
  }[actualStatus] || [];
  return <>
    <Button variant="neutral" icon={ArrowLeft} onClick={onBack}>返回本人历史</Button>
    <div className="record-detail-content">
      {['expired', 'guest', 'unavailable', 'conflict'].includes(actualStatus) ? <div className="record-special-state" role="alert">
        <h3>{copy[0]}</h3><p>{copy[1]}</p>
        {['expired', 'guest'].includes(actualStatus) && <Button onClick={onLogin}>{actualStatus === 'guest' ? '模拟登录查看' : '重新模拟登录'}</Button>}
        {actualStatus === 'conflict' && <Button onClick={onRetry}>重新读取最新示例</Button>}
      </div> : <AsyncState status={actualStatus} title={copy[0]} description={copy[1]}
        onRetry={actualStatus === 'error' ? onRetry : undefined} retryLabel="重试读取示例详情">
        {record && <article className="saved-record-detail"><div className="section-heading"><span className="eyebrow">已主动保存 · 本地示例</span><StatusBadge icon={ShieldCheck}>仅当前模拟账号</StatusBadge></div>
          <h3>{record.title}</h3><p className="record-muted">{RECORD_KINDS[record.kind]} · {record.time} · Web 入口</p>
          <div className="saved-record-body">{record.items.map(item => <p className="record-body-text" key={item.id}>{item.text}</p>)}</div>
          <p className="record-muted">打开详情不会自动分析，也不会带入新的聊天。</p>
          <Button variant="danger" onClick={onClear}>清除这条示例记录</Button>
        </article>}
      </AsyncState>}
    </div>
  </>;
}

export function ClearRecordConfirmation({ record, onCancel, onConfirm }) {
  return <RecordDialog title="清除这条已保存记录？" description="这会从当前模拟账号的本次历史中移除这条记录及正文，其他记录不受影响。不会自动恢复。" onCancel={onCancel}>
    <div className="clear-record-summary"><History size={22} aria-hidden="true" /><strong>{record.title}</strong></div>
    <p className="record-muted">这里操作的是页面内存示例，不代表已经删除服务器数据。</p>
    <div className="button-row"><Button variant="neutral" data-dialog-initial onClick={onCancel}>保留记录</Button>
      <Button variant="danger" onClick={onConfirm}>确认清除示例记录</Button></div>
  </RecordDialog>;
}
