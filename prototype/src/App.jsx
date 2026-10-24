import React, { useEffect, useState } from 'react';
import {
  Bell, Bot, CalendarDays, ChevronRight, FlaskConical, Gamepad2, House, List,
  Menu, MessageCircle, Mic2, Search, ShieldCheck, Smile, UserCircle, X,
} from 'lucide-react';

const page = path => `${import.meta.env.BASE_URL}${path}`;

const navigation = [
  ['home', '首页', House, './'],
  ['companion', '陪伴交流', MessageCircle, 'companion.html'],
  ['calendar', '情绪日历', CalendarDays, 'calendar.html'],
  ['worry', '担忧桌宠', Bot, 'worry-room.html'],
  ['rehearsal', '对话排练', Mic2, 'rehearsal.html'],
  ['games', '减压小游戏', Gamepad2, 'games.html'],
  ['things', '事情整理', List, 'things-organize.html'],
  ['emotion', '情绪命名卡', Smile, 'emotion-card.html'],
  ['search', '信息查询', Search, 'info-query.html'],
];

const tools = [
  ['companion', '陪伴交流', '把心里的话说给一个不会催你的窗口听。', MessageCircle, 'brand'],
  ['calendar', '情绪日历', '用颜色和一句话记下每天的心情。', CalendarDays, 'sand'],
  ['worry-room', '担忧桌宠', '把抽象的担心放进房间，变成看得见的小物件。', Bot, 'mist'],
  ['rehearsal', '对话排练', '先在安全的沙盘里练习那句难开口的话。', Mic2, 'brand'],
  ['games', '减压小游戏', '弹珠轨道与呼吸节奏，两分钟把注意力还给身体。', Gamepad2, 'sand'],
  ['info-query', '信息查询', '查询情绪相关概念，附来源与不确定性提示。', Search, 'mist'],
  ['things-organize', '事情整理', '暂停整理思绪，或把任务拆成小步骤。', List, 'brand'],
  ['emotion-card', '情绪命名卡', '由你选择词语，描述此刻的感受。', Smile, 'sand'],
];

function Link({ href, children, className = '', ...rest }) {
  return <a href={page(href)} className={className} {...rest}>{children}</a>;
}

function Sidebar({ mobileOpen, closeMobile }) {
  return <aside className={`home-sidebar ${mobileOpen ? 'is-open' : ''}`}>
    <Link href="./" className="home-brand" onClick={closeMobile}>
      <span className="brand-mark"><img src={page('assets/404-mark.svg?v=4')} alt="404" /></span>
      <span><strong>NOTFOUND</strong><small>情绪自助演示原型</small></span>
    </Link>
    <nav className="home-nav" aria-label="主导航">
      {navigation.map(([key, label, Icon, href]) => <Link key={key} href={href} onClick={closeMobile} aria-current={key === 'home' ? 'page' : undefined} className={`home-nav-link ${key === 'home' ? 'active' : ''}`}>
        <Icon size={18} aria-hidden="true" />{label}
      </Link>)}
      <div className="home-nav-divider"><span>账户与设置</span></div>
      <Link href="profile.html" onClick={closeMobile} className="home-nav-link"><UserCircle size={18} aria-hidden="true" />个人主页</Link>
      <Link href="settings.html" onClick={closeMobile} className="home-nav-link"><ShieldCheck size={18} aria-hidden="true" />会话与隐私设置</Link>
    </nav>
    <div className="home-sidebar-foot">
      <div className="guest-box"><p>当前为未登录访客，记录仅保存在本机演示环境。</p>
        <div className="guest-actions"><Link href="login.html">登录</Link><Link href="register.html">注册</Link></div>
      </div>
    </div>
  </aside>;
}

