import React, { useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client.js';
import { endSession, id, runTask } from './business.js';
export function Search({ initialText = '' }) {
  const [question, setQuestion] = useState(initialText), [result, setResult] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [allowed, setAllowed] = useState(false);
  const saveId = useRef(null), session = useRef(null), control = useRef(null), live = useRef(true), lock = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; control.current?.abort(); endSession(session.current).catch(() => {}); }; }, []);
  const submit = async event => {
    event.preventDefault(); if (lock.current || !allowed || !question.trim()) return;
    lock.current = true; setBusy(true); setError(''); setResult(null); saveId.current = null; const controller = new AbortController(); control.current = controller;
    try {
      if (session.current) await endSession(session.current);
      session.current = await apiClient.createSession({ requestId: id(), mode: 'SEARCH' }, { signal: controller.signal });
      const response = await runTask(session.current, { question: question.trim() }, { signal: controller.signal, search: true });
      if (live.current && !controller.signal.aborted) setResult(response);
    } catch (value) { if (live.current) setError(value.name === 'AbortError' ? '查询已取消。' : value.message); }
    finally { lock.current = false; if (live.current) setBusy(false); }
  };
  return <section className="live-records recent-card"><h2>信息查询</h2><p>检索 Wikipedia，展示实际来源摘录和获取时间；摘录不是独立事实核验，时效与冲突需要结合来源判断。</p>
    <form onSubmit={submit}><label>具体问题<input required maxLength={4000} value={question} disabled={busy} onChange={event => setQuestion(event.target.value)} /></label><label><input type="checkbox" required checked={allowed} onChange={event => setAllowed(event.target.checked)} />同意将本次问题提交给检索服务</label><button disabled={busy || !allowed}>查询</button></form>
    {busy && <button onClick={() => control.current?.abort()}>取消查询</button>}{error && <p role="alert">{error}</p>}
    {result?.sources?.length > 0 && <button disabled={busy} onClick={async () => { if (lock.current) return; lock.current = true; setBusy(true); setError(''); try { const payload = { kind: 'QUERY', searchRequestId: result.requestId }; const consent = await apiClient.createConsent({ requestId: id(), purpose: 'SAVE', operation: 'RECORD_CREATE', payload }); saveId.current ||= id(); await apiClient.saveQuery({ requestId: saveId.current, consentId: consent.consentId, searchRequestId: result.requestId }); if (live.current) setError('已保存查询，可在查询记录中回看。'); } catch (value) { if (live.current) setError(value.message); } finally { lock.current = false; if (live.current) setBusy(false); } }}>主动保存本次来源与摘录</button>}
    {result && <><p>{result.sources?.length ? `找到 ${result.sources.length} 个来源${result.partial ? '，部分来源内容不完整' : ''}` : '没有检索结果，请调整问题。'}</p>{result.sources?.map(source => <article key={source.id}><h3><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></h3><p>{source.snippet || '来源未提供可用摘录。'}</p><small>获取时间：{source.retrievedAt} · 状态：{source.verificationState}</small></article>)}</>}
  </section>;
}
