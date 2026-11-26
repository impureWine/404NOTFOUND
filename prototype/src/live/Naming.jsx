import React, { useState } from 'react';
import { apiClient } from '../api/client.js';
export function Naming({ onChoose }) {
  const [words, setWords] = useState([]), [custom, setCustom] = useState(''), [need, setNeed] = useState('LISTEN'), [note, setNote] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const submit = async event => { event.preventDefault(); if (busy) return; setBusy(true); setError(''); try {
    const emotionWords = [...new Set([...words, ...(custom.trim() ? [custom.trim()] : [])])];
    const result = await apiClient.routeNamingCard({ emotionWords, need });
    onChoose(result.requiresQuestion ? 'search' : need === 'ORGANIZE' ? 'things' : 'companion', result.requiresQuestion ? note : `${emotionWords.join('、')}。${note}`);
  } catch (value) { setError(value.message); } finally { setBusy(false); } };
  return <section className="live-records workspace-tool">
    <header className="workspace-tool-heading"><h2>情绪命名卡</h2><p>先给感受取个名字，再选择接下来需要的帮助。</p></header>
    {error && <p className="workspace-tool-feedback" role="alert">{error}</p>}
    <form className="workspace-tool-panel workspace-tool-editor" onSubmit={submit}>
      <fieldset className="workspace-tool-fields" disabled={busy}>
        <div className="workspace-tool-words" role="group" aria-labelledby="emotion-words-title">
          <h3 id="emotion-words-title">此刻的感受</h3><div className="record-tags">{['平静','疲惫','烦躁','担心','失落','期待'].map(word => <button type="button" key={word} aria-pressed={words.includes(word)} disabled={!words.includes(word) && words.length >= 5} onClick={() => setWords(current => current.includes(word) ? current.filter(value => value !== word) : [...current, word])}>{word}</button>)}</div></div>
        <div className="workspace-tool-field-grid"><label>自定义词（可选）<input maxLength={20} value={custom} onChange={event => setCustom(event.target.value)} /></label><label>当前需要<select value={need} onChange={event => setNeed(event.target.value)}><option value="LISTEN">倾听</option><option value="ORGANIZE">梳理</option><option value="SEARCH">查资料</option></select></label></div>
        <label>{need === 'SEARCH' ? '想查的具体问题（可以到下一页补充）' : '补充一句（可选）'}<textarea maxLength={500} value={note} onChange={event => setNote(event.target.value)} /></label>
        <p className="workspace-tool-note">选词只带入下一页的输入框。由你确认发送或另行记录。</p>
        <div className="workspace-tool-actions">
          <button type="submit" className="workspace-tool-primary">选择并进入</button>
          <button type="button" onClick={() => onChoose('calendar', '')}>进入日历，另行主动记录</button>
        </div>
      </fieldset>
    </form>
  </section>;
}
