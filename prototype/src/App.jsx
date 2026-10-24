import React, { useEffect, useState } from 'react';
import {
  Bell, Bot, CalendarDays, ChevronRight, FlaskConical, Gamepad2, House, List,
  Menu, MessageCircle, Mic2, Search, ShieldCheck, Smile, UserCircle, X,
} from 'lucide-react';
import { AuthDialog } from './auth/AuthDialog.jsx';
import { useAuth } from './auth/useAuth.js';

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

function Sidebar({ mobileOpen, closeMobile, authenticated, nickname, onLogin, onAccount, onLogout }) {
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
      <button type="button" onClick={() => { closeMobile(); onAccount(); }} className="home-nav-link"><UserCircle size={18} aria-hidden="true" />个人主页</button>
      <Link href="settings.html" onClick={closeMobile} className="home-nav-link"><ShieldCheck size={18} aria-hidden="true" />会话与隐私设置</Link>
    </nav>
    <div className="home-sidebar-foot">
      <div className="guest-box"><p>{authenticated ? `当前账号：${nickname || '已登录用户'}` : '访客体验；登录状态由认证服务确认。'}</p>
        <div className="guest-actions">{authenticated
          ? <button type="button" onClick={onLogout}>退出登录</button>
          : <><button type="button" onClick={() => onLogin('login')}>登录</button><button type="button" onClick={() => onLogin('register')}>注册</button></>}
        </div>
      </div>
    </div>
  </aside>;
}

