import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, LogIn, LogOut, Menu, ShieldCheck, UserRound, X } from 'lucide-react';
import { PrototypeContext, emptyData } from './context.jsx';
import { apiClient, apiMode, apiStatusLabel } from './api/client.js';
import { MOCK_DATA_MANIFEST } from './api/mock-data-manifest.js';
import { NAV, routeNav, routeTitle, ROUTES } from './routes.jsx';
import { Modal } from './ui.jsx';
import { DesktopPet } from './pet/DesktopPet.jsx';

export default function App(){
  const [route,setRoute]=useState(()=>window.location.hash==='#pet'?'pet':'home'),[currentId,setCurrentId]=useState(null),[buckets,setBuckets]=useState({guest:emptyData(),A:emptyData(),B:emptyData()});
  const [loginReturn,setLoginReturn]=useState(null);
  const [accounts,setAccounts]=useState({A:{username:'demo_a',password:'demo1234',nickname:'小晴',avatar:'晴',bio:''},B:{username:'demo_b',password:'demo1234',nickname:'小林',avatar:'林',bio:''}});
  const [menuOpen,setMenuOpen]=useState(false),[mobileOpen,setMobileOpen]=useState(false),[modal,setModal]=useState(null),[notice,setNotice]=useState(''),[exitWarning,setExitWarning]=useState('');
  const menu=useRef(null); const owner=currentId||'guest',user=currentId?{...accounts[currentId],id:currentId}:null,data=buckets[owner]||emptyData();
  const closeModal=useCallback(()=>setModal(null),[]);
  const directGo=next=>{setExitWarning('');setRoute(next);setMenuOpen(false);setMobileOpen(false);window.history.replaceState(null,'',next==='pet'?'#pet':window.location.pathname+window.location.search);window.scrollTo({top:0,behavior:'instant'});};
  const go=(next,{force=false,returnTo=null}={})=>{if(next===route){setMobileOpen(false);return;}const proceed=()=>{if(next==='login')setLoginReturn(returnTo);directGo(next);}; if(exitWarning&&!force){setModal({title:'退出当前流程？',body:<p>{exitWarning}</p>,cancelLabel:'继续当前流程',confirmLabel:'退出并前往',confirm:proceed});}else proceed();};
  const updateData=(category,updater)=>setBuckets(all=>({...all,[owner]:{...(all[owner]||emptyData()),[category]:typeof updater==='function'?updater((all[owner]||emptyData())[category]):updater}}));
  const logout=(destination='home')=>setModal({title:'退出演示账户？',body:<p>当前账户主动保存的模拟记录仍在本次浏览器演示中。访客与另一个账户各有独立记录，不会互相复制。</p>,confirmLabel:'退出登录',confirm:()=>{setCurrentId(null);directGo(destination);setNotice('已退出，当前为访客模式');}});
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),3000);return()=>clearTimeout(t);},[notice]);
  useEffect(()=>{const close=e=>{if(e.key==='Escape'){setMenuOpen(false);setMobileOpen(false);}if(e.type==='pointerdown'&&menu.current&&!menu.current.contains(e.target))setMenuOpen(false);};document.addEventListener('pointerdown',close);document.addEventListener('keydown',close);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',close)};},[]);
  useEffect(()=>{document.title=`${routeTitle(route)} · 404NOTFOUND`;},[route]);
  const Page=ROUTES[route]?.page||ROUTES.home.page;const auth=Boolean(ROUTES[route]?.auth);const navGroup=routeNav(route);
  const value={route,go,directGo,user,accounts,setAccounts,login:id=>{setCurrentId(id);directGo(loginReturn||'profile');setLoginReturn(null);setNotice('登录成功（演示）。访客记录未转入账户。');},logout,data,updateData,notify:setNotice,ask:setModal,setExitWarning,apiClient,apiMode,apiStatusLabel,mockDataManifest:MOCK_DATA_MANIFEST,clearRecords:()=>{setBuckets(all=>({...all,[owner]:{...emptyData(),settings:(all[owner]||emptyData()).settings,showExamples:false}}));setNotice('当前身份的Web入口模拟记录已清除');}};
  return <PrototypeContext.Provider value={value}><DesktopPet active={route==='pet'}/>{route!=='pet'&&<div className={`app-shell ${auth?'auth-shell':''}`}>
    {!auth&&<><div className="mobile-bar"><strong>404NOTFOUND</strong><button className="icon-button" aria-label={mobileOpen?'关闭导航菜单':'打开导航菜单'} aria-expanded={mobileOpen} onClick={()=>setMobileOpen(!mobileOpen)}>{mobileOpen?<X size={21}/>:<Menu size={21}/>}</button></div><aside className={`sidebar ${mobileOpen?'mobile-open':''}`}><button className="brand brand-button" onClick={()=>go('home')} aria-label="404NOTFOUND 返回首页"><span className="brand-mark">4</span><span><strong>404NOTFOUND</strong><small>404烦恼未找到</small></span></button><nav aria-label="主导航">{NAV.map(([key,label,Icon])=><button key={key} aria-current={navGroup===key?'page':undefined} className={`nav-item ${navGroup===key?'active':''}`} onClick={()=>go(key)}><Icon size={18}/>{label}</button>)}</nav><div className="sidebar-foot"><span>课堂演示 · 原型模拟</span><span>{apiStatusLabel}</span><span>陪伴回复与查询为预设；账户记录在浏览器内存模拟</span><button className="link-btn" onClick={()=>go('entries')}>桌宠 / 微信入口规划</button></div></aside></>}
    <main className="main-area">{!auth&&<header className="topbar"><span className="topbar-title">工作台 / {ROUTES[route]?.title||routeTitle(route)}</span><div className="account-wrap" ref={menu}><button className="account-btn" aria-expanded={menuOpen} onClick={()=>setMenuOpen(!menuOpen)}>{user?<span className="account-avatar">{user.avatar}</span>:<UserRound size={16}/>} {user?user.nickname:'访客模式'}<ChevronDown size={14}/></button>{menuOpen&&<div className="account-menu"><strong>{user?`演示账户 ${user.username}`:'当前为访客模式'}</strong><span>{user?'记录仅在主动保存后显示':'可直接使用核心模拟功能'}</span><button onClick={()=>go('profile')}><UserRound size={15}/>个人主页</button><button onClick={()=>go('privacy')}><ShieldCheck size={15}/>会话与隐私</button><button onClick={()=>{setMenuOpen(false);user?logout():go('login')}}>{user?<LogOut size={15}/>:<LogIn size={15}/>} {user?'退出登录':'登录 / 注册'}</button></div>}</div></header>}<div className="page-wrap"><Page key={`${owner}-${route}`} {...(route==='destroy'?{onExit:()=>directGo('home')}:{})}/></div></main>
    </div>}{notice&&<div className="toast" role="status"><Check size={16}/>{notice}</div>}{modal&&<Modal {...modal} close={closeModal}/>}</PrototypeContext.Provider>;
}