function HeroGuest() {
  return <section className="guest-hero">
    <div className="guest-hero-copy">
      <span className="eyebrow-pill"><span aria-hidden="true">✦</span>低压陪伴 · 不用急着好起来</span>
      <h2>先和自己待一会儿，<br className="desktop-break" />再决定要不要说点什么。</h2>
      <p>404NOTFOUND 是一个情绪自助的练习空间：模拟陪伴对话、具象化担忧、预演难开口的对话、记录每天的情绪。所有回复与数据都是演示内容，不涉及真实 AI 服务，也不构成医疗建议。</p>
      <div className="guest-hero-actions">
        <Link href="login.html" className="button button-primary">登录演示账号</Link>
        <Link href="register.html" className="button button-outline">创建演示账号</Link>
        <Link href="companion.html" className="button button-quiet">先随便逛逛 <ChevronRight size={15} /></Link>
      </div>
      <p className="hero-note"><span aria-hidden="true">ⓘ</span>访客模式下可体验全部页面；记录仅保存在本机演示环境，不会同步到任何服务器。</p>
    </div>
    <div className="guest-hero-image">
      <img src="https://modao.cc/agent-py/media/generated_images/2026-10-14/18e087a80afa4d258a4c0fc7bf3b5e4d.jpg" alt="安静的桌面与茶杯" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = page('assets/worry-pet.png'); event.currentTarget.classList.add('local-fallback'); }} />
      <div className="hero-image-label"><span aria-hidden="true">☁</span>今日提示：只要记录一句，也算完成</div>
    </div>
  </section>;
}

function Record({ date, title, detail, action, href, muted }) {
  return <div className="record-row"><span className={`record-date ${muted ? 'muted' : ''}`}>{date}</span><div><p>{title}</p><small>{detail}</small></div><Link href={href}>{action}</Link></div>;
}

function UserHome({ mood, setMood, checkinMessage, saveMood }) {
  const moods = [['😌', '平静'], ['😴', '疲惫'], ['😟', '焦虑'], ['😔', '低落'], ['🙂', '轻松'], ['😶', '说不上来']];
  return <div className="user-view">
    <section className="user-hero">
      <div><p className="date-label">2026 年 10 月 14 日 星期三</p><h2>下午好，小满</h2><p>你已经连续记录情绪 6 天。今天想先聊聊，还是先安静记一笔？</p></div>
      <div className="user-stats"><div><strong>6</strong><span>连续记录（天）</span></div><i /><div><strong>3</strong><span>本周陪伴会话</span></div></div>
    </section>
    <section className="checkin-card">
      <div className="checkin-heading"><strong>今日情绪打卡</strong><span>{checkinMessage}</span></div>
      <div className="mood-list">{moods.map(([icon, label]) => <button key={label} className={`mood-button ${mood === label ? 'selected' : ''}`} aria-pressed={mood === label} onClick={() => setMood(label)}>{icon} {label}</button>)}</div>
      <div className="checkin-actions"><button className="button button-primary" onClick={saveMood}>保存今日记录</button><Link href="calendar.html" className="inline-link">查看情绪日历 <ChevronRight size={14} /></Link></div>
    </section>
    <section className="recent-card"><div className="section-heading"><h3>最近的记录</h3><Link href="calendar.html">全部记录 <ChevronRight size={14} /></Link></div>
      <Record date="10/14" title="陪伴交流 ·「今天开会前一直心慌」" detail="时长 12 分钟 · 演示对话记录" action="继续" href="companion.html" />
      <Record date="10/13" title="情绪打卡 · 疲惫（3 / 5）" detail="备注：加班到九点，回家路上听了会儿歌" action="查看" href="calendar.html" muted />
      <Record date="10/12" title="担忧盒 ·「怕被同事觉得我不专业」" detail="状态：已具象化 · 在第 2 天回看" action="打开" href="worry-room.html" muted />
    </section>
  </div>;
}

