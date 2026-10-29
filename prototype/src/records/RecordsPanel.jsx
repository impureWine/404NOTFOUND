import React, { useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client.js';
import './records.css';
import { clearOwned } from '../live/business.js';

const today = () => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const fresh = kind => kind === 'EMOTION'
  ? { title: '', recordDate: today(), emotionCodes: [], intensity: null, timezoneName: Intl.DateTimeFormat().resolvedOptions().timeZone, note: '' }
  : { title: '', messages: [{ role: 'USER', content: '' }] };
const words = ['平静', '疲惫', '烦躁', '担心', '失落', '期待', '说不清'];

export function RecordsPanel({ kind }) {
  const [items, setItems] = useState([]), [cursor, setCursor] = useState(null);
  const [selectedDay, setSelectedDay] = useState('');
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [content, setContent] = useState(() => fresh(kind));
  const [editing, setEditing] = useState(null), [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const epoch = useRef(0), pending = useRef(null), locked = useRef(false);
  const emotion = kind === 'EMOTION';
  const patch = value => setContent(current => ({ ...current, ...value }));
  const query = () => {
    const value = { kind, limit: 20 };
    if (emotion && /^\d{4}-\d{2}$/.test(month)) {
      const [year, number] = month.split('-').map(Number);
      value.from = `${month}-01`;
      value.to = `${month}-${new Date(year, number, 0).getDate()}`;
    }
    return value;
  };
  useEffect(() => {
    const controller = new AbortController();
    const generation = ++epoch.current;
    setItems([]); setCursor(null); setDetail(null); setError(''); setLoading(true);
    apiClient.listRecords(query(), { signal: controller.signal }).then(async result => {
      const records = emotion ? await Promise.all(result.items.map(item => apiClient.getRecord(item.id, { signal: controller.signal }))) : result.items;
      if (generation === epoch.current && !controller.signal.aborted) { setItems(records); setCursor(result.nextCursor); }
    }).catch(value => { if (!controller.signal.aborted) setError(value.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); ++epoch.current; };
  }, [kind, month, revision]);

  const more = async () => {
    const generation = epoch.current;
    setLoading(true); setError('');
    try {
      const result = await apiClient.listRecords({ ...query(), cursor });
      const records = emotion ? await Promise.all(result.items.map(item => apiClient.getRecord(item.id))) : result.items;
      if (generation !== epoch.current) return;
      setItems(current => [...current, ...records]); setCursor(result.nextCursor);
    } catch (value) { if (generation === epoch.current) setError(value.message); }
    finally { if (generation === epoch.current) setLoading(false); }
  };
  const view = async item => {
    const generation = epoch.current;
    try { const record = await apiClient.getRecord(item.id); if (generation === epoch.current) setDetail(record); }
    catch (value) { if (generation === epoch.current) setError(value.message); }
  };
  const save = async event => {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setNotice('');
    const generation = epoch.current;
    try {
      const normalized = { ...content, ...(!emotion ? { messages: content.messages.map(message => ({ ...message, content: message.content.trim() })) } : {}), title: content.title.trim() || (emotion ? `${content.recordDate} 情绪记录` : '陪伴记录') };
      const payload = editing ? { recordId: editing.id, expectedVersion: editing.version, content: normalized } : { kind, content: normalized };
      const fingerprint = JSON.stringify(payload);
      if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, requestId: crypto.randomUUID() };
      const consent = await apiClient.createConsent({ requestId: crypto.randomUUID(), purpose: 'SAVE', operation: editing ? 'RECORD_UPDATE' : 'RECORD_CREATE', payload });
      const body = { requestId: pending.current.requestId, consentId: consent.consentId, content: normalized };
      if (editing) await apiClient.updateRecord(editing.id, { ...body, expectedVersion: editing.version });
      else await apiClient.createRecord({ ...body, kind });
      if (generation !== epoch.current) return;
      pending.current = null; setEditing(null); setContent(emotion ? { ...fresh(kind), recordDate: normalized.recordDate } : fresh(kind));
      if (emotion) { setMonth(normalized.recordDate.slice(0, 7)); setSelectedDay(normalized.recordDate); }
      setNotice('服务端已确认保存。刷新页面后仍可查看。'); setRevision(value => value + 1);
    } catch (value) { if (generation === epoch.current) setError(`${value.message}；未确认保存成功。版本冲突时请重新打开最新记录再编辑。`); }
    finally { locked.current = false; setBusy(false); }
  };
  return <section className="live-records recent-card">
    <div className="section-heading"><h3>{emotion ? '情绪日历' : '陪伴记录'}</h3><span>本人账户 · 真实服务</span></div>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {emotion && <label>查看月份<input aria-label="查看月份" type="month" required value={month} disabled={busy} onChange={event => { if (event.target.value) { setMonth(event.target.value); setSelectedDay(''); } }} /></label>}
    <button type="button" disabled={busy || loading} onClick={() => setRevision(value => value + 1)}>重新读取</button>
    {loading && <p role="status">正在从服务端读取…</p>}
    {!loading && !items.length && <p>暂无主动保存的记录。</p>}
    {emotion && <><div className="record-month-grid" aria-label="本月日期">{Array.from({ length: new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate() }, (_, index) => {
      const date = `${month}-${String(index + 1).padStart(2, '0')}`;
      const marked = items.some(item => item.content.recordDate === date);
      return <button type="button" key={date} aria-label={`${date}${marked ? ' 有已加载记录' : ''}`} aria-pressed={selectedDay === date} onClick={() => { setSelectedDay(date); if (!editing) patch({ recordDate: date }); }}>{index + 1}{marked ? ' ●' : ''}</button>;
    })}</div><p>标记基于已加载记录。{selectedDay || '显示本月记录'} <button type="button" onClick={() => setSelectedDay('')}>查看整月</button></p></>}
    <ul className="live-record-list">{items.filter(item => !emotion || !selectedDay || item.content.recordDate === selectedDay).map(item => <li key={item.id}>
      <button type="button" onClick={() => view(item)}>{item.content?.recordDate || new Date(item.createdAt).toLocaleDateString()} · {item.title}</button>
      <button type="button" disabled={busy} onClick={async () => { if (locked.current) return; locked.current = true; setBusy(true); setError(''); try { if (await clearOwned(item)) { setDetail(null); setRevision(value => value + 1); } } catch (value) { setError(value.message); } finally { locked.current = false; setBusy(false); } }}>清除此条</button>
      {emotion && <><p>{item.content.emotionCodes.join('、') || '未命名'} · 强度：{item.content.intensity ?? '跳过'}</p><p>{item.content.note}</p>
        <button type="button" disabled={busy} onClick={() => { setEditing(item); setContent({ title: item.title, ...item.content }); setDetail(null); }}>编辑</button></>}
    </li>)}</ul>
    {cursor && <button type="button" disabled={loading || busy} onClick={more}>加载更多</button>}
    {detail && <section aria-label="记录详情"><h4>{detail.title}</h4>{detail.content?.messages?.map((message, index) => <p className="record-message" key={index}><strong>{message.role === 'USER' ? '用户' : '助手'}：</strong>{message.content}</p>)}{detail.content?.recordDate && <p>{detail.content.recordDate} · {detail.content.note}</p>}<button type="button" onClick={() => setDetail(null)}>关闭详情</button></section>}
    {emotion && <form onSubmit={save}><h4>{editing ? '编辑情绪记录' : emotion ? '新增情绪记录' : '保存已有陪伴对话'}</h4>
      {!emotion && <p>在这里整理并保存已有对话。此表单不会生成 AI 回复，也不会保存独立演示页面中的预设回复。</p>}
      <fieldset disabled={busy}><label>标题（可选）<input value={content.title} maxLength={80} onChange={event => patch({ title: event.target.value })} /></label>
      {emotion ? <>
        <label>日期<input type="date" required value={content.recordDate} onChange={event => patch({ recordDate: event.target.value })} /></label>
        <div className="record-tags" aria-label="情绪词，可跳过">{words.map(word => <button type="button" key={word} aria-pressed={content.emotionCodes.includes(word)} disabled={!content.emotionCodes.includes(word) && content.emotionCodes.length >= 5} onClick={() => patch({ emotionCodes: content.emotionCodes.includes(word) ? content.emotionCodes.filter(value => value !== word) : [...content.emotionCodes, word] })}>{word}</button>)}</div>
        <label>强度（可跳过）<select value={content.intensity ?? ''} onChange={event => patch({ intensity: event.target.value ? Number(event.target.value) : null })}><option value="">跳过</option>{[1,2,3,4,5].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>备注（可选）<textarea maxLength={300} value={content.note} onChange={event => patch({ note: event.target.value })} /></label>
      </> : <>{content.messages.map((message, index) => <div key={index}><label>第 {index + 1} 条消息角色<select value={message.role} onChange={event => patch({ messages: content.messages.map((value, i) => i === index ? { ...value, role: event.target.value } : value) })}><option value="USER">用户</option><option value="ASSISTANT">助手</option></select></label><label>消息内容<textarea required maxLength={4000} value={message.content} onChange={event => patch({ messages: content.messages.map((value, i) => i === index ? { ...value, content: event.target.value } : value) })} /></label></div>)}<button type="button" disabled={content.messages.length >= 20} onClick={() => patch({ messages: [...content.messages, { role: 'ASSISTANT', content: '' }] })}>添加消息（最多 20 条）</button></>}
      <p>只有点击保存才会发送并保存这些内容；情绪记录不会自动加入 AI 上下文。</p>
      <button type="submit">{busy ? '正在保存…' : '确认保存到本人账户'}</button>
      {editing && <button type="button" onClick={() => { setEditing(null); setContent(fresh(kind)); }}>取消编辑</button>}
      </fieldset>
    </form>}
  </section>;
}
