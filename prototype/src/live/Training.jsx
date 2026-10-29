import React, { useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client.js';
import { id } from './business.js';
export function Training({ definition = 'FIVE_SENSES' }) {
  const [training, setTraining] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [tick, setTick] = useState(0);
  const current = useRef(null), alive = useRef(true), locked = useRef(false), observed = useRef(Date.now());
  useEffect(() => { alive.current = true; return () => { alive.current = false; const value = current.current; if (value && ['running', 'paused'].includes(value.state)) apiClient.actOnTraining(value.trainingSessionId, { requestId: id(), action: 'EXIT', expectedVersion: value.version }).catch(() => {}); }; }, []);
  useEffect(() => { if (training?.state !== 'running') return; const timer = setInterval(() => setTick(Date.now()), 1000); return () => clearInterval(timer); }, [training?.state]);
  const action = async type => {
    if (locked.current) return; locked.current = true; setBusy(true); setError('');
    try { const result = type === 'START' ? await apiClient.startTraining({ requestId: id(), definitionId: definition }) : await apiClient.actOnTraining(training.trainingSessionId, { requestId: id(), action: type, expectedVersion: training.version });
      if (!alive.current && ['running', 'paused'].includes(result.state)) await apiClient.actOnTraining(result.trainingSessionId, { requestId: id(), action: 'EXIT', expectedVersion: result.version }).catch(() => {});
      if (alive.current) { current.current = result; observed.current = Date.now(); setTick(Date.now()); setTraining(result); }
    } catch (value) { if (alive.current) setError(value.message); } finally { locked.current = false; if (alive.current) setBusy(false); }
  };
  return <section className="live-records recent-card"><h2>{training?.title || ({ FIVE_SENSES: '五感安定', BREATHING: '呼吸调节', PAUSE_ORGANIZE: '暂停整理', TASK_SPLIT: '任务拆分' })[definition]}</h2><p>由你开始、推进和结束。不适时可随时停止。</p>{error && <p role="alert">{error}</p>}
    {!training || ['completed', 'exited'].includes(training.state) ? <><p>{training?.state === 'completed' ? '练习已完成。' : training?.state === 'exited' ? '练习已退出。' : '尚未开始。'}</p><button disabled={busy} onClick={() => action('START')}>开始</button></> : <><p>状态：{({ running: '进行中', paused: '已暂停', completed: '已完成', exited: '已退出' })[training.state]} · 第 {training.stepIndex + 1}/{training.totalSteps} 步 · 用时 {Math.floor((training.elapsedMs + (training.state === 'running' ? Math.max(0, tick - observed.current) : 0)) / 1000)} 秒</p><h3>{training.step?.title}</h3><p>{training.step?.instruction}</p><button disabled={busy || training.state !== 'running'} onClick={() => action('NEXT')}>我已完成这一步</button><button disabled={busy} onClick={() => action(training.state === 'paused' ? 'RESUME' : 'PAUSE')}>{training.state === 'paused' ? '继续' : '暂停'}</button><button disabled={busy} onClick={() => action('EXIT')}>退出</button></>}
  </section>;
}
