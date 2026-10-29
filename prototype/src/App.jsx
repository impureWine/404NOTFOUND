import React, { useEffect, useState } from 'react';
import { ChevronRight, Menu, ShieldCheck, X } from 'lucide-react';
import { AuthDialog } from './auth/AuthDialog.jsx';
import { RecordsPanel } from './records/RecordsPanel.jsx';
import { useAuth } from './auth/useAuth.js';
import { HeroGuest, Link, Sidebar, SiteTopbar, ToolsSection } from './components/SiteChrome.jsx';
import { RecordVault } from './records/RecordVault.jsx';
import { TextDestructionTool } from './req14/TextDestructionTool.jsx';

function UserHome({ profile, identityKey, onAccount, onLogout }) {
  const nickname = profile?.nickname || profile?.loginName || '已登录用户';
  return <div className="user-view">
    <section className="user-hero">
      <div><p className="date-label">账号已通过认证服务核验</p><h2>你好，{nickname}</h2><p>陪伴记录与情绪日历仅访问本人当前入口的记录。保存与清除都需要你明确确认。</p></div>
      <div className="account-summary-actions"><button type="button" className="button button-outline" onClick={onAccount}>查看账户信息</button><button type="button" className="button button-quiet" onClick={onLogout}>退出登录</button></div>
    </section>
    <section className="recent-card account-limits"><div className="section-heading"><h3>个人资料</h3><span>私密账户信息</span></div>
      <p><strong>昵称</strong><span>{nickname}</span></p>
      <p><strong>简介</strong><span>{profile?.bio || '尚未填写'}</span></p>
      <p className="account-limit-note">下方可主动保存陪伴记录、记录情绪并读取历史。个人资料编辑尚未接入。</p>
    </section>
    <RecordVault authenticated accountKey={identityKey} />
  </div>;
}

export default function App() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [recordView, setRecordView] = useState(() => location.hash === '#calendar' ? 'EMOTION' : 'CONVERSATION');
  const navigate = key => { if (!['calendar', 'records', 'home'].includes(key)) return false; const kind = key === 'calendar' ? 'EMOTION' : 'CONVERSATION'; setRecordView(kind); location.hash = key === 'calendar' ? 'calendar' : 'records'; return true; };
  const {
    status: authStatus,
    profile,
    identityKey,
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
    <Sidebar mobileOpen={mobileOpen} closeMobile={() => setMobileOpen(false)} authenticated={authStatus === 'authenticated'} nickname={nickname} onLogin={openAuth} onAccount={showAccount} onLogout={logout} activePage={recordView === 'EMOTION' ? 'calendar' : 'home'} onNavigate={navigate} />
    <div className="home-workspace">
      <SiteTopbar dateLabel={dateLabel} authStatus={authStatus} nickname={nickname} showAccount={showAccount} onNavigate={navigate} />
      <main className="home-main"><div className="home-content">
        {pageNotice && <div className="home-auth-notice" role="status"><span>{pageNotice}</span>{logoutPending && <button type="button" className="inline-link" onClick={retryLogout}>重新核实退出</button>}</div>}
        <section className="state-switch"><span><span className="switch-icon">◐</span>{authStatus === 'authenticated' ? `已登录：${nickname} · 私密内容仅在身份核验后显示` : authStatus === 'checking' ? '正在从认证服务核验当前身份' : authStatus === 'unavailable' ? '认证服务暂不可用；私密内容保持隐藏' : '当前为未登录访客，可以先浏览公开演示入口'}</span>{authStatus === 'authenticated' ? <button type="button" className="auth-state-action" onClick={logout}>退出登录</button> : <button type="button" className="auth-state-action" onClick={() => openAuth('login')}>登录账户</button>}</section>
        {authStatus === 'authenticated'
          ? <UserHome key={identityKey} identityKey={identityKey} profile={profile} onAccount={showAccount} onLogout={logout} />
          : <div className="guest-view"><HeroGuest onLogin={openAuth} /><section className="recent-card guest-recent"><div className="recent-empty-icon">◷</div><div><h3>最近陪伴记录</h3><p>登录状态已接入认证服务；登录后可读取本人主动保存的记录。</p><button type="button" className="button button-soft" onClick={() => openAuth('login')}>登录后查看账户状态</button></div></section></div>}
        {authStatus === 'authenticated' && <><nav aria-label="真实记录入口"><button className="button button-soft" onClick={() => navigate('records')}>陪伴记录</button><button className="button button-soft" onClick={() => navigate('calendar')}>情绪日历</button></nav><RecordsPanel key={`${identityKey}:${recordView}`} kind={recordView} /></>}
        <TextDestructionTool />
        <ToolsSection onNavigate={navigate} />
        <section className="privacy-home-card"><ShieldCheck size={20} /><div><h3>隐私与留存说明</h3><ul><li>登录、注册与退出会调用当前配置的同源认证 API；密码不写入浏览器存储，也不进入 URL。</li><li>Cookie 由服务端设置并通过浏览器凭据通道发送；前端不读取 Cookie 原文。</li><li>本页陪伴记录和情绪日历调用真实记录 API；其他独立页面仍可能使用演示内容。</li></ul><Link href="settings.html">前往会话与隐私设置 <ChevronRight size={14} /></Link></div></section>
        <p className="demo-disclaimer"><span>ⓘ</span>账号界面仅在认证服务确认后显示私密身份信息；本页记录接入真实服务；独立页面中的 AI 和搜索演示不代表真实调用。页面不提供医疗诊断、治疗建议或风险评分。</p>
      </div></main>
    </div>
    {authView && <AuthDialog mode={authView} status={authStatus} profile={profile} busy={authBusy} error={authError} notice={authNotice} onModeChange={openAuth} onClose={closeAuth} onSubmit={submitAuth} onLogout={logout} />}
  </div>;
}