export default function App() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [view, setView] = useState('guest');
  const [mood, setMood] = useState('');
  const [checkinMessage, setCheckinMessage] = useState('选择此刻最接近的一种感受');
  useEffect(() => { if (mood) setCheckinMessage(`已选择：${mood}，可继续补充一句备注再保存`); }, [mood]);
  useEffect(() => { const closeMenu = event => { if (event.key === 'Escape') setMobileOpen(false); }; document.addEventListener('keydown', closeMenu); return () => document.removeEventListener('keydown', closeMenu); }, []);
  const saveMood = () => setCheckinMessage(mood ? `已选择：${mood}，今日记录已保存（演示）` : '请先选择一种感受');

  return <div className="current-home">
    <button className="mobile-home-bar" aria-label={mobileOpen ? '关闭导航菜单' : '打开导航菜单'} aria-expanded={mobileOpen} onClick={() => setMobileOpen(open => !open)}>{mobileOpen ? <X size={21} /> : <Menu size={21} />}<strong>404NOTFOUND</strong></button>
    <Sidebar mobileOpen={mobileOpen} closeMobile={() => setMobileOpen(false)} />
    <div className="home-workspace">
      <header className="home-topbar"><div className="topbar-heading"><span className="mobile-logo"><img src={page('assets/404-mark.svg?v=4')} alt="404" /></span><div><h1>首页</h1><p>2026 年 10 月 14 日 星期三 · 今天也慢慢来</p></div></div>
        <div className="topbar-actions"><span className="prototype-badge"><FlaskConical size={15} />演示原型</span><Link href="settings.html" aria-label="通知与提醒" className="topbar-icon"><Bell size={17} /></Link><Link href="profile.html" className="account-pill"><span>满</span><b>小满</b></Link></div>
      </header>
      <nav className="mobile-home-nav">{navigation.slice(0, 6).map(([key, label, Icon, href]) => <Link key={key} href={href} className={key === 'home' ? 'active' : ''}><Icon size={15} />{label}</Link>)}</nav>
      <main className="home-main"><div className="home-content">
        <section className="state-switch"><span><span className="switch-icon">◐</span>演示状态切换：对比「未登录访客」与「已登录用户」两种首页显示</span><div><button className={view === 'guest' ? 'selected' : ''} aria-pressed={view === 'guest'} onClick={() => setView('guest')}>未登录访客</button><button className={view === 'user' ? 'selected' : ''} aria-pressed={view === 'user'} onClick={() => setView('user')}>已登录用户</button></div></section>
        {view === 'guest' ? <div className="guest-view"><HeroGuest /><section className="recent-card guest-recent"><div className="recent-empty-icon">◷</div><div><h3>最近陪伴记录</h3><p>访客状态下没有历史记录。登录后，这里会显示你最近 3 次陪伴会话与情绪记录。</p><Link href="login.html" className="button button-soft">↪ 登录查看我的记录</Link></div></section></div> : <UserHome mood={mood} setMood={setMood} checkinMessage={checkinMessage} saveMood={saveMood} />}
        <section className="tools-section"><div className="section-heading"><div><h3>今天想做什么</h3><p>按当下的状态，挑一个入口开始</p></div></div><div className="tools-grid">{tools.map(([href, label, description, Icon, tone]) => <Link key={href} href={href} className="tool-card"><span className={`tool-icon ${tone}`}><Icon size={16} /></span><strong>{label}</strong><p>{description}</p></Link>)}</div></section>
        <section className="privacy-home-card"><ShieldCheck size={20} /><div><h3>隐私与留存说明</h3><ul><li>对话、情绪记录与担忧盒内容默认保存在本机演示环境，不接入任何真实后端。</li><li>默认留存 30 天，可在「会话与隐私设置」中改为 7 天、90 天或永久保留，也可随时一键清除。</li><li>清除操作不可恢复，执行前会有二次确认弹窗。</li></ul><Link href="settings.html">前往会话与隐私设置 <ChevronRight size={14} /></Link></div></section>
        <p className="demo-disclaimer"><span>ⓘ</span>本页面为演示原型：问候语、统计数据与记录示例均为模拟内容，未连接真实 AI、搜索、短信、邮箱或后端服务；页面不提供医疗诊断、治疗建议或风险评分。</p>
      </div></main>
    </div>
  </div>;
}
