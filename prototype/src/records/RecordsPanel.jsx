import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, CircleHelp, Heart, RefreshCw, Sparkles } from 'lucide-react';
import { apiClient } from '../api/client.js';
import './records.css';
import { clearOwned } from '../live/business.js';
import { FlipCard } from '../components/FlipCard.jsx';

const today = () => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const fresh = kind => kind === 'EMOTION'
  ? { title: '', recordDate: today(), emotionCodes: [], intensity: null, timezoneName: Intl.DateTimeFormat().resolvedOptions().timeZone, note: '' }
  : { title: '', messages: [{ role: 'USER', content: '' }] };
const words = ['平静', '疲惫', '烦躁', '担心', '失落', '期待', '说不清'];
const moodMeta = {
  平静: { emoji: '😌', tone: 'calm', label: '平静' },
  疲惫: { emoji: '😴', tone: 'tired', label: '疲惫' },
  烦躁: { emoji: '😣', tone: 'irritated', label: '烦躁' },
  担心: { emoji: '😟', tone: 'anxious', label: '担心' },
  失落: { emoji: '😔', tone: 'low', label: '失落' },
  期待: { emoji: '🙂', tone: 'hopeful', label: '期待' },
  说不清: { emoji: '🌫️', tone: 'unclear', label: '说不清' },
};
const emotionMeta = record => moodMeta[record?.content?.emotionCodes?.[0]] || moodMeta['说不清'];
const formatMonth = month => {
  const [year, value] = month.split('-').map(Number);
  return `${year} 年 ${value} 月`;
};
const localDateLabel = value => value ? value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$2 月 $3 日') : '';

