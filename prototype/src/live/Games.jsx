import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createGameLoop } from './game-loop.js';
import { createTextScene, drawTextScene, stageHeight, stageWidth, textSceneFont } from './text-effects.js';
import './private-text.css';
import { useTextDestructionState } from '../req14/useTextDestructionState.js';

export function PrivateText() {
  const { text, setBuffer, inputRef, destroy: destroyBuffer, clear: clearBuffer } = useTextDestructionState();
  const [effect, setEffect] = useState('burn');
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState('');
  const canvas = useRef(null);
  const frame = useRef(0);
  const scene = useRef(null);

  const stop = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    scene.current = null;
  }, []);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) drawTextScene(ctx, effect);

    function endOnExit() {
      stop();
      clearBuffer();
      if (ctx) drawTextScene(ctx, effect);
      setActive(false);
      setStatus('');
    }
    function endWhenHidden() {
      if (document.hidden && scene.current) endOnExit();
    }
    window.addEventListener('pagehide', endOnExit);
    document.addEventListener('visibilitychange', endWhenHidden);
    return () => {
      window.removeEventListener('pagehide', endOnExit);
      document.removeEventListener('visibilitychange', endWhenHidden);
      stop();
      ctx?.clearRect(0, 0, stageWidth, stageHeight);
    };
  }, [effect, stop, clearBuffer]);

  function clear() {
    stop();
    clearBuffer();
    const ctx = canvas.current?.getContext('2d');
    if (ctx) drawTextScene(ctx, effect);
    setActive(false);
    setStatus('文字已清空');
  }

  function render(now) {
    const current = scene.current;
    if (!current) return;
    const progress = (now - current.started) / current.duration;
    if (progress >= 1) {
      stop();
      drawTextScene(current.ctx, current.effect);
      setActive(false);
      setStatus('文字已销毁');
      return;
    }
    drawTextScene(current.ctx, current.effect, current.letters, Math.max(0, progress));
    frame.current = requestAnimationFrame(render);
  }

  function destroy() {
    if (!text.trim() || scene.current) return;
    const ctx = canvas.current?.getContext('2d');
    if (!ctx || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      destroyBuffer();
      setStatus('文字已销毁');
      return;
    }
    ctx.font = textSceneFont;
    scene.current = {
      ctx, effect, started: performance.now(),
      duration: effect === 'blackhole' ? 2900 : effect === 'burn' ? 2600 : 1700,
      letters: createTextScene(text, letter => ctx.measureText(letter).width),
    };
    destroyBuffer();
    setActive(true);
    setStatus('正在销毁文字');
    frame.current = requestAnimationFrame(render);
  }

  return <section className="live-records workspace-tool private-text-tool">
    <header className="workspace-tool-heading">
      <h2>文字焚化与重力黑洞</h2>
      <p>写下想放下的话，选择一种方式让它消散。文字只在本页内存中短暂停留。</p>
    </header>
    <div className="private-text-layout">
      <div className="workspace-tool-panel workspace-tool-fields">
        <label>想放下的话<textarea ref={inputRef} maxLength={300} autoComplete="off" spellCheck={false}
          disabled={active} value={text} onChange={event => { setBuffer(event.target.value); setStatus(''); }} /></label>
        <label>销毁方式<select disabled={active} value={effect} onChange={event => { setEffect(event.target.value); setStatus(''); }}>
          <option value="burn">焚化</option><option value="blackhole">重力黑洞</option><option value="shred">粉碎</option>
        </select></label>
        <div className="workspace-tool-actions">
          <button type="button" className="workspace-tool-primary" disabled={!text.trim() || active} onClick={destroy}>销毁本页文字</button>
          <button type="button" disabled={!text && !active} onClick={clear}>立即清空</button>
        </div>
      </div>
      <figure className="private-text-stage">
        <canvas width={stageWidth} height={stageHeight} ref={canvas} aria-label="文字消散动画" />
        <figcaption role="status">{status}</figcaption>
      </figure>
    </div>
  </section>;
}

