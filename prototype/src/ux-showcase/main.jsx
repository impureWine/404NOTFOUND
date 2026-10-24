import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, Layers } from 'lucide-react';
import { AppShell, Button, StatusBadge } from './components.jsx';
import { ChatPreview, HomePreview, LoginPreview, SourcesPreview } from './pages.jsx';
import { SCENES, STATES } from './data.js';
import './showcase.css';

function readScenario() {
  const params = new URLSearchParams(window.location.search);
  return {
    page: SCENES.some(item => item.id === params.get('page')) ? params.get('page') : 'home',
    state: STATES.some(item => item.id === params.get('state')) ? params.get('state') : 'normal',
  };
}
function Showcase() {
  const [scenario, setScenario] = useState(readScenario);
  const [revision, setRevision] = useState(0);
  const [shareNotice, setShareNotice] = useState('');
  const scene = SCENES.find(item => item.id === scenario.page);
  const state = STATES.find(item => item.id === scenario.state);
  useEffect(() => {
    // URL 仅放场景键与状态键，绝不写入输入正文或凭据。
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({ page: scenario.page, state: scenario.state }).toString();
    window.history.replaceState(null, '', url);
    document.title = `${scene.label} · ${scene.code}-${state.code} · UX 组件展示`;
  }, [scenario.page, scenario.state, scene.label, scene.code, state.code]);
  useEffect(() => {
    const restore = () => { setScenario(readScenario()); setRevision(previous => previous + 1); };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  function select(next) { setScenario(next); setRevision(previous => previous + 1); setShareNotice(''); }
  const setStatus = next => setScenario(previous => ({ ...previous, state: next }));
  const navigate = page => select({ page, state: 'empty' });
  const Page = { login: LoginPreview, home: HomePreview, chat: ChatPreview, sources: SourcesPreview }[scene.id];
  return <><a href="#preview-content" className="skip-link">跳到场景内容</a><header className="showcase-toolbar"><div className="delivery-label"><Layers size={21} aria-hidden="true" /><strong>UX 组件交付</strong><span>郭昱祺 · 2026.10.24</span></div><div className="toolbar-actions"><StatusBadge tone="caution">模拟数据 · 独立展示入口</StatusBadge><a href="./index.html">现有项目首页<ArrowUpRight size={16} aria-hidden="true" /></a></div></header>
    <div className="review-controls"><div><span className="eyebrow">STATE PREVIEW</span><span>选择展示状态</span></div><div className="state-switch" role="group" aria-label="展示状态">{STATES.map(item => <button key={item.id} aria-pressed={scenario.state === item.id} onClick={() => select({ ...scenario, state: item.id })}>{item.label}</button>)}</div><p>{state.note}</p><Button variant="neutral" onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setShareNotice('场景链接已复制；仅含场景和状态，不含输入。'); } catch { setShareNotice('请从地址栏复制场景链接；仅含场景和状态。'); } }}>复制场景链接</Button></div>
    {shareNotice && <p className="share-notice" role="status">{shareNotice}</p>}
    <AppShell scene={scene.id} scenes={SCENES} onNavigate={navigate}><main id="preview-content"><div className="page-heading"><div><span className="eyebrow">404 NOT FOUND / {scene.label}</span><h1>{scene.title}</h1><p>{scene.description}</p></div><div className="state-id"><strong>{scene.code}-{state.code}</strong><span>{state.label}状态</span></div></div><Page key={`${scene.id}-${revision}`} status={scenario.state} setStatus={setStatus} navigate={navigate} /></main><footer className="preview-footer"><span>组件与交互交付 · 页面装配及真实接口待前端整合</span><span>状态切换会重置本场景示例输入</span></footer></AppShell>
  </>;
}
createRoot(document.getElementById('root')).render(<Showcase />);