export function RecordsPanel({ kind, readOnly = false, onLogin }) {
  const [items, setItems] = useState([]), [cursor, setCursor] = useState(null);
  const [selectedDay, setSelectedDay] = useState('');
  const [flippedDay, setFlippedDay] = useState(null);
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
    if (readOnly) {
      setItems([]); setCursor(null); setDetail(null); setError(''); setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    const generation = ++epoch.current;
    setItems([]); setCursor(null); setDetail(null); setError(''); setLoading(true);
    apiClient.listRecords(query(), { signal: controller.signal }).then(async result => {
      const records = emotion ? await Promise.all(result.items.map(item => apiClient.getRecord(item.id, { signal: controller.signal }))) : result.items;
      if (generation === epoch.current && !controller.signal.aborted) { setItems(records); setCursor(result.nextCursor); }
    }).catch(value => { if (!controller.signal.aborted) setError(value.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); ++epoch.current; };
  }, [kind, month, revision, readOnly]);

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
    if (readOnly) return;
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
  const monthParts = month.match(/^(\d{4})-(\d{2})$/);
  const year = monthParts ? Number(monthParts[1]) : new Date().getFullYear();
  const monthNumber = monthParts ? Number(monthParts[2]) : new Date().getMonth() + 1;
  const dayCount = new Date(year, monthNumber, 0).getDate();
  const firstWeekday = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;
  const dayRecords = new Map();
  items.filter(item => emotion && item.content?.recordDate).forEach(item => {
    const current = dayRecords.get(item.content.recordDate) || [];
    dayRecords.set(item.content.recordDate, [...current, item]);
  });
  const visibleItems = items.filter(item => !emotion || !selectedDay || item.content.recordDate === selectedDay);
  const selectedRecords = selectedDay ? dayRecords.get(selectedDay) || [] : [];
  const recordedDays = dayRecords.size;
  const monthLabel = formatMonth(month);
  const changeMonth = offset => {
    const next = new Date(year, monthNumber - 1 + offset, 1);
    const value = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    setMonth(value); setSelectedDay(''); setFlippedDay(null); setEditing(null);
  };
  const chooseDay = date => {
    setSelectedDay(date);
    setFlippedDay(value => value === date ? null : date);
    if (!readOnly && !editing) patch({ recordDate: date });
  };
  const renderDayFront = (date, records) => {
    const record = records[0];
    const meta = emotionMeta(record);
    return <><span className="calendar-day-number">{Number(date.slice(-2))}</span><span className={`calendar-day-mood ${meta.tone}`}>{records.length ? meta.emoji : <CalendarDays size={15} aria-hidden="true" />}</span><span className="calendar-day-caption">{records.length ? meta.label : readOnly ? '预览' : '记录心情'}</span></>;
  };
  const renderDayBack = (date, records) => {
    const record = records[0];
    const meta = emotionMeta(record);
    return <><span className="calendar-day-back-date">{localDateLabel(date)}</span>{records.length ? <><strong>{meta.emoji} {meta.label}</strong><span>{record.content.intensity ? `强度 ${record.content.intensity} / 5` : '强度未填写'}</span><small>{record.content.note || '没有补充备注'}</small></> : <><strong>{readOnly ? '访客预览' : '还没有记录'}</strong><span>{readOnly ? '无法读取本人记录' : '点击可将日期带入下方表单'}</span></>}</>;
  };
  return <section className="live-records recent-card">
    <div className="section-heading"><h3>{emotion ? '情绪日历' : '陪伴记录'}</h3><span>{readOnly ? '访客预览 · 不读取个人记录' : '本人账户 · 真实服务'}</span></div>
    {readOnly && <div className="calendar-guest-notice" role="status"><span><CalendarDays size={16} />访客预览</span><p>当前只展示日历界面和交互样式；登录并连接服务后，才会读取、保存和编辑本人记录。</p><button type="button" onClick={onLogin}>登录或注册</button></div>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {emotion && <div className="calendar-toolbar">
      <label className="calendar-month-picker"><span>查看月份</span><input aria-label="查看月份" type="month" required value={month} disabled={busy} onChange={event => { if (event.target.value) { setMonth(event.target.value); setSelectedDay(''); setFlippedDay(null); } }} /></label>
      {!readOnly && <button className="calendar-refresh" type="button" disabled={busy || loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} />重新读取</button>}
    </div>}
    {!emotion && <button type="button" disabled={busy || loading} onClick={() => setRevision(value => value + 1)}>重新读取</button>}
    {loading && <p role="status">正在从服务端读取…</p>}
    {!loading && !items.length && !emotion && <p>暂无主动保存的记录。</p>}
    {emotion && <div className="calendar-layout">
      <section className="calendar-month-card" aria-label={`${monthLabel}情绪日历`}>
        <div className="calendar-card-heading"><div><span className="calendar-eyebrow">每天留下一点痕迹</span><h4>{monthLabel}</h4></div><div className="calendar-month-actions"><button type="button" aria-label="上一个月" onClick={() => changeMonth(-1)} disabled={busy}><ChevronLeft size={18} /></button><button type="button" aria-label="下一个月" onClick={() => changeMonth(1)} disabled={busy}><ChevronRight size={18} /></button></div></div>
        <div className="calendar-legend"><span><i className="legend-dot calm" />平静</span><span><i className="legend-dot tired" />疲惫</span><span><i className="legend-dot anxious" />担心</span><span><i className="legend-dot low" />失落</span></div>
        <div className="calendar-weekdays">{['一', '二', '三', '四', '五', '六', '日'].map(value => <span key={value}>{value}</span>)}</div>
        <div className="calendar-cards-grid" aria-label="本月日期">{Array.from({ length: firstWeekday + dayCount }, (_, index) => {
          if (index < firstWeekday) return <span className="calendar-day-empty" key={`empty-${index}`} aria-hidden="true" />;
          const date = `${month}-${String(index - firstWeekday + 1).padStart(2, '0')}`;
          const records = dayRecords.get(date) || [];
          return <FlipCard key={date} className={`calendar-day-card ${selectedDay === date ? 'is-selected' : ''} ${records.length ? 'has-record' : 'is-blank'}`} flipped={flippedDay === date} onFlip={() => chooseDay(date)} label={`${date}日历卡`} front={renderDayFront(date, records)} back={renderDayBack(date, records)} />;
        })}</div>
        <p className="calendar-help"><CircleHelp size={15} />{readOnly ? '点击日期卡片翻面预览；访客模式不读取或保存个人记录。' : '点击日期卡片翻面查看记录；颜色只代表你选择的描述，不是评估结果。'}</p>
      </section>
      <aside className="calendar-side-stack">
        <section className="calendar-summary-card"><div className="calendar-summary-icon"><Sparkles size={17} /></div><div><span className="calendar-eyebrow">本月概览</span><strong>{readOnly || error ? '—' : `${recordedDays} / ${dayCount} 天`}</strong><p>{readOnly ? '连接服务并登录后显示' : error ? '读取失败不代表没有记录' : recordedDays ? '已加载本人主动记录' : '这个月还可以从今天开始'}</p></div></section>
        <section className="calendar-selected-card"><div className="calendar-card-heading"><div><span className="calendar-eyebrow">选中的一天</span><h4>{selectedDay ? localDateLabel(selectedDay) : '点击一张日历卡'}</h4></div><Heart size={19} /></div>{selectedRecords.length ? <p>{selectedRecords[0].content.note || '这一天没有补充备注。'}</p> : <p>{readOnly ? '这是只读空状态预览。登录并连接服务后，才会读取这一天的本人记录。' : '选择日期后，可以在下方表单记录心情。空白日子也值得被保留。'}</p>}<button type="button" className="calendar-link-button" onClick={() => { setSelectedDay(''); setEditing(null); setFlippedDay(null); }}>查看整月</button></section>
      </aside>
    </div>}
    {!readOnly && <ul className="live-record-list">{visibleItems.map(item => <li key={item.id}>
      <button type="button" onClick={() => view(item)}>{item.content?.recordDate || new Date(item.createdAt).toLocaleDateString()} · {item.title}</button>
      <button type="button" disabled={busy} onClick={async () => { if (locked.current) return; locked.current = true; setBusy(true); setError(''); try { if (await clearOwned(item)) { setDetail(null); setRevision(value => value + 1); } } catch (value) { setError(value.message); } finally { locked.current = false; setBusy(false); } }}>清除此条</button>
      {emotion && <><p>{item.content.emotionCodes.join('、') || '未命名'} · 强度：{item.content.intensity ?? '跳过'}</p><p>{item.content.note}</p>
        <button type="button" disabled={busy} onClick={() => { setEditing(item); setContent({ title: item.title, ...item.content }); setDetail(null); }}>编辑</button></>}
    </li>)}</ul>}
    {cursor && <button type="button" disabled={loading || busy} onClick={more}>加载更多</button>}
    {detail && <section aria-label="记录详情"><h4>{detail.title}</h4>{detail.content?.messages?.map((message, index) => <p className="record-message" key={index}><strong>{message.role === 'USER' ? '用户' : '助手'}：</strong>{message.content}</p>)}{detail.content?.recordDate && <p>{detail.content.recordDate} · {detail.content.note}</p>}<button type="button" onClick={() => setDetail(null)}>关闭详情</button></section>}
    {emotion && !readOnly && <form className="calendar-editor" onSubmit={save}><h4>{editing ? '编辑情绪记录' : '记录这一天'}</h4>
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