function HeroGuest({ onLogin }) {
  return <section className="guest-hero">
    <div className="guest-hero-copy">
      <span className="eyebrow-pill"><span aria-hidden="true">✦</span>低压陪伴 · 不用急着好起来</span>
      <h2>先和自己待一会儿，<br className="desktop-break" />再决定要不要说点什么。</h2>
      <p>404NOTFOUND 是一个情绪自助的练习空间：模拟陪伴对话、具象化担忧、预演难开口的对话、记录每天的情绪。所有回复与数据都是演示内容，不涉及真实 AI 服务，也不构成医疗建议。</p>
      <div className="guest-hero-actions">
        <button type="button" className="button button-primary" onClick={() => onLogin('login')}>登录</button>
        <button type="button" className="button button-outline" onClick={() => onLogin('register')}>创建账户</button>
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

function UserHome({ profile, onAccount, onLogout }) {
  const nickname = profile?.nickname || profile?.loginName || '已登录用户';
  return <div className="user-view">
    <section className="user-hero">
      <div><p className="date-label">账号已通过认证服务核验</p><h2>你好，{nickname}</h2><p>当前只接入账号与个人资料读取；陪伴记录和情绪日历尚未连接真实服务。</p></div>
      <div className="account-summary-actions"><button type="button" className="button button-outline" onClick={onAccount}>查看账户信息</button><button type="button" className="button button-quiet" onClick={onLogout}>退出登录</button></div>
    </section>
    <section className="recent-card account-limits"><div className="section-heading"><h3>个人资料</h3><span>私密账户信息</span></div>
      <p><strong>昵称</strong><span>{nickname}</span></p>
      <p><strong>简介</strong><span>{profile?.bio || '尚未填写'}</span></p>
      <p className="account-limit-note">个人资料编辑、内容记录与保存接口尚未联调；此页面不会使用演示数据冒充真实账户内容。</p>
    </section>
  </div>;
}

export default function App() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const {
    status: authStatus,
    profile,
    authView,
    busy: authBusy,
    error: authError,
    notice: authNotice,
    pageNotice,
    logoutPending,
    openAuth,
    closeAuth,
    submit: submitAuth,
    logout,
    retryLogout,
  } = useAuth();
  const nickname = profile?.nickname || profile?.loginName || '已登录用户';
  const dateLabel = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());

  useEffect(() => {
    const closeMenu = event => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', closeMenu);
    return () => document.removeEventListener('keydown', closeMenu);
  }, []);

  const showAccount = () => openAuth(authStatus === 'authenticated' ? 'account' : 'login');

  return <div className="current-home">
    <button className="mobile-home-bar" aria-label={mobileOpen ? '关闭导航菜单' : '打开导航菜单'} aria-expanded={mobileOpen} onClick={() => setMobileOpen(open => !open)}>{mobileOpen ? <X size={21} /> : <Menu size={21} />}<strong>404NOTFOUND</strong></button>
    <Sidebar mobileOpen={mobileOpen} closeMobile={() => setMobileOpen(false)} authenticated={authStatus === 'authenticated'} nickname={nickname} onLogin={openAuth} onAccount={showAccount} onLogout={logout} />
    <div className="home-workspace">
      <header className="home-topbar"><div className="topbar-heading"><span className="mobile-logo"><img src={page('assets/404-mark.svg?v=4')} alt="404" /></span><div><h1>首页</h1><p>{dateLabel} · 今天也慢慢来</p></div></div>
        <div className="topbar-actions"><span className="prototype-badge"><FlaskConical size={15} />演示原型</span><Link href="settings.html" aria-label="通知与提醒" className="topbar-icon"><Bell size={17} /></Link><button type="button" onClick={showAccount} className="account-pill"><span>{authStatus === 'authenticated' ? nickname.slice(0, 1) : <UserCircle size={16} />}</span><b>{authStatus === 'checking' ? '核验中' : authStatus === 'authenticated' ? nickname : '访客登录'}</b></button></div>
      </header>
      <nav className="mobile-home-nav">{navigation.slice(0, 6).map(([key, label, Icon, href]) => <Link key={key} href={href} className={key === 'home' ? 'active' : ''}><Icon size={15} />{label}</Link>)}</nav>
      <main className="home-main"><div className="home-content">
        {pageNotice && <div className="home-auth-notice" role="status"><span>{pageNotice}</span>{logoutPending && <button type="button" className="inline-link" onClick={retryLogout}>重新核实退出</button>}</div>}
        <section className="state-switch"><span><span className="switch-icon">◐</span>{authStatus === 'authenticated' ? `已登录：${nickname} · 私密内容仅在身份核验后显示` : authStatus === 'checking' ? '正在从认证服务核验当前身份' : authStatus === 'unavailable' ? '认证服务暂不可用；私密内容保持隐藏' : '当前为未登录访客，可以先浏览公开演示入口'}</span>{authStatus === 'authenticated' ? <button type="button" className="auth-state-action" onClick={logout}>退出登录</button> : <button type="button" className="auth-state-action" onClick={() => openAuth('login')}>登录账户</button>}</section>
        {authStatus === 'authenticated'
          ? <UserHome profile={profile} onAccount={showAccount} onLogout={logout} />
          : <div className="guest-view"><HeroGuest onLogin={openAuth} /><section className="recent-card guest-recent"><div className="recent-empty-icon">◷</div><div><h3>最近陪伴记录</h3><p>登录状态已接入认证服务；私密记录接口尚未联调，因此这里不会展示模拟历史。</p><button type="button" className="button button-soft" onClick={() => openAuth('login')}>登录后查看账户状态</button></div></section></div>}
        <section className="tools-section"><div className="section-heading"><div><h3>今天想做什么</h3><p>按当下的状态，挑一个入口开始</p></div></div><div className="tools-grid">{tools.map(([href, label, description, Icon, tone]) => <Link key={href} href={href} className="tool-card"><span className={`tool-icon ${tone}`}><Icon size={16} /></span><strong>{label}</strong><p>{description}</p></Link>)}</div></section>
        <section className="privacy-home-card"><ShieldCheck size={20} /><div><h3>隐私与留存说明</h3><ul><li>登录、注册与退出会调用当前配置的同源认证 API；密码不写入浏览器存储，也不进入 URL。</li><li>Cookie 由服务端设置并通过浏览器凭据通道发送；前端不读取 Cookie 原文。</li><li>陪伴、情绪记录、搜索和其他业务入口仍是演示内容，不代表已连接真实后端。</li></ul><Link href="settings.html">前往会话与隐私设置 <ChevronRight size={14} /></Link></div></section>
        <p className="demo-disclaimer"><span>ⓘ</span>账号界面仅在认证服务确认后显示私密身份信息；业务记录、AI 和搜索仍未完成真实联调。页面不提供医疗诊断、治疗建议或风险评分。</p>
      </div></main>
    </div>
    {authView && <AuthDialog mode={authView} status={authStatus} profile={profile} busy={authBusy} error={authError} notice={authNotice} onModeChange={openAuth} onClose={closeAuth} onSubmit={submitAuth} onLogout={logout} />}
  </div>;
}