export function PhysicsGame({ mode = 'marbles' }) {
  const loopRef = useRef(null);
  const canvas = useRef(null), frame = useRef(0), state = useRef({ balls: [], rails: [], impacts: [], running: false }), audio = useRef(null);
  const [running, setRunning] = useState(false), [sound, setSound] = useState(false), [material, setMaterial] = useState('wood');
  const sounding = useRef(false), volume = useRef(0.07), lastNote = useRef(0);
  const tone = (x, material = 'wood') => {
    if (!sounding.current || !audio.current || performance.now() - lastNote.current < 90) return;
    lastNote.current = performance.now(); const ctx = audio.current, oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.frequency.value = [261.63, 293.66, 329.63, 392, 440][Math.min(4, Math.floor(x / 160))]; oscillator.type = material === 'metal' ? 'triangle' : 'sine';
    gain.gain.setValueAtTime(volume.current, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .25);
    oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + .26);
  };
  useEffect(() => {
    let previous = 0;
    const render = now => {
      const ctx = canvas.current?.getContext('2d'); if (!ctx) return;
      const delta = Math.min(2, (now - previous) / 16.67 || 1); previous = now; ctx.clearRect(0, 0, 800, 420); ctx.fillStyle = '#eef3ec'; ctx.fillRect(0, 0, 800, 420);
      ctx.strokeStyle = '#8faaa0'; ctx.lineWidth = 7;
      for (const rail of state.current.rails) { ctx.beginPath(); ctx.moveTo(rail.x - 55, rail.y); ctx.lineTo(rail.x + 55, rail.y); ctx.stroke(); }
      if (state.current.running) {
        for (const ball of state.current.balls) {
          ball.vy += .14 * delta; ball.x += ball.vx * delta; ball.y += ball.vy * delta;
          if (ball.x < 10 || ball.x > 790) { ball.x = Math.max(10, Math.min(790, ball.x)); ball.vx *= -.9; }
          for (const rail of state.current.rails) if (Math.abs(ball.x - rail.x) < 60 && ball.vy > 0 && ball.y >= rail.y - 10 && ball.y - ball.vy * delta < rail.y - 10) { ball.y = rail.y - 10; ball.vy *= -ball.restitution; ball.vx += (ball.x - rail.x) * .02; tone(ball.x, ball.material); }
          if (ball.y > 410) { ball.y = 410; ball.vy *= -ball.restitution; tone(ball.x, ball.material); }
        }
        state.current.impacts = state.current.impacts.filter(impact => now - impact.time < 1800);
      }
      for (const ball of state.current.balls) { ctx.fillStyle = ball.color; ctx.beginPath(); ctx.arc(ball.x, ball.y, 9, 0, Math.PI * 2); ctx.fill(); }
      for (const impact of state.current.impacts) { const age = Math.min(1, (now - impact.time) / 1800); ctx.strokeStyle = `rgba(100,130,120,${1 - age})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(impact.x, impact.y, 8 + age * 65, 0, Math.PI * 2); ctx.stroke(); for (let i=0;i<6;i++) { const angle=i*Math.PI/3; ctx.beginPath(); ctx.moveTo(impact.x,impact.y); ctx.lineTo(impact.x+Math.cos(angle)*45*(1-age),impact.y+Math.sin(angle)*45*(1-age));ctx.stroke(); } }
    };
    const pause = () => { state.current.running = false; setRunning(false); audio.current?.suspend().catch(() => {}); };
    const loop = createGameLoop({ draw: render, onPause: pause }); loopRef.current = loop; render(performance.now());
    return () => { loop.dispose(); state.current = { balls: [], rails: [], impacts: [], running: false }; audio.current?.close().catch(() => {}); };
  }, []);
  const toggle = () => { if (state.current.running) loopRef.current?.pause(); else { state.current.running = true; setRunning(true); loopRef.current?.start(); audio.current?.resume().catch(() => {}); } };
  const release = () => { if (!state.current.running || state.current.balls.length >= 30) return; state.current.balls.push({ x: 80 + Math.random() * 640, y: 15, vx: (Math.random() - .5) * 3, vy: 0, material, restitution: material === 'glass' ? .92 : material === 'metal' ? .84 : .6, color: material === 'metal' ? '#9caebe' : material === 'glass' ? '#8dbcb3' : '#c5a27e' }); };
  const click = event => { if (!state.current.running) return; const rect = event.currentTarget.getBoundingClientRect(), x = (event.clientX - rect.left) * 800 / rect.width, y = (event.clientY - rect.top) * 420 / rect.height;
    if (mode === 'marbles') { if (state.current.rails.length < 30) state.current.rails.push({ x, y }); }
    else { state.current.impacts.push({ x, y, time: performance.now() }); tone(x); }
  };
  return <section className="live-records recent-card"><h2>{mode === 'marbles' ? '禅意编曲弹珠机' : '屏幕无损发泄'}</h2><p>{mode === 'marbles' ? '开始后点击画布摆放轨道，再释放小球。碰撞使用限定音阶。' : '开始后点击画布产生逐渐复原的裂纹与回弹，不会修改或损伤屏幕内容。'}</p><button onClick={toggle}>{running ? '暂停' : '开始 / 继续'}</button><button onClick={() => { state.current.balls = []; state.current.rails = []; state.current.impacts = []; state.current.running = false; loopRef.current?.pause(); setRunning(false); canvas.current?.getContext('2d').clearRect(0,0,800,420); }}>重置画布</button>
    <label>声音<input type="checkbox" checked={sound} onChange={event => { const enabled = event.target.checked; if (enabled && !audio.current) { const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) return; audio.current = new Audio(); } sounding.current = enabled; setSound(enabled); }} /></label><label>音量<input type="range" min="0" max="0.15" step="0.01" defaultValue="0.07" onChange={event => { volume.current = Number(event.target.value); }} /></label>
    {mode === 'marbles' && <><label>材质<select value={material} onChange={event => setMaterial(event.target.value)}><option value="wood">木</option><option value="metal">金属</option><option value="glass">玻璃</option></select></label><button disabled={!running} onClick={release}>释放小球</button><button disabled={!running} onClick={() => { if (state.current.rails.length < 30) state.current.rails.push({ x: 400, y: 200 }); }}>在中央添加轨道</button></>}
    <canvas width="800" height="420" ref={canvas} onPointerDown={click} aria-label={mode === 'marbles' ? '轨道与小球物理画布' : '点击回弹画布'} />
  </section>;
}
