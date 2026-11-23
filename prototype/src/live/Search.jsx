import React, { useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client.js';
import { endSession, id, runTask } from './business.js';

const verificationLabel = value => ({ VERIFIED: '已核对来源信息', PARTIAL: '尚未完整核验', UNAVAILABLE: '来源暂不可用' }[value] || '未经独立核验');
const qualityLabel = value => ({ CURRENT: '时效正常', STALE: '可能已过时', UNKNOWN: '时效未知' }[value] || '时效未标注');
const tierLabel = value => ({ S1: '一级来源', S2: '二级来源', S3: '三级来源', S4: '四级来源', SX: '来源级别未核定' }[value] || '来源级别未标注');
const sourceLink = value => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
};
const retrievedTime = value => {
  const time = new Date(value);
  return value && Number.isFinite(time.getTime()) ? time.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '未标注';
};
const publishedTime = value => {
  const time = new Date(value);
  return value && Number.isFinite(time.getTime()) ? time.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '未标注';
};

export function SearchResults({ result }) {
  return <>
    <p role="status">{result.sources.length ? `找到 ${result.sources.length} 个来源${result.partial ? '，部分来源内容不完整' : ''}` : '没有检索结果，请调整问题。'}</p>
    {result.uncertaintyNote && <p role="note">不确定性：{result.uncertaintyNote}</p>}
    {result.hasConflict && <p role="status">来源存在冲突，请逐条核对原网页；当前结果不能给出一致结论。</p>}
    {result.sources.map((source, index) => {
      const href = sourceLink(source.url);
      return <article key={source.id || source.sourceId || index}>
        <h3>{href ? <a href={href} target="_blank" rel="noreferrer">{source.title || '原始来源'}</a> : <span>{source.title || '原始来源'}（来源链接不可用）</span>}</h3>
        <p>{source.snippet || '来源未提供可用摘录，请查看原网页。'}</p>
        <p>来源：{source.publisher || '未标注'} · 来源级别：{tierLabel(source.sourceTier)} · {qualityLabel(source.quality)}</p>
        <p>发布时间：{publishedTime(source.publishedAt)} · 获取时间（北京时间）：{retrievedTime(source.retrievedAt)} · {verificationLabel(source.verificationState)}</p>
        <p>以上是来源摘录，不能据此确认事实；获取时间不等于网页发布时间。</p>
      </article>;
    })}
  </>;
}

export function Search({ initialText = '' }) {
  const [question, setQuestion] = useState(initialText), [result, setResult] = useState(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [operation, setOperation] = useState(''), [allowed, setAllowed] = useState(false);
  const busy = Boolean(operation);
  const saveId = useRef(null), session = useRef(null), control = useRef(null), live = useRef(true), lock = useRef(false), requestEpoch = useRef(0);
  useEffect(() => { live.current = true; return () => { live.current = false; requestEpoch.current += 1; control.current?.abort(); endSession(session.current).catch(() => {}); }; }, []);
  const submit = async event => {
    event.preventDefault(); if (lock.current || !allowed || !question.trim()) return;
    lock.current = true; setOperation('search'); setError(''); setNotice(''); setResult(null); saveId.current = null;
    const epoch = ++requestEpoch.current;
    const controller = new AbortController(); control.current = controller;
    try {
      if (session.current) await endSession(session.current);
      session.current = await apiClient.createSession({ requestId: id(), mode: 'SEARCH' }, { signal: controller.signal });
      const response = await runTask(session.current, { question: question.trim() }, { signal: controller.signal, search: true });
      if (!Array.isArray(response?.sources)) throw new Error('查询来源响应不完整，请保留问题后重新查询。');
      if (live.current && epoch === requestEpoch.current && !controller.signal.aborted) setResult(response);
    } catch (value) {
      if (live.current && epoch === requestEpoch.current && !controller.signal.aborted) setError(value.message);
    } finally {
      if (live.current && epoch === requestEpoch.current) {
        lock.current = false;
        if (control.current === controller) control.current = null;
        setOperation('');
      }
    }
  };
  const cancelSearch = () => {
    const controller = control.current;
    if (!controller || operation !== 'search') return;
    requestEpoch.current += 1;
    control.current = null;
    controller.abort();
    lock.current = false;
    setResult(null);
    setError('本机已停止等待；服务器取消状态待确认。');
    setNotice('');
    setOperation('');
  };
  const save = async () => {
    if (lock.current || !result?.sources?.length) return;
    lock.current = true; setOperation('save'); setError(''); setNotice('');
    try {
      const payload = { kind: 'QUERY', searchRequestId: result.requestId };
      const consent = await apiClient.createConsent({ requestId: id(), purpose: 'SAVE', operation: 'RECORD_CREATE', payload });
      saveId.current ||= id();
      await apiClient.saveQuery({ requestId: saveId.current, consentId: consent.consentId, searchRequestId: result.requestId });
      if (live.current) setNotice('已保存查询，可在查询记录中回看。');
    } catch (value) { if (live.current) setError(value.message); }
    finally { lock.current = false; if (live.current) setOperation(''); }
  };
  return <section className="live-records recent-card" aria-busy={busy}>
    <h2>信息查询</h2><p>通过 SerpAPI 检索 Bing，展示搜索结果摘录、原网页链接和获取时间；摘录不是独立事实核验，时效与冲突需要结合来源判断。</p>
    <form onSubmit={submit}><label>具体问题<input required maxLength={4000} value={question} disabled={busy} onChange={event => setQuestion(event.target.value)} /></label><label><input type="checkbox" required disabled={busy} checked={allowed} onChange={event => setAllowed(event.target.checked)} />同意将本次问题提交给 SerpAPI，用于 Bing 搜索</label><button disabled={busy || !allowed || !question.trim()}>查询</button></form>
    {!result && !busy && !error && <p role="status">先输入一个具体问题，确认检索授权后查询。</p>}
    {busy && <p role="status">{operation === 'search' ? '正在检索来源，你可以停止本次等待。' : '正在保存本次来源与摘录，请稍候。'}</p>}
    {operation === 'search' && <button type="button" onClick={cancelSearch}>取消查询</button>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {result?.sources?.length > 0 && <button disabled={busy} onClick={save}>主动保存本次来源与摘录</button>}
    {result && <SearchResults result={result} />}
  </section>;
}
