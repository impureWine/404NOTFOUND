import React, { useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client.js';
import { endSession, id, runTask, saveContent } from './business.js';

export function Dialogue({ mode = 'LISTEN', initialText = '' }) {
  const [draft, setDraft] = useState(initialText), [messages, setMessages] = useState([]);
  const [context, setContext] = useState(false), [allowed, setAllowed] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [simulation, setSimulation] = useState({ scene: '', counterpart: '', goal: '', style: '尊重、自然，不假装预测真实人物' });
  const [history, setHistory] = useState([]), [historyIds, setHistoryIds] = useState([]), [historyCursor, setHistoryCursor] = useState(null);
  const [selected, setSelected] = useState([]);
  const session = useRef(null), controller = useRef(null), live = useRef(true), lock = useRef(false), saveRequest = useRef(null);
  useEffect(() => { live.current = true; return () => { live.current = false; controller.current?.abort(); endSession(session.current).catch(() => {}); }; }, []);
  const send = async (event, summarize = false) => {
    event?.preventDefault(); if (lock.current || !allowed) return;
    let selectedText = summarize ? messages.filter(message => selected.includes(message.id)).map(message => message.content).join('\n') : draft.trim();
    if (context && !summarize) selectedText = [...messages.map(message => `${message.role === 'USER' ? '用户' : '助手'}：${message.content}`), `用户：${selectedText}`].join('\n');
    if (!selectedText || Array.from(selectedText).length > 4000) { setError('本轮明确提交的内容需为 1～4000 字；可关闭携带对话或缩短内容。'); return; }
    lock.current = true; setBusy(true); setError(''); setNotice('');
    const control = new AbortController(); controller.current = control;
    try {
      if (!session.current) session.current = await apiClient.createSession({ requestId: id(), mode }, { signal: control.signal });
      const operation = summarize ? 'REHEARSAL_SUMMARIZE' : mode === 'REHEARSE' ? 'REHEARSAL_REPLY' : 'REPLY';
      const result = await runTask(session.current, { mode, operation, selectedText, selectedContextIds: historyIds,
        ...(mode === 'REHEARSE' ? { simulation } : {}), ...(summarize ? { recognizedMessageIds: selected } : {}) }, { signal: control.signal });
      if (!live.current || control.signal.aborted) return;
      const text = summarize ? '整理我已选择的表达' : draft.trim();
      setMessages(current => [...current, { id: result.result.userMessageId, role: 'USER', content: text }, { id: result.result.replyMessageId, role: 'ASSISTANT', content: result.result.text, safety: result.result.safety }]);
      if (!summarize) setDraft('');
    } catch (value) { if (live.current) setError(value.name === 'AbortError' ? '已停止等待；不会回填迟到结果。' : value.message); }
    finally { lock.current = false; if (live.current) setBusy(false); }
  };
  const save = async () => {
    if (lock.current || !messages.length) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const content = { title: mode === 'REHEARSE' ? '我的排练表达' : mode === 'ORGANIZE' ? '事情整理' : '陪伴交流', ...(mode === 'REHEARSE' ? { scene: simulation.scene, expressions: messages.filter(message => selected.includes(message.id)).map(message => message.content) } : { messages: messages.map(({ role, content: text }) => ({ role, content: text })) }) };
      if (mode === 'REHEARSE' && !content.expressions.length) throw new Error('先勾选你认可的本人表达，再保存。');
      const fingerprint = JSON.stringify(content);
      if (saveRequest.current?.fingerprint !== fingerprint) saveRequest.current = { fingerprint, id: id() };
      await saveContent(mode === 'REHEARSE' ? 'REHEARSAL_DRAFT' : 'CONVERSATION', content, saveRequest.current.id);
      if (live.current) setNotice('已由服务端确认保存，可在记录中回看。');
    } catch (value) { if (live.current) setError(value.message); }
    finally { lock.current = false; if (live.current) setBusy(false); }
  };
  const act = async action => {
    if (!session.current || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { session.current = await apiClient.actOnSession(session.current.sessionId, { requestId: id(), action, expectedSessionGeneration: session.current.sessionGeneration, expectedActivityGeneration: session.current.activityGeneration });
      if (action === 'END' || action === 'RESTART') { setMessages([]); setSelected([]); setHistoryIds([]); setDraft(''); saveRequest.current = null; }
      if (action === 'END') session.current = null;
      setNotice(`已完成：${action === 'END' ? '结束并清空本次临时内容' : action === 'PAUSE' ? '暂停' : action === 'RESUME' ? '继续' : '重来'}`);
    } catch (value) { setError(value.message); } finally { lock.current = false; setBusy(false); }
  };
  return <section className="live-records recent-card"><h2>{mode === 'REHEARSE' ? '平行宇宙排练室' : mode === 'ORGANIZE' ? '事情整理' : '陪伴交流'}</h2>
    <p>访客可以查看并填写本页；发送需要可用的模型服务，默认不保存。</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <form onSubmit={send}><fieldset disabled={busy}>
      {mode === 'REHEARSE' && Object.entries({ scene: '场景', counterpart: '对方角色', goal: '本次目标', style: '对话风格' }).map(([key, label]) => <label key={key}>{label}<input required maxLength={key === 'goal' ? 1000 : key === 'style' ? 200 : 80} value={simulation[key]} onChange={event => setSimulation(current => ({ ...current, [key]: event.target.value }))} /></label>)}
      <div role="log" aria-live="polite">{messages.map(message => <div className="record-message" key={message.id}><strong>{message.role === 'USER' ? '你' : message.safety ? '安全提示' : 'AI'}：</strong>{message.content}{mode === 'REHEARSE' && message.role === 'USER' && <label><input type="checkbox" checked={selected.includes(message.id)} onChange={event => setSelected(current => event.target.checked ? [...current, message.id] : current.filter(value => value !== message.id))} />认可并选择这句表达</label>}</div>)}</div>
      <button type="button" onClick={async () => { try { const result = await apiClient.listRecords({ kind: 'CONVERSATION', limit: 20, ...(historyCursor ? { cursor: historyCursor } : {}) }); if (live.current) { setHistory(current => historyCursor ? [...current, ...result.items] : result.items); setHistoryCursor(result.nextCursor); } } catch (value) { if (live.current) setError(value.message); } }}>{historyCursor ? '加载更多本人对话记录' : '选择本人已保存的对话'}</button>
      {history.map(record => <label key={record.id}><input type="checkbox" checked={historyIds.includes(record.id)} onChange={event => setHistoryIds(current => event.target.checked ? [...current, record.id] : current.filter(value => value !== record.id))} />本轮携带：{record.title}</label>)}
      <label>本次输入<textarea required maxLength={4000} value={draft} onChange={event => setDraft(event.target.value)} /></label>
      <label><input type="checkbox" checked={context} onChange={event => setContext(event.target.checked)} />本轮同时发送上方临时对话（最多 4000 字）</label>
      <label><input type="checkbox" required checked={allowed} onChange={event => setAllowed(event.target.checked)} />同意将本次明确选择的内容发送给模型处理</label>
      <button type="submit" disabled={!allowed || !draft.trim() || session.current?.state === 'paused'}>发送</button>
      {mode === 'REHEARSE' && <button type="button" disabled={!selected.length || !allowed} onClick={event => send(event, true)}>整理所选本人表达</button>}
      <button type="button" disabled={!messages.length || messages.length > 20} onClick={save}>主动保存{mode === 'REHEARSE' ? '所选表达' : '本次对话'}</button>
      {session.current && <><button type="button" onClick={() => act(session.current.state === 'paused' ? 'RESUME' : 'PAUSE')}>{session.current.state === 'paused' ? '继续' : '暂停'}</button><button type="button" onClick={() => act('RESTART')}>重来</button><button type="button" onClick={() => act('END')}>结束并清空</button></>}
    </fieldset></form>{busy && <button type="button" onClick={() => controller.current?.abort()}>停止本次请求</button>}
  </section>;
}
