import React, { useEffect, useRef, useState } from 'react';
import { createGameLoop } from './game-loop.js';
import { useTextDestructionState } from '../req14/useTextDestructionState.js';

export function PrivateText() {
  const { text, setBuffer: setText, inputRef, destroy: destroyBuffer, clear: clearBuffer } = useTextDestructionState();
  const [effect, setEffect] = useState('burn'), [active, setActive] = useState(false);
  const canvas = useRef(null), frame = useRef(0), particles = useRef([]), privateText = useRef('');
  const clear = () => { privateText.current = ''; particles.current = []; clearBuffer(); setActive(false); cancelAnimationFrame(frame.current); canvas.current?.getContext('2d').clearRect(0, 0, 800, 420); };
  useEffect(() => { const erase = () => { privateText.current = ''; particles.current = []; cancelAnimationFrame(frame.current); setText(''); setActive(false); };
    window.addEventListener('pagehide', erase); return () => { window.removeEventListener('pagehide', erase); privateText.current = ''; particles.current = []; cancelAnimationFrame(frame.current); }; }, []);
  const destroy = () => {
    const letters = Array.from(text); if (!letters.length) return;
    particles.current = letters.map((letter, index) => ({ letter, x: 50 + index % 35 * 19, y: 80 + Math.floor(index / 35) * 28, vx: (Math.random() - .5) * 5, vy: -Math.random() * 4 }));
    privateText.current = ''; destroyBuffer(); setActive(true); const start = performance.now();
    const render = now => {
      const ctx = canvas.current?.getContext('2d'); if (!ctx) return;
      ctx.clearRect(0, 0, 800, 420); ctx.font = '18px sans-serif'; const progress = (now - start) / 1800;
      if (progress >= 1) { particles.current = []; setActive(false); return; }
      ctx.globalAlpha = 1 - progress;
      for (const particle of particles.current) { if (effect === 'blackhole') { particle.x += (400 - particle.x) * .055; particle.y += (210 - particle.y) * .055; } else { particle.x += particle.vx; particle.y += effect === 'burn' ? particle.vy - .6 : (particle.vy += .15); }
        ctx.fillStyle = effect === 'burn' ? '#bb6549' : '#47645a'; ctx.fillText(particle.letter, particle.x, particle.y); }
      ctx.globalAlpha = 1; frame.current = requestAnimationFrame(render);
    }; frame.current = requestAnimationFrame(render);
  };
  return <section className="live-records recent-card"><h2>文字焚化与重力黑洞</h2><p>文字只在本页私有内存中短暂停留，不调用 API、不写浏览器存储。销毁或离开页面时清理。</p><label>想放下的话<textarea ref={inputRef} maxLength={300} autoComplete="off" spellCheck={false} disabled={active} value={text} onChange={event => { privateText.current = event.target.value; setText(event.target.value); }} /></label><label>方式<select disabled={active} value={effect} onChange={event => setEffect(event.target.value)}><option value="burn">焚化</option><option value="shred">粉碎</option><option value="blackhole">黑洞</option></select></label><button disabled={!text || active} onClick={destroy}>销毁本页文字</button><button onClick={clear}>立即清空</button><canvas width="800" height="420" ref={canvas} aria-label="文字消散动画" /></section>;
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
  return <section className="live-records recent-card"><h2>{mode === 'marbles' ? '禅意编曲弹珠机' : '屏幕无损发泄'}</h2><p>{mode === 'marbles' ? '开始后点击画布摆放轨道，再释放小球。碰撞使用限定音阶。' : '开始后点击画布产生逐渐复原的裂纹与回弹，不会修改或损伤屏幕内容。'}</p><button onClick={toggle}>{running ? '暂停' : '开始 / 继续'}</button><button onClick={() => { state.current.balls = []; state.current.rails = []; state.current.impacts = []; state.current.running = false; loopRef.current?.pause(); setRunning(false); canvas.current?.getContext('2d').clearRect(0,0,800,420); }}>退出并重置</button>
    <label>声音<input type="checkbox" checked={sound} onChange={event => { const enabled = event.target.checked; if (enabled && !audio.current) { const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) return; audio.current = new Audio(); } sounding.current = enabled; setSound(enabled); }} /></label><label>音量<input type="range" min="0" max="0.15" step="0.01" defaultValue="0.07" onChange={event => { volume.current = Number(event.target.value); }} /></label>
    {mode === 'marbles' && <><label>材质<select value={material} onChange={event => setMaterial(event.target.value)}><option value="wood">木</option><option value="metal">金属</option><option value="glass">玻璃</option></select></label><button disabled={!running} onClick={release}>释放小球</button><button disabled={!running} onClick={() => { if (state.current.rails.length < 30) state.current.rails.push({ x: 400, y: 200 }); }}>在中央添加轨道</button></>}
    <canvas width="800" height="420" ref={canvas} onPointerDown={click} aria-label={mode === 'marbles' ? '轨道与小球物理画布' : '点击回弹画布'} />
  </section>;
}
