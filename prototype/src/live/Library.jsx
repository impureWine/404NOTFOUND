import React, { useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client.js';
import { clearOwned, id, saveContent, updateContent } from './business.js';
const defaults = kind => kind === 'WORRY_OBJECT' ? { title: '', shapeCode: 'TANGLE', body: '' } : kind === 'DEPOSIT' ? { title: '', body: '', reopenAt: '' } : { title: '', scene: '', expressions: [''] };
const names = { QUERY: '查询记录', WORRY_OBJECT: '烦恼物件', DEPOSIT: '烦恼寄存所', REHEARSAL_DRAFT: '排练表达' };
export function Library({ kind, authenticated = false, onOrganize }) {
  const [items, setItems] = useState([]), [cursor, setCursor] = useState(null), [revision, setRevision] = useState(0);
  const [content, setContent] = useState(() => defaults(kind)), [editing, setEditing] = useState(null), [detail, setDetail] = useState(null), [deposit, setDeposit] = useState(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [reopen, setReopen] = useState('');
  const alive = useRef(true), locked = useRef(false), request = useRef(null);
  useEffect(() => { alive.current = true; const controller = new AbortController(); setItems([]); setDetail(null); setDeposit(null);
    if (!authenticated) { setCursor(null); setError(''); return () => { alive.current = false; controller.abort(); }; }
    apiClient.listRecords({ kind, limit: 20 }, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) { setItems(result.items); setCursor(result.nextCursor); } }).catch(value => { if (!controller.signal.aborted) setError(value.message); });
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
  return <section className="live-records recent-card"><h2>{names[kind]}</h2><p>{authenticated ? '只显示本人在当前入口主动保存的内容。' : '访客可浏览页面和填写表单；本人记录在登录并连接服务后读取。'}</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {authenticated && <button disabled={busy} onClick={() => setRevision(value => value + 1)}>重新读取</button>}
    {!items.length && <p>{authenticated ? '暂无记录。读取失败时请检查上方错误提示。' : '登录后可读取本人已保存的内容。'}</p>}
    <ul>{items.map(item => <li key={item.id}><button disabled={busy} onClick={() => show(item)}>{item.title}</button><button disabled={busy} onClick={() => action(async () => { if (await clearOwned(item)) { setDetail(null); setDeposit(null); setRevision(value => value + 1); } })}>清除此条</button></li>)}</ul>
    {cursor && <button disabled={busy} onClick={() => action(async () => { const result = await apiClient.listRecords({ kind, limit: 20, cursor }); if (alive.current) { setItems(current => [...current, ...result.items]); setCursor(result.nextCursor); } })}>加载更多</button>}
    {detail && <section><h3>{detail.title}</h3>{kind === 'DEPOSIT' ? deposit && <>
      <p>状态：{({ STORED: '寄存中', AVAILABLE: '已到期，可主动取出', RETRIEVED: '已取出' })[deposit.state]} · 再打开时间：{new Date(deposit.reopenAt).toLocaleString()}</p>
      {deposit.state === 'RETRIEVED' ? <p className="record-message">{deposit.body}</p> : <><button disabled={busy || deposit.state !== 'AVAILABLE'} onClick={() => action(async () => { const result = await apiClient.retrieveDeposit(detail.id, { requestId: id(), expectedVersion: deposit.version }); if (alive.current) { setDeposit(result); setDetail(current => ({ ...current, version: result.version })); setItems(current => current.map(item => item.id === result.id ? { ...item, version: result.version } : item)); } })}>主动取出正文</button>
        <label>延期到<input type="datetime-local" value={reopen} onChange={event => setReopen(event.target.value)} /></label><button disabled={busy || !reopen} onClick={() => action(async () => { const result = await apiClient.postponeDeposit(detail.id, { requestId: id(), expectedVersion: deposit.version, reopenAt: new Date(reopen).toISOString() }); if (alive.current) { setDeposit(result); setDetail(current => ({ ...current, version: result.version })); setItems(current => current.map(item => item.id === result.id ? { ...item, version: result.version } : item)); } })}>确认延期</button></>}
    </> : <><p className="record-message">{detail.content?.body || detail.content?.scene || detail.content?.question}</p>{detail.content?.expressions?.map((text, index) => <p key={index}>{text}</p>)}{kind !== 'QUERY' && <button disabled={busy} onClick={() => { setEditing(detail); setContent({ title: detail.title, ...detail.content }); }}>编辑</button>}
      {detail.content?.claims?.map(claim => <article key={claim.id}><p>{claim.text}</p><small>{claim.status}</small>{claim.evidence.map((item, index) => <p key={index}><a href={item.source.url} target="_blank" rel="noreferrer">{item.source.title}</a></p>)}</article>)}
      {kind === 'WORRY_OBJECT' && <button onClick={() => onOrganize(detail.content.body)}>选择这件烦恼并进入事情整理</button>}</>}
    </section>}
    {kind !== 'QUERY' && <form onSubmit={save}><h3>{editing ? '编辑' : '新增'}{names[kind]}</h3><fieldset disabled={busy}>
      <label>标题<input maxLength={80} value={content.title} onChange={event => patch({ title: event.target.value })} /></label>
      {kind === 'WORRY_OBJECT' && <><label>形状<select value={content.shapeCode} onChange={event => patch({ shapeCode: event.target.value })}><option value="TANGLE">线团</option><option value="STONE">石头</option><option value="NOTE">便利贴</option></select></label><div className={`worry-shape shape-${content.shapeCode}`} aria-label="本次物件形状">{content.shapeCode === 'TANGLE' ? '〰' : content.shapeCode === 'STONE' ? '●' : '▤'}</div></>}
      {kind === 'REHEARSAL_DRAFT' ? <><label>场景<textarea required maxLength={4000} value={content.scene} onChange={event => patch({ scene: event.target.value })} /></label>{content.expressions.map((text, index) => <label key={index}>认可的表达 {index + 1}<textarea required maxLength={4000} value={text} onChange={event => patch({ expressions: content.expressions.map((value, i) => i === index ? event.target.value : value) })} /></label>)}<button type="button" disabled={content.expressions.length >= 20} onClick={() => patch({ expressions: [...content.expressions, ''] })}>添加表达</button></> : <label>{kind === 'DEPOSIT' ? '暂时放下的事' : '这件烦恼的描述'}<textarea required maxLength={4000} value={content.body} onChange={event => patch({ body: event.target.value })} /></label>}
      {kind === 'DEPOSIT' && <label>再打开时间<input type="datetime-local" required value={content.reopenAt} onChange={event => patch({ reopenAt: event.target.value })} /></label>}
      <p>{authenticated ? '只有确认保存才会提交并加密存入数据库。' : '登录后才能把内容保存到本人账户；当前填写不会上传。'}{kind === 'DEPOSIT' ? '寄存内容到期后仍需主动取出。' : ''}</p><button type="submit" disabled={!authenticated}>确认保存</button>{editing && <button type="button" onClick={() => { setEditing(null); setContent(defaults(kind)); }}>取消编辑</button>}
      {kind === 'WORRY_OBJECT' && <button type="button" disabled={!content.body.trim()} onClick={() => onOrganize(content.body)}>不保存，选择这段描述进入整理</button>}
    </fieldset></form>}
  </section>;
}
