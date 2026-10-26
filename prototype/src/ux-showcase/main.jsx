import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight } from 'lucide-react';
import { AppShell, Button } from './components.jsx';
import { ChatPreview, HomePreview, LoginPreview, SourcesPreview } from './pages.jsx';
import { EmotionPreview, TrainingPreview } from './Day3Previews.jsx';
import { HistoryPreview, RecordDetailPreview, SavePreview, useDay4Workspace } from './Day4Previews.jsx';
import { SCENES, statesForScene } from './data.js';
import '../current-home.css';
import './showcase.css';
import './day4.css';

function readScenario() {
  const params = new URLSearchParams(window.location.search);
  const page = SCENES.some(item => item.id === params.get('page')) ? params.get('page') : 'home';
  return {
    page,
    state: statesForScene(page).some(item => item.id === params.get('state')) ? params.get('state') : 'normal',
  };
}
function Showcase() {
  const [scenario, setScenario] = useState(readScenario);
  const [revision, setRevision] = useState(0);
  const [shareNotice, setShareNotice] = useState('');
  const [carriedDraft, setCarriedDraft] = useState('');
  const workspace = useDay4Workspace();
  const scene = SCENES.find(item => item.id === scenario.page);
  const states = statesForScene(scenario.page);
  const state = states.find(item => item.id === scenario.state);
  useEffect(() => {
    // URL 仅放场景键与状态键，绝不写入输入正文或凭据。
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({ page: scenario.page, state: scenario.state }).toString();
    window.history.replaceState(null, '', url);
    document.title = `${scene.label} · ${scene.code}-${state.code} · UX 组件展示`;
  }, [scenario.page, scenario.state, scene.label, scene.code, state.code]);
  useEffect(() => {
    const restore = () => { setScenario(readScenario()); setRevision(previous => previous + 1); setCarriedDraft(''); workspace.reset(); };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  function select(next) { setScenario(next); setRevision(previous => previous + 1); setShareNotice(''); setCarriedDraft(''); workspace.reset(); }
  const setStatus = next => setScenario(previous => ({ ...previous, state: next }));
  function navigate(page, { draft = '' } = {}) {
    setScenario({ page, state: ['save', 'history', 'record-detail'].includes(page) ? 'normal' : 'empty' });
    setRevision(previous => previous + 1); setShareNotice('');
    setCarriedDraft(draft);
  }
  function changeIdentity(identity) {
    workspace.switchIdentity(identity); setRevision(previous => previous + 1);
    setScenario(previous => ({ ...previous, state: 'normal' })); setCarriedDraft('');
  }
  const day4 = ['save', 'history', 'record-detail'].includes(scene.id);
  const Page = { login: LoginPreview, home: HomePreview, chat: ChatPreview, sources: SourcesPreview, emotion: EmotionPreview, training: TrainingPreview,
    save: SavePreview, history: HistoryPreview, 'record-detail': RecordDetailPreview }[scene.id];
  return <><a href="#preview-content" className="skip-link">跳到场景内容</a>
    <AppShell scene={scene.id} onNavigate={navigate} previewIdentity={day4 ? workspace.identity : undefined}
      onPreviewLogout={() => changeIdentity('guest')}>
      <section className="showcase-review" aria-label="组件展示工具">
        <div className="state-switch preview-state-control">
          <span><span className="switch-icon" aria-hidden="true">◐</span>组件状态预览 · 模拟数据</span>
          <div role="group" aria-label="展示状态">{states.map(item => <button key={item.id} className={scenario.state === item.id ? 'selected' : ''} aria-pressed={scenario.state === item.id} onClick={() => select({ ...scenario, state: item.id })}>{item.label}</button>)}</div>
          <span className="state-id" aria-label={`${scene.code}-${state.code} ${state.label}状态`}>{scene.code}-{state.code}</span>
        </div>
        <div className="preview-navigation"><nav className="preview-scenes" aria-label="展示场景">{SCENES.map(item => <button key={item.id} aria-current={scene.id === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}>{item.label}</button>)}</nav><div className="preview-actions"><a href="./index.html">项目首页<ArrowUpRight size={14} aria-hidden="true" /></a><Button variant="neutral" onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setShareNotice('场景链接已复制；仅含场景和状态，不含输入。'); } catch { setShareNotice('请从地址栏复制场景链接；仅含场景和状态。'); } }}>复制场景链接</Button></div></div>
        <p className="preview-description">{scene.description}<span>{state.note}</span></p>
        {shareNotice && <p className="share-notice" role="status">{shareNotice}</p>}
      </section>
      <section id="preview-content" className={`scene-content scene-${scene.id}`} aria-label={`${scene.label}组件展示`} tabIndex={-1}><Page key={`${scene.id}-${revision}`} status={scenario.state} setStatus={setStatus} navigate={navigate} initialDraft={carriedDraft}
        workspace={workspace} changeIdentity={changeIdentity} /></section>
      <footer className="preview-footer"><span>组件与交互展示 · 真实接口待前端整合</span><span>切换场景或状态会重置示例输入</span></footer>
    </AppShell>
  </>;
}
createRoot(document.getElementById('root')).render(<Showcase />);
