import React, { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { AuthDialog } from './auth/AuthDialog.jsx';
import { useAuth } from './auth/useAuth.js';
import { Sidebar, SiteTopbar, ToolsSection } from './components/SiteChrome.jsx';
import { RecordVault } from './records/RecordVault.jsx';
import { RecordsPanel } from './records/RecordsPanel.jsx';
import { Dialogue } from './live/Dialogue.jsx';
import { Search } from './live/Search.jsx';
import { Library } from './live/Library.jsx';
import { Training } from './live/Training.jsx';
import { Naming } from './live/Naming.jsx';
import { Settings } from './live/Settings.jsx';
import { PhysicsGame, PrivateText } from './live/Games.jsx';
import './live/live.css';

const aliases = { 'worry-room': 'worry', 'info-query': 'search', 'emotion-card': 'emotion', 'things-organize': 'things', 'profile': 'settings' };
const titles = { notes: '文字备忘与全部历史', 'query-records': '查询记录', home: '首页', companion: '陪伴交流', records: '陪伴记录', calendar: '情绪日历', worry: '烦恼物件化', rehearsal: '对话排练', 'rehearsal-records': '我的排练表达', deposit: '烦恼寄存所', things: '事情整理', search: '信息查询', emotion: '情绪命名卡', games: '减压练习与小游戏', training: '五感安定', breathing: '呼吸调节', 'pause-organize': '暂停整理', 'task-splitting': '任务拆分', marbles: '禅意编曲弹珠机', pressure: '屏幕无损发泄', 'private-text': '文字焚化与黑洞', settings: '个人主页与隐私设置', login: '登录', register: '注册' };
const readRoute = () => { const value = location.hash.slice(1); return aliases[value] || (titles[value] ? value : 'home'); };
const privateRoutes = new Set(['notes', 'records', 'worry', 'deposit', 'rehearsal-records', 'query-records', 'settings']);
export default function App() {
  const [mobileOpen, setMobileOpen] = useState(false), [route, setRoute] = useState(readRoute), [selection, setSelection] = useState(null);
  const auth = useAuth();
  const identityEpoch = useRef(0), lastIdentity = useRef(`${auth.status}:${auth.identityKey}`);
  if (lastIdentity.current !== `${auth.status}:${auth.identityKey}`) { identityEpoch.current += 1; lastIdentity.current = `${auth.status}:${auth.identityKey}`; }
  useEffect(() => { const update = () => { setRoute(readRoute()); setMobileOpen(false); setSelection(null); }; window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  useEffect(() => { if (route === 'login' || route === 'register') auth.openAuth(route); }, [route]);
  const navigate = (key, text = '') => { const value = aliases[key] || key; if (!titles[value]) return false;
    // User-selected text stays in memory, never in the URL or browser storage.
    if (location.hash !== `#${value}`) { history.pushState(null, '', `#${value}`); }
    setSelection(text ? { route: value, text, epoch: identityEpoch.current } : null); setRoute(value); setMobileOpen(false); return true;
  };
  useEffect(() => { const back = () => { setRoute(readRoute()); setSelection(null); }; window.addEventListener('popstate', back); return () => window.removeEventListener('popstate', back); }, []);
  const nickname = auth.profile?.nickname || '已登录用户';
  const authenticated = auth.status === 'authenticated';
  const showAccount = () => authenticated ? navigate('settings') : auth.openAuth('login');
  const initialText = selection?.route === route && selection.epoch === identityEpoch.current ? selection.text : '';
  let content;
  if (route === 'calendar') content = <RecordsPanel kind="EMOTION" readOnly={!authenticated} onLogin={() => auth.openAuth('login')} />;
  else if (privateRoutes.has(route) && !authenticated) content = <section className="live-records recent-card"><h2>{titles[route]}</h2><p>{auth.status === 'checking' ? '正在核验身份…' : '请登录后读取和保存本人记录。服务不可用时不会显示模拟内容。'}</p><button onClick={() => auth.openAuth('login')}>登录</button></section>;
  else if (route === 'notes') content = <RecordVault authenticated accountKey={auth.identityKey} />;
  else if (route === 'records') content = <RecordsPanel kind="CONVERSATION" />;
  else if (['companion','things','rehearsal'].includes(route)) content = <Dialogue mode={route === 'rehearsal' ? 'REHEARSE' : route === 'things' ? 'ORGANIZE' : 'LISTEN'} initialText={initialText} />;
  else if (route === 'search') content = <Search initialText={initialText} />;
  else if (['worry','deposit','rehearsal-records','query-records'].includes(route)) content = <Library kind={({ 'query-records': 'QUERY', worry: 'WORRY_OBJECT', deposit: 'DEPOSIT', 'rehearsal-records': 'REHEARSAL_DRAFT' })[route]} onOrganize={text => navigate('things', text)} />;
  else if (route === 'emotion') content = <Naming onChoose={navigate} />;
  else if (route === 'settings') content = <Settings onLogout={auth.logout} />;
  else if (['training','breathing','pause-organize','task-splitting'].includes(route)) content = <Training definition={({ training: 'FIVE_SENSES', breathing: 'BREATHING', 'pause-organize': 'PAUSE_ORGANIZE', 'task-splitting': 'TASK_SPLIT' })[route]} onExit={() => navigate('games')} onOrganize={text => navigate('things', text)} />;
  else if (route === 'private-text') content = <PrivateText />;
  else if (route === 'marbles' || route === 'pressure') content = <PhysicsGame mode={route === 'pressure' ? 'pressure' : 'marbles'} />;
  else if (route === 'games') content = <section className="live-records recent-card"><h2>减压练习与小游戏</h2>{['breathing','training','pause-organize','task-splitting','pressure','private-text','marbles'].map(key => <button key={key} onClick={() => navigate(key)}>{titles[key]}</button>)}<p>固定训练与小游戏在本机执行，不需要模型服务；未开始不推进，暂停冻结，离开页面会停止。</p></section>;
  else content = <><section className="guest-hero"><div className="guest-hero-copy"><h2>先和自己待一会儿，再决定下一步。</h2><p>陪伴、查询和排练连接真实服务；记录由你主动保存。可以只做一次练习，不要求每日打卡。</p>{!authenticated && <><button className="button button-primary" onClick={() => auth.openAuth('login')}>登录</button><button className="button button-outline" onClick={() => auth.openAuth('register')}>注册</button></>}<button className="button button-soft" onClick={() => navigate('companion')}>开始陪伴交流</button></div></section><ToolsSection onNavigate={navigate} /><section className="live-records recent-card"><h3>本人内容</h3>{['notes','records','calendar','worry','deposit','rehearsal-records','query-records','settings'].map(key => <button key={key} onClick={() => navigate(key)}>{titles[key]}</button>)}</section></>;
  return <div className={`current-home ${new URLSearchParams(location.search).get('overlay') === 'pressure' ? 'desktop-overlay' : ''}`}><button className="mobile-home-bar" onClick={() => setMobileOpen(value => !value)} aria-label="切换导航">{mobileOpen ? <X /> : <Menu />}<strong>404NOTFOUND</strong></button>
    <Sidebar mobileOpen={mobileOpen} closeMobile={() => setMobileOpen(false)} authenticated={authenticated} nickname={nickname} onLogin={auth.openAuth} onAccount={showAccount} onLogout={auth.logout} activePage={route} onNavigate={navigate} />
    <div className="home-workspace"><SiteTopbar title={titles[route]} dateLabel={new Date().toLocaleDateString('zh-CN')} authStatus={auth.status} nickname={nickname} showAccount={showAccount} activePage={route} onNavigate={navigate} /><main className="home-main"><div className="home-content">
      {auth.pageNotice && <div className="home-auth-notice" role="status">{auth.pageNotice}{auth.logoutPending && <button onClick={auth.retryLogout}>重新核实退出</button>}</div>}
      <div key={`${route}:${['training','breathing','pause-organize','task-splitting'].includes(route) ? auth.identityKey : identityEpoch.current}`} className="live-route">{content}</div>
      <p className="demo-disclaimer">账号身份与私密数据由服务端校验。AI 输出可能出错，不提供诊断或治疗保证。桌面与微信部署说明见仓库文档。</p>
    </div></main></div>
    {auth.authView && <AuthDialog mode={auth.authView} status={auth.status} profile={auth.profile} busy={auth.busy} error={auth.error} notice={auth.notice} onModeChange={auth.openAuth} onClose={auth.closeAuth} onSubmit={auth.submit} onLogout={auth.logout} />}
  </div>;
}
