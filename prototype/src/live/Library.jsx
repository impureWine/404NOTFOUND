import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { apiClient } from '../api/client.js';
import { clearOwned, id, saveContent, updateContent } from './business.js';
import './worry-objects.css';

const worryShapes = [
  { code: 'TANGLE', name: '线团' },
  { code: 'STONE', name: '石头' },
  { code: 'NOTE', name: '便利贴' },
];

function WorryShape({ code }) {
  return <span className={`worry-art worry-art--${code.toLowerCase()}`} aria-hidden="true">
    <span /><span /><span />
  </span>;
}

function WorryShapePicker({ value, onChange }) {
  return <fieldset className="worry-picker">
    <legend>选择物件形状</legend>
    <div className="worry-options">
      {worryShapes.map(({ code, name }) => <label className="worry-option" key={code}>
        <input type="radio" name="worry-shape" value={code} checked={value === code}
          onChange={() => onChange(code)} />
        <span className="worry-option-face">
          <span className="worry-preview"><WorryShape code={code} /></span>
          <span className="worry-option-name">{name}</span>
          <span className="worry-selection-mark" aria-hidden="true" />
        </span>
      </label>)}
    </div>
  </fieldset>;
}
const defaults = kind => kind === 'WORRY_OBJECT' ? { title: '', shapeCode: 'TANGLE', body: '' } : kind === 'DEPOSIT' ? { title: '', body: '', reopenAt: '' } : { title: '', scene: '', expressions: [''] };
const names = { QUERY: '查询记录', WORRY_OBJECT: '烦恼物件', DEPOSIT: '烦恼寄存所', REHEARSAL_DRAFT: '排练表达' };
const libraryCopy = {
  QUERY: ['查询记录', '回看你在此入口保存的查询及其来源。', '暂无已保存的查询。'],
  WORRY_OBJECT: ['烦恼物件化', '给说不清的烦恼选一个形状，留下它的描述。', '暂无已保存的烦恼物件。'],
  DEPOSIT: ['烦恼寄存所', '写下想暂时放下的事，约定何时可以重新打开。', '暂无寄存内容。'],
  REHEARSAL_DRAFT: ['我的排练表达', '留下练习中你认可的表达，方便下次回看。', '暂无已保存的排练表达。'],
};

