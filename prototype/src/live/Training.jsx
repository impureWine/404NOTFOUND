import React, { useEffect, useRef, useState } from 'react';
import { TrainingController, trainingDefinitions, bindTrainingLifecycle } from './training-controller.js';
import './training.css';

const blankTask = () => ({ title: '', prepared: '', small: '', help: '' });
const clockText = milliseconds => `${Math.floor(milliseconds / 60000)}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')}`;
export function Training({ definition = 'FIVE_SENSES', onExit = () => {}, onOrganize = () => {} }) {
  const spec = trainingDefinitions[definition];
  const controllerRef = useRef(null);
  if (!controllerRef.current && spec) controllerRef.current = new TrainingController(definition);
  const controller = controllerRef.current;
  const [session, setSession] = useState(() => controller?.snapshot());
  const [duration, setDuration] = useState(60), [rhythm, setRhythm] = useState({ inhale: 4, hold: 0, exhale: 6 });
  const [answers, setAnswers] = useState(() => spec?.steps.map(() => '') || []);
  const [task, setTask] = useState(blankTask), [steps, setSteps] = useState([]);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [copyFallback, setCopyFallback] = useState('');
  const live = useRef(true);
  const erase = () => { setAnswers(spec.steps.map(() => '')); setTask(blankTask()); setSteps([]); setCopyFallback(''); };
  useEffect(() => {
    if (!controller) return;
    live.current = true;
    const unsubscribe = controller.subscribe(setSession);
    const unbind = bindTrainingLifecycle(controller, {
      onPause: () => setNotice('页面已隐藏，练习自动暂停。返回后请主动继续。'),
      onStop: erase,
    });
    return () => { live.current = false; unsubscribe(); unbind(); };
  }, [controller]);
  if (!spec || !session) return <section className="live-records recent-card"><h2>训练内容暂不可用</h2><button onClick={onExit}>返回选择其他练习</button></section>;
  const running = session.state === 'running', paused = session.state === 'paused', finished = session.state === 'completed';
  const started = running || paused;
  const hasDraft = answers.some(value => value.trim()) || Object.values(task).some(value => value.trim()) || steps.length > 0;
  const invoke = callback => { setError(''); setNotice(''); try { callback(); } catch (value) { setError(value.message); } };
  const reset = () => {
    if (hasDraft && !window.confirm('重来会清空本次填写，确认重来？')) return;
    erase(); controller.reset(); setError(''); setNotice('');
  };
  const exit = () => {
    if (hasDraft && !window.confirm('退出会清空本次未保存的填写，确认退出？')) return;
    controller.stop(); erase(); setNotice('练习已停止，本次临时内容已清空。'); onExit();
  };
  const updateTask = (key, value) => setTask(current => ({ ...current, [key]: value }));
  const addAnswers = () => {
    const values = [task.prepared, task.small, task.help].map(value => value.trim()).filter(Boolean);
    if (!values.length) { setError('先填写一项内容，或直接新增步骤。'); return; }
    if (steps.length + values.length > 20) { setError('最多保留 20 个步骤，请先整理已有步骤。'); return; }
    setSteps(current => [...current, ...values.map(text => ({ id: crypto.randomUUID(), text }))]);
    setTask(current => ({ ...current, prepared: '', small: '', help: '' })); setError('');
  };
  const finishTask = () => {
    const pending = [task.prepared, task.small, task.help].map(value => value.trim()).filter(Boolean);
    const result = [...steps.map(step => ({ ...step, text: step.text.trim() })), ...pending.map(text => ({ id: crypto.randomUUID(), text }))];
    if (!task.title.trim()) { setError('请先写下要拆分的事情。'); return; }
    if (!result.length || result.some(step => !step.text)) { setError('至少填写一个小步骤；空白步骤请补充或移除。'); return; }
    if (result.length > 20) { setError('最多保留 20 个步骤。'); return; }
    setSteps(result); setTask(current => ({ ...current, prepared: '', small: '', help: '' })); setError(''); controller.complete();
  };
  const move = (index, delta) => setSteps(current => { const result = [...current]; [result[index], result[index + delta]] = [result[index + delta], result[index]]; return result; });
  const resultText = `${task.title.trim()}\n${steps.map((step, index) => `${index + 1}. ${step.text}`).join('\n')}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(resultText); if (live.current) setNotice('已复制本次整理的文本。'); }
    catch { if (live.current) { setCopyFallback(resultText); setNotice('浏览器没有允许复制，可在下方手动选择文本复制。'); } }
  };
  const toAI = () => {
    const text = [task.title.trim(), ...steps.map(step => step.text), task.prepared, task.small, task.help].filter(Boolean).join('\n');
    if (!text) { setError('先填写你明确想交给 AI 整理的内容。'); return; }
    if (Array.from(text).length > 4000) { setError('当前内容超过 4000 字，请减少内容后再进入 AI 整理。'); return; }
    controller.stop(); onOrganize(text);
  };
  let scale = 1;
  if (session.phase?.id === 'inhale') scale = 1 + session.phase.progress * .25;
  if (session.phase?.id === 'hold') scale = 1.25;
  if (session.phase?.id === 'exhale') scale = 1.25 - session.phase.progress * .25;
  const phaseTitle = finished ? '练习完成' : paused ? '已暂停' : running ? session.phase?.title : '准备开始';
  return <section className="live-records recent-card training-panel">
    <header className="training-heading"><div><span className="training-kicker">短时练习 · 由你决定节奏</span><h2>{spec.title}</h2><p>{spec.description}</p></div><span className="training-duration">{spec.durationHint}</span></header>
    <p className="training-privacy">填写内容只在本页临时使用，不上传、不自动保存到个人记录或日历。</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="training-status" role="status"><span>{({ ready: '尚未开始', running: '进行中', paused: '已暂停', completed: '已完成', exited: '已退出' })[session.state]}</span><span>用时 {clockText(session.elapsedMs)}</span>{spec.type === 'guided' && started && <span>第 {session.stepIndex + 1} / {spec.steps.length} 步</span>}</div>
    {spec.type === 'breathing' ? <div className="training-breath-layout">
      <div className="training-breath-visual"><div className="training-breath-orbit" style={{ transform: `scale(${scale})` }} aria-hidden="true" /><div className="training-breath-label"><strong>{phaseTitle}</strong><span>{running ? `${Math.ceil(session.phase.remainingMs / 1000)} 秒` : paused ? `停在${session.phase.title}阶段` : finished ? '可以停在这里' : '点击开始后才会计时'}</span></div></div>
      <div><fieldset disabled={session.state !== 'ready'}><legend>节奏与时长</legend><label>练习时长<select value={duration} onChange={event => setDuration(Number(event.target.value))}>{spec.durations.map(seconds => <option key={seconds} value={seconds}>{seconds / 60} 分钟</option>)}</select></label><div className="training-rhythm">{[['inhale','吸气',1],['hold','停留（0 为跳过）',0],['exhale','呼气',1]].map(([key,label,min]) => <label key={key}>{label}（秒）<input type="number" min={min} max="8" step="1" value={rhythm[key]} onChange={event => setRhythm(current => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}</div></fieldset><p>剩余 {clockText(Math.max(0, (session.state === 'ready' ? duration * 1000 : session.durationMs) - session.elapsedMs))} · 完成 {session.phase.cycles} 轮 · 声音关闭</p><progress aria-label="呼吸练习进度" value={session.elapsedMs} max={session.durationMs} /><p>停留可以设为 0；不用追求深呼吸或憋气。减少动态效果时仍显示阶段与倒计时。</p></div>
    </div> : spec.type === 'guided' ? <>
      <progress aria-label="观察或整理进度" value={finished ? spec.steps.length : session.stepIndex} max={spec.steps.length} />
      {started ? <div className="training-guided"><span className="training-step-number">{String(session.stepIndex + 1).padStart(2,'0')}</span><h3>{spec.steps[session.stepIndex].title}</h3><p>{spec.steps[session.stepIndex].instruction}</p><label>可选填写，也可以只在心中完成<textarea disabled={!running} maxLength={500} value={answers[session.stepIndex]} placeholder={spec.id === 'FIVE_SENSES' ? `最多留意 ${spec.steps[session.stepIndex].count} 项，不需要全部填写` : '只写下你愿意在本次整理中使用的内容'} onChange={event => setAnswers(current => current.map((value,index) => index === session.stepIndex ? event.target.value : value))} /></label><div className="training-actions"><button disabled={!running || session.stepIndex === 0} onClick={() => controller.previous()}>上一步</button><button disabled={!running} onClick={() => controller.next()}>{session.stepIndex === spec.steps.length - 1 ? '完成练习' : '完成这一步，继续'}</button><button disabled={!running} onClick={() => controller.next()}>跳过这一步</button></div></div> : finished ? <div className="training-result"><h3>{spec.id === 'PAUSE_ORGANIZE' ? '本次整理结果' : '已走完本次观察步骤'}</h3><p>没有自动分析、评分或保存。可以停在这里，也可以回看本次填写。</p>{spec.steps.map((step,index) => <div className="training-answer" key={step.stepId}><strong>{step.title}</strong><p>{answers[index] || '未填写 / 已跳过'}</p></div>)}<button onClick={() => controller.edit()}>返回修改（先暂停）</button><button onClick={() => { if (window.confirm('确认清空本次填写？')) erase(); }}>清空本次填写</button></div> : <ol className="training-preview">{spec.steps.map(step => <li key={step.stepId}>{step.title}</li>)}</ol>}
    </> : <>
      {(started || finished) && <div className="training-task-layout">{!finished && <fieldset disabled={!running}><legend>先说说这件事</legend>{[['title','你想拆分的事情是什么？',100],['prepared','最先要准备什么？',300],['small','可以在 10 分钟内开始哪一步？',300],['help','是否需要向谁确认或求助？（可跳过）',300]].map(([key,label,max]) => <label key={key}>{label}<textarea rows={key === 'title' ? 1 : 2} maxLength={max} value={task[key]} onChange={event => updateTask(key,event.target.value)} /></label>)}<button onClick={addAnswers}>把填写内容加入步骤列表</button></fieldset>}<div><h3>{finished ? task.title : '可编辑的小步骤'}</h3>{!steps.length && <p>从一个足够小的动作开始，不会自动生成虚构步骤。</p>}<ol className="training-task-list">{steps.map((step,index) => <li key={step.id}>{finished ? <span>{step.text}</span> : <><input disabled={!running} maxLength={300} aria-label={`步骤 ${index + 1}`} value={step.text} onChange={event => setSteps(current => current.map(value => value.id === step.id ? { ...value, text: event.target.value } : value))} /><button disabled={!running || index === 0} aria-label={`步骤 ${index + 1} 上移`} onClick={() => move(index,-1)}>↑</button><button disabled={!running || index === steps.length - 1} aria-label={`步骤 ${index + 1} 下移`} onClick={() => move(index,1)}>↓</button><button disabled={!running} aria-label={`移除步骤 ${index + 1}`} onClick={() => setSteps(current => current.filter(value => value.id !== step.id))}>移除</button></>}</li>)}</ol>{!finished ? <><button disabled={!running || steps.length >= 20} onClick={() => setSteps(current => [...current, { id: crypto.randomUUID(), text: '' }])}>新增步骤</button><button disabled={!running} onClick={finishTask}>完成整理</button></> : <><button onClick={copy}>复制整理结果</button><button onClick={() => controller.edit()}>返回编辑（先暂停）</button></>}<button disabled={paused} onClick={toAI}>将当前内容带到 AI 整理，下一页确认发送</button>{copyFallback && <label>可手动复制的整理文本<textarea readOnly value={copyFallback} /></label>}</div></div>}
      {session.state === 'ready' && <p>开始后填写任务并编辑步骤；可新增、修改、移除和调整顺序，完成后复制结果。</p>}
    </>}
    <div className="training-actions training-main-actions">{session.state === 'ready' && <button className="training-primary" onClick={() => invoke(() => controller.start({ durationSeconds: duration, rhythm }))}>开始练习</button>}{running && <button onClick={() => controller.pause()}>暂停</button>}{paused && <button className="training-primary" onClick={() => invoke(() => controller.resume())}>继续</button>}{session.state !== 'ready' && <button onClick={reset}>{finished ? '再做一次' : '重来'}</button>}<button onClick={exit}>{finished ? '完成并返回' : '退出练习'}</button></div>
  </section>;
}
