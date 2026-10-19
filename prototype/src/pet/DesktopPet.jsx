import React, { useEffect, useRef, useState } from 'react';
import { Archive, ArrowLeft, ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, CircleHelp, Clock3, Flower2, Heart, Home, LogIn, MessageCircle, Minus, MoreHorizontal, Move, Package, Pause, Play, RotateCcw, Search, Send, Settings2, ShieldCheck, Sparkles, Trash2, Wind, X } from 'lucide-react';
import { localDate, uid, usePrototype } from '../context.jsx';
import { PETS, PetAvatar } from './PetAvatar.jsx';
import './pet.css';

const EMOTIONS = ['平静', '疲惫', '烦躁', '担心', '失落', '期待', '说不清'];
const TITLES = { home: '今天想从哪里开始？', chat: '聊一聊', emotion: '记下这一刻', calendar: '心情日历', breath: '一起慢慢呼吸', worry: '烦恼先放一放', more: '更多入口', settings: '桌宠偏好', help: '需要支持的时候' };
const freshPetData = () => ({ messages: [], draft: '', chatMode: 'listen', typing: false, emotion: { tags: [], strength: '跳过', note: '', date: localDate() }, moodSaved: false, editingMood: null, calendar: [], worries: [], worryDraft: '', worryLabel: '', worryWhen: `${localDate()}T20:00`, expandedWorry: null, breath: { status: 'ready', total: 60, elapsed: 0 } });
const clamp = (n, a, b) => Math.max(a, Math.min(n, Math.max(a, b)));
const dateTime = date => `${localDate(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
const friendlyTime = value => value.replace('T', ' ');

function SmallButton({ children, icon: Icon, tone = 'soft', className = '', ...props }) {
  return <button className={`dp-btn dp-btn-${tone} ${className}`} type="button" {...props}>{Icon && <Icon size={15} aria-hidden="true" />}{children}</button>;
}

export function DesktopPet({ active }) {
  const { user, go, ask, notify } = usePrototype();
  const owner = user?.id || 'guest';
  const [buckets, setBuckets] = useState({ guest: freshPetData() });
  const data = buckets[owner] || freshPetData();
  const update = patch => setBuckets(all => ({ ...all, [owner]: { ...(all[owner] || freshPetData()), ...(typeof patch === 'function' ? patch(all[owner] || freshPetData()) : patch) } }));
  const [kind, setKind] = useState('blob');
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('home');
  const [position, setPosition] = useState(null);
  const [frame, setFrame] = useState({ width: 1100, height: 700 });
  const [petSize, setPetSize] = useState(160);
  const [quiet, setQuiet] = useState(false);
  const [gesture, setGesture] = useState('');
  const [now, setNow] = useState(new Date());
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(localDate());
  const stage = useRef(null), petButton = useRef(null), panel = useRef(null), log = useRef(null);
  const drag = useRef(null), suppressClick = useRef(false), replyTimer = useRef(null), gestureTimer = useRef(null), previousOwner = useRef(owner);
  const pet = PETS.find(p => p.id === kind);
  const breath = data.breath;
  const movingBreath = breath.status === 'running' && open && view === 'breath' && active;
  const progress = breath.elapsed / breath.total;
  const cyclePosition = breath.elapsed % 12;
  const phase = cyclePosition < 4 ? '吸气' : cyclePosition < 6 ? '自然停留' : '呼气';
  const phaseRemaining = cyclePosition < 4 ? 4-cyclePosition : cyclePosition < 6 ? 6-cyclePosition : 12-cyclePosition;
  const breathScale = cyclePosition < 4 ? 1 + cyclePosition*.035 : cyclePosition < 6 ? 1.14 : 1.14-(cyclePosition-6)*.023;
  const avatarState = movingBreath ? 'breathing' : gesture ? 'happy' : open && view === 'chat' ? 'listening' : 'idle';
  const currentPosition = position || { x: frame.width*.72, y: frame.height*.6 };
  const panelWidth = Math.min(354, frame.width-24);
  const panelHeight = Math.min(526, frame.height-100);
  const panelLeft = frame.width < 620 ? (frame.width-panelWidth)/2 : clamp(currentPosition.x-panelWidth-12, 16, frame.width-panelWidth-16);
  const panelTop = clamp(currentPosition.y-280, 12, frame.height-panelHeight-84);
  const pausedLabel = movingBreath ? '呼吸训练中' : breath.status === 'paused' ? '训练已暂停' : open && view === 'chat' ? '正在陪你聊一聊' : data.worries.length ? `寄存中 · ${data.worries.length} 件` : '随时可以唤起';

  const pauseTraining = () => update(d => ({ breath: d.breath.status === 'running' ? { ...d.breath, status: 'paused' } : d.breath }));
  const closePanel = () => { pauseTraining(); setOpen(false); petButton.current?.focus(); };
  const navigate = next => { if (next !== 'breath') pauseTraining(); if(next==='emotion'&&data.moodSaved)update({emotion:{tags:[],strength:'跳过',note:'',date:localDate()},moodSaved:false,editingMood:null}); setView(next); setOpen(true); };
  const petAction = () => { clearTimeout(gestureTimer.current); setGesture('摸摸收到啦。'); gestureTimer.current = setTimeout(() => setGesture(''), 2200); };
  const openWeb = target => ask({ title: '打开 Web 完整页面？', body: <><p>将打开对应的完整功能页。桌宠的聊天、草稿和训练进度留在桌宠入口。</p><p>本次不携带文字，也不会自动复制两个入口的记录。</p></>, confirmLabel: '打开完整页', confirm: () => { pauseTraining(); go(target); } });
  const requireAccount = action => {
    if (user) return action();
    ask({ title: '登录后保存个人内容', body: <><p>你可以先在桌宠中临时填写。加入个人日历或寄存列表前，请使用演示账户登录。</p><p>登录不会自动把访客草稿迁入账户。返回桌宠后，请在自己的账户下重新确认要保存的内容。</p></>, confirmLabel: '前往演示登录', cancelLabel: '继续临时体验', confirm: () => go('login', { returnTo: 'pet' }) });
  };

  useEffect(() => {
    if (previousOwner.current === owner) return;
    const oldOwner = previousOwner.current;
    clearTimeout(replyTimer.current);
    setBuckets(all => ({ ...all, [oldOwner]: { ...(all[oldOwner] || freshPetData()), typing: false, breath: { ...(all[oldOwner]?.breath || freshPetData().breath), status: all[oldOwner]?.breath.status === 'running' ? 'paused' : all[oldOwner]?.breath.status || 'ready' } }, [owner]: all[owner] || freshPetData() }));
    previousOwner.current = owner;
    setOpen(false); setView('home'); setGesture(''); setSelectedDate(localDate());
  }, [owner]);

  useEffect(() => {
    if (!active) {
      setBuckets(all => ({ ...all, [owner]: { ...(all[owner] || freshPetData()), breath: all[owner]?.breath.status === 'running' ? { ...all[owner].breath, status: 'paused' } : all[owner]?.breath || freshPetData().breath } }));
      return;
    }
    const measure = () => {
      if (!stage.current) return;
      const width = stage.current.clientWidth, height = stage.current.clientHeight;
      setFrame({ width, height });
      setPosition(p => ({ x: clamp(p?.x ?? width*.72, 8, width-petSize-8), y: clamp(p?.y ?? height*.6, 8, height-petSize-50) }));
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(stage.current);
    return () => observer.disconnect();
  }, [active, owner, petSize]);

  useEffect(() => {
    if (!movingBreath) return;
    const timer = setInterval(() => setBuckets(all => {
      const d = all[owner] || freshPetData();
      if (d.breath.status !== 'running') return all;
      const elapsed = Math.min(d.breath.total, d.breath.elapsed+1);
      return { ...all, [owner]: { ...d, breath: { ...d.breath, elapsed, status: elapsed >= d.breath.total ? 'complete' : 'running' } } };
    }), 1000);
    return () => clearInterval(timer);
  }, [movingBreath, owner]);

  useEffect(() => {
    if (!active) return;
    const hidden = () => { if (document.hidden) pauseTraining(); };
    const key = e => { if (e.key === 'Escape' && !document.querySelector('[aria-modal="true"]')) { e.preventDefault(); closePanel(); } };
    const timer = setInterval(() => setNow(new Date()), 30000);
    document.addEventListener('visibilitychange', hidden); document.addEventListener('keydown', key);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', hidden); document.removeEventListener('keydown', key); };
  }, [active, owner]);

  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [data.messages.length, data.typing, open, view]);
  useEffect(() => { if (open && active) panel.current?.focus({ preventScroll: true }); }, [open, view, active]);
  useEffect(() => () => { clearTimeout(replyTimer.current); clearTimeout(gestureTimer.current); }, []);

  const send = () => {
    const text = data.draft.trim(); if (!text || data.typing) return;
    if (/自杀|自残|伤害自己|活不下去|不想活/.test(text)) { update({ draft: '' }); navigate('help'); return; }
    const currentOwner = owner, mode = data.chatMode;
    update(d => ({ messages: [...d.messages, { id: uid(), role: 'user', text }], draft: '', typing: true }));
    clearTimeout(replyTimer.current);
    replyTimer.current = setTimeout(() => {
      const reply = mode === 'listen' ? '我在听。你可以按自己的节奏说，不需要马上想出解决办法。' : '可以试着分成三小块：发生了什么、你最在意什么、现在愿意先做哪一步。你也可以只选一块说。';
      setBuckets(all => { const d = all[currentOwner] || freshPetData(); return { ...all, [currentOwner]: { ...d, typing: false, messages: [...d.messages, { id: uid(), role: 'pet', text: reply }] } }; });
    }, 650);
  };
  const changeMode = mode => {
    if (data.chatMode === mode) return;
    const label = mode === 'listen' ? '倾听' : '梳理';
    if (data.messages.length || data.draft.trim()) ask({ title: `切换为“${label}”？`, body: <p>已有对话和输入草稿保留。切换只改变接下来回应的方式，不自动把内容带入其他功能。</p>, confirmLabel: '确认切换', confirm: () => update({ chatMode: mode }) });
    else update({ chatMode: mode });
  };
  const endChat = () => ask({ title: '结束桌宠会话？', body: <p>将清除当前桌宠聊天和未发送草稿，同时结束本轮临时训练进度。主动加入日历或寄存列表的内容单独保留。</p>, danger: true, confirmLabel: '结束并清除', confirm: () => { clearTimeout(replyTimer.current); update({ messages: [], draft: '', typing: false, breath: { status: 'ready', total: breath.total, elapsed: 0 } }); setView('home'); } });
  const saveMood = () => {
    if (!data.emotion.tags.length) { notify('先选一个感受，也可以选择“说不清”。'); return; }
    requireAccount(() => { update(d => ({ calendar: d.editingMood ? d.calendar.map(r => r.id === d.editingMood ? { ...d.emotion, tags: [...d.emotion.tags], id: r.id } : r) : [...d.calendar, { ...d.emotion, tags: [...d.emotion.tags], id: uid() }], editingMood: null, moodSaved: true })); setSelectedDate(data.emotion.date); const date = new Date(`${data.emotion.date}T12:00:00`); setMonth(new Date(date.getFullYear(), date.getMonth(), 1)); notify('已更新桌宠入口的心情日历（本次演示）'); setView('calendar'); });
  };
  const saveWorry = () => {
    if (!data.worryDraft.trim() || !Number.isFinite(new Date(data.worryWhen).getTime())) { notify('请填写内容和重新查看时间。'); return; }
    requireAccount(() => ask({ title: '把这件事先寄存？', body: <><p>只把你填写的内容放进当前账户的桌宠寄存列表。</p><p>查看时间：{friendlyTime(data.worryWhen)}。到期仅改变条目状态；正文不会自动打开，也不发送提醒。</p></>, confirmLabel: '确认寄存', confirm: () => { update(d => ({ worries: [...d.worries, { id: uid(), text: d.worryDraft.trim(), label: d.worryLabel.trim() || '一个小包裹', when: d.worryWhen }], worryDraft: '', worryLabel: '' })); notify('已先放在这里，等你准备好再打开。'); } }));
  };
  const pointerDown = e => {
    if (e.button !== 0) return;
    drag.current = { startX: e.clientX, startY: e.clientY, x: currentPosition.x, y: currentPosition.y, moved: false };
    suppressClick.current = false; e.currentTarget.setPointerCapture(e.pointerId);
  };
  const pointerMove = e => {
    if (!drag.current) return;
    const dx = e.clientX-drag.current.startX, dy = e.clientY-drag.current.startY;
    if (Math.hypot(dx, dy) > 5) drag.current.moved = true;
    if (drag.current.moved) setPosition({ x: clamp(drag.current.x+dx, 8, frame.width-petSize-8), y: clamp(drag.current.y+dy, 8, frame.height-petSize-50) });
  };
  const pointerUp = e => { suppressClick.current = !!drag.current?.moved; drag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); };
  const moveWithKeyboard = e => {
    const directions = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] };
    if (!directions[e.key]) return;
    e.preventDefault(); const [x,y] = directions[e.key], step = e.shiftKey ? 24 : 12;
    setPosition({ x: clamp(currentPosition.x+x*step, 8, frame.width-petSize-8), y: clamp(currentPosition.y+y*step, 8, frame.height-petSize-50) });
  };
  const toggle = () => { if (suppressClick.current) { suppressClick.current = false; return; } open ? closePanel() : setOpen(true); };
  const setEmotion = patch => update(d => ({ emotion: { ...d.emotion, ...patch }, moodSaved: false }));

  if (!active) return null;

  const renderHome = () => <>
    <div className="dp-home-hello"><span className="dp-leaf"><Flower2 size={23} /></span><p>可以聊一聊，也可以<br /><strong>只在这里歇一会儿。</strong></p></div>
    <div className="dp-quick-grid">
      <button onClick={() => navigate('chat')}><MessageCircle size={21}/><strong>聊一聊</strong><span>倾听或慢慢梳理</span></button>
      <button onClick={() => navigate('breath')}><Wind size={21}/><strong>放松一下</strong><span>{breath.status === 'paused' ? '继续上次的呼吸训练' : '跟着节奏慢慢呼吸'}</span></button>
      <button onClick={() => navigate('emotion')}><Heart size={21}/><strong>记心情</strong><span>自己选择感受</span></button>
      <button onClick={() => navigate('worry')}><Package size={21}/><strong>先放一放</strong><span>把烦恼暂时寄存</span></button>
    </div>
    {breath.status === 'paused' && <button className="dp-resume-row" onClick={() => navigate('breath')}><Pause size={15}/><span>上次训练停在 {breath.elapsed} 秒</span><ArrowRight size={15}/></button>}
    <div className="dp-home-links"><SmallButton icon={CalendarDays} tone="plain" onClick={() => navigate('calendar')}>心情日历</SmallButton><SmallButton icon={MoreHorizontal} tone="plain" onClick={() => navigate('more')}>更多入口</SmallButton></div>
    <p className="dp-subtle">无需打卡，想用的时候再打开。</p>
  </>;
  const renderChat = () => <>
    <div className="dp-mode-row"><div className="dp-segments" role="group" aria-label="回应方式"><button aria-pressed={data.chatMode === 'listen'} onClick={() => changeMode('listen')}>先听我说</button><button aria-pressed={data.chatMode === 'organize'} onClick={() => changeMode('organize')}>帮我梳理</button></div><span className="dp-demo-chip">预设回复</span></div>
    <div className="dp-chat-log" role="log" aria-label="桌宠对话" aria-live="polite" ref={log}>
      <div className="dp-chat-item"><span>{pet.name} · 示例回应</span><p>{pet.hello}</p></div>
      {data.messages.map(m => <div className={`dp-chat-item ${m.role === 'user' ? 'dp-chat-user' : ''}`} key={m.id}><span>{m.role === 'user' ? '你' : `${pet.name} · 预设回应`}</span><p>{m.text}</p></div>)}
      {data.typing && <p className="dp-typing">正在准备示例回应<span>···</span></p>}
    </div>
    <div className="dp-composer"><label htmlFor="dp-chat-input" className="dp-sr-only">想对桌宠说的话</label><textarea id="dp-chat-input" value={data.draft} maxLength={500} placeholder="想说什么，都可以慢慢写…" onChange={e => update({ draft: e.target.value })} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}/><div><span>Enter 发送 · Shift＋Enter 换行</span><SmallButton icon={Send} tone="primary" disabled={!data.draft.trim() || data.typing} onClick={send}>发送</SmallButton></div></div>
    <div className="dp-form-footer"><SmallButton tone="plain" onClick={endChat}>结束会话</SmallButton><SmallButton icon={CircleHelp} tone="plain" onClick={() => navigate('help')}>求助</SmallButton></div>
  </>;
  const renderEmotion = () => <>
    <p className="dp-intro-text">给现在的感受选个词。不用解释，也可以只记、不分析。</p>
    <div className="dp-emotions" role="group" aria-label="选择感受">{EMOTIONS.map(word => <button key={word} aria-pressed={data.emotion.tags.includes(word)} onClick={() => setEmotion({ tags: data.emotion.tags.includes(word) ? data.emotion.tags.filter(x => x !== word) : [...data.emotion.tags, word] })}>{data.emotion.tags.includes(word) && <Check size={12}/>} {word}</button>)}</div>
    <div className="dp-fields dp-emotion-fields"><label>记录日期<input type="date" value={data.emotion.date} onChange={e => setEmotion({ date: e.target.value || localDate() })}/></label><label>感受强度 · 可跳过<select value={data.emotion.strength} onChange={e => setEmotion({ strength: e.target.value })}>{['跳过','轻一些','中等','强一些'].map(s => <option key={s}>{s}</option>)}</select></label><label>想留下一句话吗？<textarea value={data.emotion.note} maxLength={300} placeholder="可选，仅记录你愿意写下的内容" onChange={e => setEmotion({ note: e.target.value })}/></label></div>
    <SmallButton tone="primary" className="dp-wide" icon={CalendarDays} onClick={saveMood} disabled={!data.emotion.tags.length || data.moodSaved}>{data.editingMood ? '保存这条记录的修改' : '加入心情日历'}</SmallButton>
    {data.editingMood && <SmallButton tone="plain" className="dp-wide" onClick={() => { update({editingMood:null,emotion:{tags:[],strength:'跳过',note:'',date:selectedDate},moodSaved:false}); setView('calendar'); }}>取消修改</SmallButton>}
    <p className="dp-subtle">选择感受不会自动保存。{user ? '记录仅对当前账户可见。' : '个人日历需先使用演示账户登录。'}</p>
  </>;
  const renderCalendar = () => {
    const offset = (new Date(month.getFullYear(), month.getMonth(), 1).getDay()+6)%7;
    const count = new Date(month.getFullYear(), month.getMonth()+1, 0).getDate();
    const records = data.calendar.filter(r => r.date === selectedDate);
    return <>
      <div className="dp-month-head"><button aria-label="上个月" onClick={() => setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}><ChevronLeft size={17}/></button><strong>{month.getFullYear()} 年 {month.getMonth()+1} 月</strong><button aria-label="下个月" onClick={() => setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}><ChevronRight size={17}/></button></div>
      <div className="dp-calendar-grid">{['一','二','三','四','五','六','日'].map(w => <span key={w}>{w}</span>)}{Array.from({length: offset}, (_,i) => <span key={`blank-${i}`}/>)}{Array.from({length:count},(_,i) => { const date = localDate(new Date(month.getFullYear(),month.getMonth(),i+1)), hasRecord = data.calendar.some(r=>r.date===date); return <button key={date} className={`${date === selectedDate ? 'selected' : ''} ${date === localDate() ? 'today' : ''}`} aria-label={`${date}${hasRecord ? '，有记录' : '，无记录'}`} aria-pressed={date === selectedDate} onClick={() => setSelectedDate(date)}>{i+1}{hasRecord && <i/>}</button>; })}</div>
      <div className="dp-date-detail"><span className="dp-kicker">{selectedDate} · {records.length} 条记录</span>{records.length ? records.map(r => <article className="dp-record" key={r.id}><strong>{r.tags.join('、')}</strong><span>强度：{r.strength}</span>{r.note && <p>{r.note}</p>}<div><SmallButton tone="plain" onClick={() => { update({ emotion: { tags:[...r.tags], strength:r.strength, note:r.note, date:r.date }, moodSaved:false,editingMood:r.id }); setView('emotion'); }}>编辑</SmallButton><SmallButton tone="plain" icon={Trash2} onClick={() => ask({ title:'删除这条心情记录？',body:<p>只删除所选日期的这一条记录，其他记录保留。</p>,danger:true,confirmLabel:'删除记录',confirm:()=>update(d=>({calendar:d.calendar.filter(x=>x.id!==r.id)})) })}>删除</SmallButton></div></article>) : <div className="dp-empty"><Flower2 size={25}/><p>这一天还没有记录。<br/>空白的日子也可以留着。</p></div>}</div>
      <SmallButton tone="soft" className="dp-wide" icon={Heart} onClick={() => { update({emotion:{tags:[],strength:'跳过',note:'',date:selectedDate},moodSaved:false,editingMood:null});navigate('emotion'); }}>记录这一天</SmallButton>
    </>;
  };
  const renderBreath = () => <>
    <p className="dp-intro-text">跟随一个轻缓的节奏。按自己的舒适程度呼吸，随时可以暂停。</p>
    <div className={`dp-breath-orbit ${movingBreath ? 'running' : ''}`} style={{'--breath-scale': movingBreath || breath.status === 'paused' ? breathScale : 1}}><div><Wind size={24}/><strong>{breath.status === 'ready' ? '准备好了再开始' : breath.status === 'paused' ? '先停在这里' : breath.status === 'complete' ? '这一轮结束了' : breath.status === 'exited' ? '已退出这次训练' : phase}</strong><span>{movingBreath ? `${phaseRemaining} 秒` : breath.status === 'paused' ? '点击继续后恢复' : breath.status === 'complete' ? '可以回到自己的节奏' : '吸气 4 秒 · 停留 2 秒 · 呼气 6 秒'}</span></div></div>
    {['ready','exited'].includes(breath.status) && <div className="dp-segments dp-duration" role="group" aria-label="训练时长">{[[12,'12秒演示'],[60,'1分钟'],[120,'2分钟']].map(([n,label]) => <button key={n} aria-pressed={breath.total===n} onClick={()=>update({breath:{status:'ready',total:n,elapsed:0}})}>{label}</button>)}</div>}
    <div className="dp-progress" role="progressbar" aria-label="呼吸训练进度" aria-valuemin={0} aria-valuemax={breath.total} aria-valuenow={breath.elapsed}><i style={{width:`${progress*100}%`}}/></div><div className="dp-breath-time"><span>{breath.elapsed} 秒 / {breath.total} 秒</span><span>{breath.status === 'paused' ? '进度已保留' : breath.status === 'complete' ? '已完成' : breath.status === 'exited' ? '进度已清除' : '可随时暂停'}</span></div>
    <div className="dp-breath-actions">{breath.status === 'running' ? <SmallButton tone="primary" icon={Pause} onClick={pauseTraining}>暂停</SmallButton> : <SmallButton tone="primary" icon={breath.status === 'complete' ? RotateCcw : Play} onClick={()=>update({breath:{...breath,status:breath.status==='complete'?'ready':'running',elapsed:breath.status==='complete'?0:breath.elapsed}})}>{breath.status === 'paused' ? '继续训练' : breath.status === 'complete' ? '再来一轮' : '开始训练'}</SmallButton>}
      {['running','paused'].includes(breath.status) && <SmallButton icon={X} tone="plain" onClick={()=>update({breath:{...breath,status:'exited',elapsed:0}})}>退出训练</SmallButton>}
      {breath.status === 'paused' && <SmallButton icon={RotateCcw} tone="plain" onClick={()=>update({breath:{...breath,status:'ready',elapsed:0}})}>重新开始</SmallButton>}
    </div><p className="dp-subtle">收起、返回或离开会暂停。重新打开后需主动继续。</p>
  </>;
  const renderWorry = () => <>
    <p className="dp-intro-text">现在不想处理，可以先放一放。包裹外观不会展示正文。</p>
    <div className="dp-fields"><label>给包裹起个名字 · 可选<input value={data.worryLabel} maxLength={20} placeholder="例如：晚点再想的事" onChange={e=>update({worryLabel:e.target.value})}/></label><label>想寄存的内容<textarea value={data.worryDraft} maxLength={500} placeholder="只写你愿意暂存的内容" onChange={e=>update({worryDraft:e.target.value})}/></label><label>什么时候再看看<input type="datetime-local" value={data.worryWhen} onChange={e=>update({worryWhen:e.target.value})}/></label></div>
    <SmallButton icon={Package} tone="primary" className="dp-wide" disabled={!data.worryDraft.trim() || !data.worryWhen} onClick={saveWorry}>先寄存在这里</SmallButton>
    <div className="dp-parcel-list"><span className="dp-kicker">我的包裹 · {data.worries.length} 件</span>{!data.worries.length && <p className="dp-subtle">还没有包裹。寄存到期后仅显示可取出，不催促。</p>}{data.worries.map(w=><article className="dp-record" key={w.id}><div className="dp-parcel-title"><Package size={19}/><strong>{w.label}</strong><span>{new Date(w.when)<=now?'可取出':'寄存中'}</span></div><span>{friendlyTime(w.when)}</span><div><SmallButton tone="plain" onClick={()=>update({expandedWorry:data.expandedWorry===w.id?null:w.id})}>{data.expandedWorry===w.id?'收起正文':'取出看看'}</SmallButton><SmallButton tone="plain" onClick={()=>ask({title:'再寄存一天？',body:<p>从当前时间与原查看时间中较晚的时间起，再延后一天。内容继续保留。</p>,confirmLabel:'确认延期',confirm:()=>update(d=>({worries:d.worries.map(x=>x.id===w.id?{...x,when:dateTime(new Date(Math.max(Date.now(),new Date(x.when).getTime())+86400000))}:x)}))})}>延期</SmallButton><SmallButton tone="plain" icon={Trash2} onClick={()=>ask({title:'删除这个寄存包裹？',body:<p>将删除这个包裹及其正文。取消后继续保留。</p>,danger:true,confirmLabel:'删除包裹',confirm:()=>update(d=>({worries:d.worries.filter(x=>x.id!==w.id),expandedWorry:d.expandedWorry===w.id?null:d.expandedWorry}))})}>删除</SmallButton></div>{data.expandedWorry===w.id&&<p className="dp-worry-body">{w.text}</p>}</article>)}</div>
  </>;
  const renderMore = () => <><p className="dp-intro-text">轻量任务留在桌宠，复杂内容可以打开完整页面。</p><div className="dp-tool-links">{[['calendar','心情日历','查看桌宠入口的个人记录',CalendarDays,true],['worry','烦恼寄存','查看与管理自己的包裹',Package,true],['search','查资料','Web完整页 · 来源与不确定性',Search],['room','烦恼物件化','Web完整页 · 选择形状与处理方式',Archive],['dialogue','对话排练','Web完整页 · 练习想说的话',MessageCircle],['destroy','文字销毁','Web独立页 · 内容不加入记录',Trash2],['toy','弹珠机','Web完整页 · 主动开启互动',Sparkles]].map(([target,title,desc,Icon,local])=><button key={target} onClick={()=>local?navigate(target):openWeb(target)}><Icon size={19}/><span><strong>{title}</strong><small>{desc}</small></span><ArrowRight size={14}/></button>)}</div><p className="dp-subtle">打开完整页不自动携带桌宠内容。</p></>;
  const renderSettings = () => <>
    <p className="dp-intro-text">把桌面伙伴调整到你舒服的样子。</p><div className="dp-preference"><div><strong>安静陪伴</strong><span>减少待机起伏与动作</span></div><button role="switch" aria-label="安静陪伴" aria-checked={quiet} className={`dp-switch ${quiet?'on':''}`} onClick={()=>setQuiet(!quiet)}><i/></button></div>
    <label className="dp-size-label">桌宠大小<select value={petSize} onChange={e=>setPetSize(Number(e.target.value))}><option value={128}>小 · 128px</option><option value={160}>标准 · 160px</option><option value={192}>大 · 192px</option></select></label><SmallButton icon={Move} onClick={()=>setPosition({x:clamp(frame.width*.72,8,frame.width-petSize-8),y:clamp(frame.height*.6,8,frame.height-petSize-50)})}>恢复初始位置</SmallButton>
    <div className="dp-privacy-card"><ShieldCheck size={20}/><strong>内容由你决定</strong><p>聊天不自动保存。日历和寄存只在主动确认后加入当前账户的桌宠记录。当前演示使用浏览器内存，刷新后重置。</p></div><SmallButton icon={Trash2} tone="danger" onClick={()=>ask({title:'清除当前桌宠内容？',body:<><p>将清除当前身份在桌宠入口的聊天、草稿、心情记录、寄存内容和临时训练进度。</p><p>Web入口与其他账户的记录各自保留。取消后当前内容不变。</p></>,danger:true,confirmLabel:'确认清除',confirm:()=>{clearTimeout(replyTimer.current);update(freshPetData());notify('当前身份的桌宠内容已清除（本次演示）');}})}>清除当前桌宠内容</SmallButton><SmallButton icon={CircleHelp} tone="plain" onClick={()=>navigate('help')}>操作说明与求助</SmallButton>
  </>;
  const renderHelp = () => <><div className="dp-privacy-card"><Heart size={22}/><strong>需要支持，可以先找身边的人</strong><p>如果你正处于危险中，或担心自己会受到伤害，请联系可信任的人和当地紧急服务。中国大陆紧急电话：120 / 110。</p><p>桌宠可以提供日常陪伴，不能代替紧急援助或专业支持。</p></div><div className="dp-help-steps"><strong>桌宠怎么操作</strong><p>点击宠物展开或收起气泡；拖动宠物调整位置。键盘聚焦宠物后，可用方向键移动，Enter 或空格展开，Esc 收起。</p><p>收起、返回和离开会暂停训练并保留步骤；“退出训练”清除本轮进度，“完成”显示完成结果。</p></div><p className="dp-subtle">这是浏览器内的桌面交互演示，聊天为预设回应，尚未接入桌面客户端或真实服务。</p></>;
  const renderers = { home:renderHome, chat:renderChat, emotion:renderEmotion, calendar:renderCalendar, breath:renderBreath, worry:renderWorry, more:renderMore, settings:renderSettings, help:renderHelp };

  return <div className={`dp-shell ${quiet?'dp-quiet':''}`}>
    <header className="dp-toolbar"><button className="dp-brand" onClick={()=>go('home')} aria-label="返回404NOTFOUND Web工作台"><span className="dp-brand-mark">4</span><span><strong>404NOTFOUND</strong><small>桌宠入口 · 浏览器演示</small></span></button>
      <div className="dp-character-picker" role="group" aria-label="选择桌宠形象">{PETS.map(p=><button key={p.id} className={kind===p.id?'selected':''} aria-pressed={kind===p.id} onClick={()=>{setKind(p.id);setGesture('');}}><span className="dp-picker-dot" style={{background:p.color}}/><span>{p.name}</span>{kind===p.id&&<Check size={13}/>}</button>)}</div>
      <div className="dp-toolbar-actions"><button className="dp-account" onClick={()=>user?openWeb('profile'):go('login',{returnTo:'pet'})}><LogIn size={14}/><span>{user?user.nickname:'演示登录'}</span></button><button className="dp-back-web" onClick={()=>go('home')}><ArrowLeft size={14}/><span>Web工作台</span></button></div>
    </header>
    <main ref={stage} className="dp-desktop" aria-label="桌宠模拟桌面">
      <div className="dp-wallpaper" aria-hidden="true"><div className="dp-sun"/><svg viewBox="0 0 1440 650" preserveAspectRatio="none"><path d="M-50 650V430Q140 200 355 406T796 389Q1100 250 1500 435V650Z" fill="#d7e3d2"/><path d="M-50 650V510Q232 346 500 494T1080 488Q1360 337 1500 464V650Z" fill="#bbcfc0"/><path d="M-50 650V600Q300 453 602 580T1112 543Q1330 489 1500 576V650Z" fill="#9ab5a4"/></svg></div>
      <div className="dp-desktop-intro"><span className="dp-kicker">A LITTLE SPACE FOR YOURSELF</span><h1>陪伴，在你需要的时候。</h1><p>不用准备好所有答案。<br/>点一下桌面伙伴，从一件小事开始。</p><div className="dp-intro-line"/><span className="dp-desktop-date">{now.toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'})}</span></div>
      <aside className="dp-desktop-note"><span><Sparkles size={14}/>给自己留一点空白</span><p>可以只说一句话，<br/>只记一个心情，<br/>或者什么都不做。</p><i aria-hidden="true"/></aside>
      <div className="dp-desktop-shortcuts"><button onClick={()=>{setView('calendar');setOpen(true);pauseTraining();}}><span><CalendarDays size={23}/></span>心情日历</button><button onClick={()=>navigate('worry')}><span><Package size={23}/></span>烦恼寄存</button><button onClick={()=>openWeb('home')}><span><Home size={23}/></span>完整工作台</button></div>
      <div className="dp-pet-anchor" style={{left:currentPosition.x,top:currentPosition.y,width:petSize}}>
        {!open&&<button className="dp-greeting" style={{left:clamp(currentPosition.x+petSize/2,112,frame.width-112)-currentPosition.x}} onClick={()=>setOpen(true)}>{gesture|| (breath.status==='paused'?'我把训练停在这里啦。':pet.hello)}<span>点我展开 <ArrowRight size={11}/></span></button>}
        <button ref={petButton} className={`dp-pet-hit ${movingBreath?'dp-pet-breathing':''}`} aria-label={`${pet.name}，${open?'收起':'展开'}快捷气泡；拖动可移动位置`} aria-expanded={open} aria-controls="dp-pet-panel" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>{drag.current=null;suppressClick.current=true;}} onClick={toggle} onKeyDown={moveWithKeyboard} style={{'--breath-scale':movingBreath||breath.status==='paused'?breathScale:1}}><PetAvatar kind={kind} state={avatarState} parcel={data.worries.length>0}/></button>
        <div className="dp-pet-caption"><span>{pet.name}</span><small>{pausedLabel}</small></div>
        <button className="dp-pet-touch" aria-label={`摸摸${pet.name}`} onClick={petAction}><Heart size={13}/></button>
        {gesture&&open&&<span className="dp-gesture-toast" role="status">{gesture}</span>}
      </div>
      {open&&<section id="dp-pet-panel" ref={panel} className="dp-pet-panel" role="region" tabIndex={-1} aria-label={`${pet.name}的快捷气泡`} style={{left:panelLeft,top:panelTop,width:panelWidth,maxHeight:panelHeight}}>
        <div className="dp-panel-header"><div>{view!=='home'?<button aria-label="返回快捷入口" onClick={()=>navigate('home')}><ChevronLeft size={19}/></button>:<span className="dp-panel-avatar"><PetAvatar kind={kind} /></span>}<span><strong>{view==='home'?pet.name:TITLES[view]}</strong><small>{view==='home'?'在这里陪你一会儿':`${pet.name} · 桌宠入口`}</small></span></div><button aria-label="收起桌宠气泡" title="收起（Esc）" onClick={closePanel}><Minus size={18}/></button></div>
        <div className="dp-panel-content">{renderers[view]?.()}</div>
        <footer className="dp-panel-footer"><span><i/>{user?`${user.nickname} · 私密体验`:'访客 · 临时体验'}</span><button aria-label="桌宠偏好" onClick={()=>navigate('settings')}><Settings2 size={15}/></button></footer>
      </section>}
      <div className="dp-stage-tip"><Move size={14}/><span>拖动调整位置 · 点击展开 · Esc收起</span></div>
      <div className="dp-desktop-dock"><button aria-label={open?'收起桌宠':'唤起桌宠'} onClick={()=>open?closePanel():setOpen(true)} className="dp-dock-pet"><PetAvatar kind={kind}/></button><i/><button aria-label="打开桌宠聊天" onClick={()=>navigate('chat')}><MessageCircle size={19}/></button><button aria-label="打开桌宠心情日历" onClick={()=>navigate('calendar')}><CalendarDays size={19}/></button><button aria-label="打开桌宠呼吸训练" onClick={()=>navigate('breath')}><Wind size={19}/></button><button aria-label="打开桌宠偏好" onClick={()=>navigate('settings')}><Settings2 size={18}/></button></div>
      <div className="dp-desktop-clock"><Clock3 size={13}/><span>{now.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})}</span></div>
    </main>
    <footer className="dp-demo-footer"><span><ShieldCheck size={12}/>桌宠与Web入口各有独立记录 · 当前内容在刷新后重置</span><button onClick={()=>navigate('help')}>操作说明与演示范围 <CircleHelp size={12}/></button></footer>
  </div>;
}