export function Library({ kind, authenticated = false, onOrganize }) {
  const [loadState, setLoadState] = useState('idle');
  const [items, setItems] = useState([]), [cursor, setCursor] = useState(null), [revision, setRevision] = useState(0);
  const [content, setContent] = useState(() => defaults(kind)), [editing, setEditing] = useState(null), [detail, setDetail] = useState(null), [deposit, setDeposit] = useState(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [reopen, setReopen] = useState('');
  const alive = useRef(true), locked = useRef(false), request = useRef(null), editorTitle = useRef(null);
  useEffect(() => { alive.current = true; const controller = new AbortController(); setItems([]); setDetail(null); setDeposit(null); setLoadState(authenticated ? 'loading' : 'idle'); setError('');
    if (!authenticated) { setCursor(null); setError(''); return () => { alive.current = false; controller.abort(); }; }
    apiClient.listRecords({ kind, limit: 20 }, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) { setItems(result.items); setCursor(result.nextCursor); setLoadState('ready'); } }).catch(value => { if (!controller.signal.aborted) { setError(value.message); setLoadState('error'); } });
    return () => { alive.current = false; controller.abort(); }; }, [authenticated, kind, revision]);
  const action = async callback => {
    if (locked.current) return; locked.current = true; setBusy(true); setError(''); setNotice('');
    try { await callback(); } catch (value) { if (alive.current) setError(`${value.message}；未确认操作成功。`); }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  };
  const patch = value => setContent(current => ({ ...current, ...value }));
  const save = event => { event.preventDefault(); if (!authenticated) { setNotice('访客填写仅用于页面预览；登录后才会保存到本人账户。'); return; } action(async () => {
    const normalized = { ...content, title: content.title.trim() || names[kind], ...(kind === 'DEPOSIT' ? { reopenAt: new Date(content.reopenAt).toISOString() } : {}) };
    const fingerprint = JSON.stringify({ kind, normalized, editing });
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: id() };
    if (editing) await updateContent(editing, normalized, request.current.id); else await saveContent(kind, normalized, request.current.id);
    if (!alive.current) return; setContent(defaults(kind)); setEditing(null); request.current = null; setNotice('服务端已确认保存。'); setRevision(value => value + 1);
  }); };
  const show = item => action(async () => {
    const result = await apiClient.getRecord(item.id); if (!alive.current) return; setDetail(result); setDeposit(null);
    if (kind === 'DEPOSIT') { const state = await apiClient.getDeposit(item.id); if (alive.current) setDeposit(state); }
  });
  const [heading, description, empty] = libraryCopy[kind];
  return <section className="live-records workspace-tool">
    <header className="workspace-tool-heading"><h2>{heading}</h2><p>{description}</p></header>
    {error && <p className="workspace-tool-feedback" role="alert">{error}</p>}
    {notice && <p className="workspace-tool-feedback" role="status">{notice}</p>}
    <div className={kind === 'QUERY' ? 'workspace-tool-columns is-single' : 'workspace-tool-columns'}>
    {kind !== 'QUERY' && <form className="workspace-tool-panel workspace-tool-editor" onSubmit={save}>
      <h3>{editing ? '编辑' : '新增'}{kind === 'DEPOSIT' ? '寄存' : names[kind]}</h3>
      <fieldset className="workspace-tool-fields" disabled={busy}>
      <label>标题<input ref={editorTitle} maxLength={80} value={content.title} onChange={event => patch({ title: event.target.value })} /></label>
      {kind === 'WORRY_OBJECT' && <WorryShapePicker value={content.shapeCode}
        onChange={shapeCode => patch({ shapeCode })} />}
      {kind === 'REHEARSAL_DRAFT' ? <><label>场景<textarea required maxLength={4000} value={content.scene} onChange={event => patch({ scene: event.target.value })} /></label>{content.expressions.map((text, index) => <label key={index}>认可的表达 {index + 1}<textarea required maxLength={4000} value={text} onChange={event => patch({ expressions: content.expressions.map((value, i) => i === index ? event.target.value : value) })} /></label>)}<button type="button" disabled={content.expressions.length >= 20} onClick={() => patch({ expressions: [...content.expressions, ''] })}>添加表达</button></> : <label>{kind === 'DEPOSIT' ? '暂时放下的事' : '这件烦恼的描述'}<textarea required maxLength={4000} value={content.body} onChange={event => patch({ body: event.target.value })} /></label>}
      {kind === 'DEPOSIT' && <label>再打开时间<input type="datetime-local" required value={content.reopenAt} onChange={event => patch({ reopenAt: event.target.value })} /></label>}
      <p>{authenticated ? '只有确认保存才会提交并加密存入数据库。' : '登录后才能把内容保存到本人账户；当前填写不会上传。'}{kind === 'DEPOSIT' ? '寄存内容到期后仍需主动取出。' : ''}</p><div className="workspace-tool-actions"><button type="submit" className="workspace-tool-primary" disabled={!authenticated}>确认保存</button>{editing && <button type="button" onClick={() => { setEditing(null); setContent(defaults(kind)); }}>取消编辑</button>}
      {kind === 'WORRY_OBJECT' && <button type="button" disabled={!content.body.trim()} onClick={() => onOrganize(content.body)}>不保存，选择这段描述进入整理</button>}
    </div></fieldset></form>}
    <section className="workspace-tool-panel">
      <div className="workspace-tool-panel-heading">
        <h3>已保存记录</h3>
        {authenticated && <button type="button" disabled={busy || loadState === 'loading'} onClick={() => setRevision(value => value + 1)}>
          <RefreshCw size={15} aria-hidden="true" /> 刷新
        </button>}
      </div>
      {authenticated && loadState === 'loading' && <p className="workspace-tool-empty" role="status">正在读取记录…</p>}
      {(!authenticated || (loadState === 'ready' && !items.length)) && <p className="workspace-tool-empty">{authenticated ? empty : '登录后可读取本人已保存的内容。'}</p>}
      {items.length > 0 && <ul className="workspace-tool-list">{items.map(item => <li key={item.id}>
        <button className="workspace-tool-row" type="button" aria-current={detail?.id === item.id ? 'true' : undefined} disabled={busy} onClick={() => show(item)}>
          <span><strong>{item.title}</strong>{item.createdAt && <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString('zh-CN')}</time>}</span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
        <button className="workspace-tool-clear" type="button" disabled={busy} onClick={() => action(async () => { if (await clearOwned(item)) { setDetail(null); setDeposit(null); setRevision(value => value + 1); } })}>清除</button></li>)}</ul>}
    {cursor && <button disabled={busy} onClick={() => action(async () => { const result = await apiClient.listRecords({ kind, limit: 20, cursor }); if (alive.current) { setItems(current => [...current, ...result.items]); setCursor(result.nextCursor); } })}>加载更多</button>}
    {detail && <section className="workspace-tool-detail" aria-label="记录详情">
      <div className="workspace-tool-panel-heading"><h3>{detail.title}</h3>
        <button type="button" onClick={() => { setDetail(null); setDeposit(null); }}>关闭详情</button>
      </div>{kind === 'DEPOSIT' ? deposit && <>
      <p>状态：{({ STORED: '寄存中', AVAILABLE: '已到期，可主动取出', RETRIEVED: '已取出' })[deposit.state]} · 再打开时间：{new Date(deposit.reopenAt).toLocaleString()}</p>
      {deposit.state === 'RETRIEVED' ? <p className="record-message">{deposit.body}</p> : <><button disabled={busy || deposit.state !== 'AVAILABLE'} onClick={() => action(async () => { const result = await apiClient.retrieveDeposit(detail.id, { requestId: id(), expectedVersion: deposit.version }); if (alive.current) { setDeposit(result); setDetail(current => ({ ...current, version: result.version })); setItems(current => current.map(item => item.id === result.id ? { ...item, version: result.version } : item)); } })}>主动取出正文</button>
        <label>延期到<input type="datetime-local" value={reopen} onChange={event => setReopen(event.target.value)} /></label><button disabled={busy || !reopen} onClick={() => action(async () => { const result = await apiClient.postponeDeposit(detail.id, { requestId: id(), expectedVersion: deposit.version, reopenAt: new Date(reopen).toISOString() }); if (alive.current) { setDeposit(result); setDetail(current => ({ ...current, version: result.version })); setItems(current => current.map(item => item.id === result.id ? { ...item, version: result.version } : item)); } })}>确认延期</button></>}
    </> : <><p className="record-message">{detail.content?.body || detail.content?.scene || detail.content?.question}</p>{detail.content?.expressions?.map((text, index) => <p key={index}>{text}</p>)}{kind !== 'QUERY' && <button disabled={busy} onClick={() => { setEditing(detail); setContent({ title: detail.title, ...detail.content }); editorTitle.current?.focus(); }}>编辑</button>}
      {detail.content?.claims?.map(claim => <article key={claim.id}><p>{claim.text}</p><small>{claim.status}</small>{claim.evidence.map((item, index) => <p key={index}><a href={item.source.url} target="_blank" rel="noreferrer">{item.source.title}</a></p>)}</article>)}
      {kind === 'WORRY_OBJECT' && <button onClick={() => onOrganize(detail.content.body)}>选择这件烦恼并进入事情整理</button>}</>}
    </section>}
    </section>
    </div>
  </section>;
}
