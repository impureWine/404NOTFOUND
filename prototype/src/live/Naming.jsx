import React, { useState } from 'react';
import { apiClient } from '../api/client.js';
export function Naming({ onChoose }) {
  const [words, setWords] = useState([]), [custom, setCustom] = useState(''), [need, setNeed] = useState('LISTEN'), [note, setNote] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const submit = async event => { event.preventDefault(); if (busy) return; setBusy(true); setError(''); try {
    const emotionWords = [...new Set([...words, ...(custom.trim() ? [custom.trim()] : [])])];
    const result = await apiClient.routeNamingCard({ emotionWords, need });
    onChoose(result.requiresQuestion ? 'search' : need === 'ORGANIZE' ? 'things' : 'companion', result.requiresQuestion ? note : `${emotionWords.join('、')}。${note}`);
  } catch (value) { setError(value.message); } finally { setBusy(false); } };
  return <section className="live-records recent-card"><h2>情绪命名卡</h2><p>选词不会保存或自动调用模型。选择需要后，内容进入对应页面的输入框，由你再次确认发送。</p>{error && <p role="alert">{error}</p>}<form onSubmit={submit}><fieldset disabled={busy}><div className="record-tags">{['平静','疲惫','烦躁','担心','失落','期待'].map(word => <button type="button" key={word} aria-pressed={words.includes(word)} disabled={!words.includes(word) && words.length >= 5} onClick={() => setWords(current => current.includes(word) ? current.filter(value => value !== word) : [...current, word])}>{word}</button>)}</div><label>自定义词（可选）<input maxLength={20} value={custom} onChange={event => setCustom(event.target.value)} /></label><label>当前需要<select value={need} onChange={event => setNeed(event.target.value)}><option value="LISTEN">倾听</option><option value="ORGANIZE">梳理</option><option value="SEARCH">查资料</option></select></label><label>{need === 'SEARCH' ? '想查的具体问题（可以到下一页补充）' : '补充一句（可选）'}<textarea maxLength={500} value={note} onChange={event => setNote(event.target.value)} /></label><button>选择并进入</button><button type="button" onClick={() => onChoose('calendar', '')}>进入日历，另行主动记录</button></fieldset></form></section>;
}
