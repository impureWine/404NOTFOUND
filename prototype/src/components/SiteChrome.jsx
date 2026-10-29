import React from 'react';
import { Bell, Bot, CalendarDays, ChevronRight, FlaskConical, Gamepad2, House, List, MessageCircle, Mic2, Search, ShieldCheck, Smile, UserCircle } from 'lucide-react';

const routeNames = { 'companion': 'companion', 'calendar': 'calendar', 'worry-room': 'worry', 'rehearsal': 'rehearsal', 'games': 'games', 'things-organize': 'things', 'emotion-card': 'emotion', 'info-query': 'search', 'settings': 'settings', 'home': 'home' };
const page = path => path.endsWith('.html') && routeNames[path.slice(0,-5)] ? `${import.meta.env.BASE_URL}#${routeNames[path.slice(0,-5)]}` : `${import.meta.env.BASE_URL}${path}`;

const navigation = [
  ['home', '首页', House, './'],
  ['companion', '陪伴交流', MessageCircle, 'companion.html'],
  ['calendar', '情绪日历', CalendarDays, 'calendar.html'],
  ['query-records', '查询记录', Search, './#query-records'],
  ['notes', '文字备忘与全部历史', List, './#notes'],
  ['records', '陪伴记录', MessageCircle, './#records'],
  ['deposit', '烦恼寄存所', List, './#deposit'],
  ['rehearsal-records', '我的排练表达', Mic2, './#rehearsal-records'],
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

export function Link({ href, children, className = '', ...rest }) {
  return <a href={page(href)} className={className} {...rest}>{children}</a>;
}

export function Sidebar({ mobileOpen, closeMobile, authenticated, nickname, onLogin, onAccount, onLogout, activePage = 'home', onNavigate, guestDescription = '访客可浏览全部功能；登录后读取和保存本人内容。' }) {
  return <aside className={`home-sidebar ${mobileOpen ? 'is-open' : ''}`}>
    <Link href="./" className="home-brand" onClick={closeMobile}>
      <span className="brand-mark"><img src={page('assets/404-mark.svg?v=4')} alt="404" /></span>
      <span><strong>NOTFOUND</strong><small>情绪自助与陪伴</small></span>
    </Link>
    <nav className="home-nav" aria-label="主导航">
      {navigation.map(([key, label, Icon, href]) => <Link key={key} href={href} onClick={event => { closeMobile(); if (onNavigate?.(key)) event.preventDefault(); }} aria-current={key === activePage ? 'page' : undefined} className={`home-nav-link ${key === activePage ? 'active' : ''}`}>
        <Icon size={18} aria-hidden="true" />{label}
      </Link>)}
      <div className="home-nav-divider"><span>账户与设置</span></div>
      <button type="button" onClick={() => { closeMobile(); onAccount(); }} className="home-nav-link"><UserCircle size={18} aria-hidden="true" />个人主页</button>
      <Link href="settings.html" onClick={closeMobile} className="home-nav-link"><ShieldCheck size={18} aria-hidden="true" />会话与隐私设置</Link>
    </nav>
    <div className="home-sidebar-foot">
      <div className="guest-box"><p>{authenticated ? `当前账号：${nickname || '已登录用户'}` : guestDescription}</p>
        <div className="guest-actions">{authenticated
          ? <button type="button" onClick={onLogout}>退出登录</button>
          : <><button type="button" onClick={() => onLogin('login')}>登录</button><button type="button" onClick={() => onLogin('register')}>注册</button></>}
        </div>
      </div>
    </div>
  </aside>;
}

export function HeroGuest({ onLogin, onBrowse }) {
  return <section className="guest-hero">
    <div className="guest-hero-copy">
      <span className="eyebrow-pill"><span aria-hidden="true">✦</span>低压陪伴 · 不用急着好起来</span>
      <h2>先和自己待一会儿，<br className="desktop-break" />再决定要不要说点什么。</h2>
      <p>404NOTFOUND 是一个情绪自助的练习空间：模拟陪伴对话、具象化担忧、预演难开口的对话、记录每天的情绪。所有回复与数据都是演示内容，不涉及真实 AI 服务，也不构成医疗建议。</p>
      <div className="guest-hero-actions">
        <button type="button" className="button button-primary" onClick={() => onLogin('login')}>登录</button>
        <button type="button" className="button button-outline" onClick={() => onLogin('register')}>创建账户</button>
        <Link href="companion.html" className="button button-quiet" onClick={event => { if (onBrowse) { event.preventDefault(); onBrowse(); } }}>先随便逛逛 <ChevronRight size={15} /></Link>
      </div>
      <p className="hero-note"><span aria-hidden="true">ⓘ</span>访客模式下可体验全部页面；记录仅保存在本机演示环境，不会同步到任何服务器。</p>
    </div>
    <div className="guest-hero-image">
      <img src="https://modao.cc/agent-py/media/generated_images/2026-10-14/18e087a80afa4d258a4c0fc7bf3b5e4d.jpg" alt="安静的桌面与茶杯" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = page('assets/worry-pet.png'); event.currentTarget.classList.add('local-fallback'); }} />
      <div className="hero-image-label"><span aria-hidden="true">☁</span>今日提示：只要记录一句，也算完成</div>
    </div>
  </section>;
}


export function SiteTopbar({ title = '首页', dateLabel, authStatus, nickname, showAccount, activePage = 'home', onNavigate }) {
  return <><header className="home-topbar"><div className="topbar-heading"><span className="mobile-logo"><img src={page('assets/404-mark.svg?v=4')} alt="404" /></span><div><h1>{title}</h1><p>{dateLabel} · 今天也慢慢来</p></div></div>
        <div className="topbar-actions"><span className="prototype-badge"><FlaskConical size={15} />{authStatus === 'unavailable' ? '服务未连接 · 可预览' : authStatus === 'checking' ? '连接核验中 · 可预览' : ['guest', 'anonymous'].includes(authStatus) ? '访客预览 · 功能开放' : '真实服务'}</span><Link href="settings.html" aria-label="通知与提醒" className="topbar-icon"><Bell size={17} /></Link><button type="button" onClick={showAccount} className="account-pill"><span>{authStatus === 'authenticated' ? nickname.slice(0, 1) : <UserCircle size={16} />}</span><b>{authStatus === 'checking' ? '核验中' : authStatus === 'authenticated' ? nickname : '访客浏览'}</b></button></div>
      </header>
      <nav className="mobile-home-nav">{navigation.slice(0, 6).map(([key, label, Icon, href]) => <Link key={key} href={href} onClick={event => { if (onNavigate?.(key)) event.preventDefault(); }} className={key === activePage ? 'active' : ''}><Icon size={15} />{label}</Link>)}</nav></>;
}

export function ToolsSection({ onNavigate }) {
  return <section className="tools-section"><div className="section-heading"><div><h3>今天想做什么</h3><p>按当下的状态，挑一个入口开始</p></div></div><div className="tools-grid">{tools.map(([href, label, description, Icon, tone]) => <Link key={href} href={`${href}.html`} onClick={event => { if (onNavigate?.(href)) event.preventDefault(); }} className="tool-card"><span className={`tool-icon ${tone}`}><Icon size={16} /></span><strong>{label}</strong><p>{description}</p></Link>)}</div></section>;
}
