import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Heart, MessageCircle, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { AuthForm, AsyncState, Button, ClaimItem, ConfirmDialog, FeatureEntryCard, InfoNotice, MessageComposer, MessageList, Panel, PreviewNotice, RecentRecordList, SearchBar, SessionToolbar, SourceList, StatusBadge, UncertaintyNotice } from './components.jsx';
import { codePoints, DEMO_CLAIMS, DEMO_DRAFT, DEMO_MESSAGES, DEMO_QUESTION, DEMO_RECORDS, DEMO_SOURCES } from './data.js';

export function LoginPreview({ status, setStatus, navigate }) {
  const [values, setValues] = useState(status === 'empty' ? { loginName: '', password: '' } : { loginName: 'demo_a', password: 'demo_only_2026' });
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState('');
  function submit(input) {
    const next = {};
    if (!/^[A-Za-z0-9_]{3,64}$/.test(input.loginName.normalize('NFKC'))) next.loginName = '请输入 3～64 位字母、数字或下划线。';
    if (!input.password || codePoints(input.password) > 128) next.password = '请输入非空且不超过 128 码点的密码。';
    setErrors(next);
    if (Object.keys(next).length) return next.loginName ? 'demo-login-name' : 'demo-password';
    setStatus('normal');
    setValues({ loginName: input.loginName.normalize('NFKC'), password: '' });
    setNotice('本地字段校验已通过。未创建真实登录会话；已清空演示密码。');
    return null;
  }
  return <div className="login-layout"><div className="login-story"><span className="eyebrow">WELCOME TO YOUR LITTLE SPACE</span><h2>今天，也值得<br />被温柔接住。</h2><p>说说心事，整理思绪。<br />从你愿意的一小步开始。</p><div className="quiet-art" aria-hidden="true"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><div className="soft-mascot"><span>··</span><i /></div><Sparkles className="art-spark" size={30} /></div><span className="story-note"><Heart size={17} aria-hidden="true" />给每一份情绪，一点空间</span></div>
    <Panel className="login-card"><StatusBadge icon={ShieldCheck}>仅演示输入 · 请勿填写真实密码</StatusBadge><h2>欢迎回来</h2><p className="muted">登录名与昵称分别管理；也可以以访客方式浏览。</p><AuthForm values={values} status={status} fieldErrors={errors} onChange={next => { setValues(next); setErrors({}); }} onSubmit={submit} onGuest={() => navigate('home')} />{notice && <PreviewNotice title={notice} onClose={() => setNotice('')} />}
      <p className="card-footnote">此入口不创建账号、不发送凭据。加载和失败由顶部展示工具选择。</p>
    </Panel></div>;
}
export function HomePreview({ status, setStatus, navigate }) {
  const [record, setRecord] = useState(null);
  return <><div className="home-welcome"><div><StatusBadge icon={Heart}>欢迎来到你的小小空间</StatusBadge><h2>今天，想怎样照顾自己？</h2><p>不急着解决所有事，先找到适合此刻的入口。</p></div><span className="home-flower" aria-hidden="true"><Sparkles size={42} /></span></div>
    <div className="feature-grid"><FeatureEntryCard title="陪我聊聊" description="先被倾听，再慢慢整理思绪。" icon={MessageCircle} actionLabel="打开聊天展示" onActivate={() => navigate('chat')} /><FeatureEntryCard title="找找依据" description="让每一条信息，都能看见来处。" icon={Search} actionLabel="打开来源展示" onActivate={() => navigate('sources')} /><FeatureEntryCard title="心情日历" description="记录日常心情，回看自己的节奏。" icon={BookOpen} actionLabel="查看现有日历原型" onActivate={() => { window.location.href = './calendar.html'; }} /></div>
    <Panel className="recent-panel"><div className="section-heading"><div><span className="eyebrow">YOUR RECENT MOMENTS</span><h2>最近记录</h2></div><StatusBadge>{status === 'normal' ? '固定示例元数据' : '记录分区'}</StatusBadge></div><RecentRecordList items={DEMO_RECORDS} status={status} onRetry={() => setStatus('normal')} onStart={() => navigate('chat')} onOpen={setRecord} />{record && <PreviewNotice title={`已选择示例记录「${record.title}」。本次只交付列表组件，不读取记录正文。`} onClose={() => setRecord(null)} />}</Panel>
    <InfoNotice>只有你主动保存的内容才应进入正式记录列表。这里使用固定示例，未读取账号或历史数据。</InfoNotice>
  </>;
}
export function ChatPreview({ status, setStatus }) {
  const [messages, setMessages] = useState(status === 'empty' ? [] : DEMO_MESSAGES);
  const [draft, setDraft] = useState('');
  const [submitted, setSubmitted] = useState(status === 'error' || status === 'loading' ? DEMO_DRAFT : '');
  const [notice, setNotice] = useState('');
  const [ending, setEnding] = useState(false);
  const input = useRef(null);
  function send(text = draft) {
    if (!text.trim() || codePoints(text) > 4000 || status === 'loading') return;
    setMessages(previous => [...previous, { id: `demo-local-user-${previous.length}`, role: 'user', text }, { id: `demo-local-reply-${previous.length}`, role: 'assistant', text: '这是一条固定演示回复：我们可以从你选择的这一小步开始。' }]);
    setDraft(''); setSubmitted(''); setStatus('normal');
    setNotice('已添加本地示例消息。没有调用模型，也没有自动保存。');
  }
  return <><InfoNotice>当前为本地模拟会话。固定示例回复不代表模型输出；没有外发、保存或后台任务。</InfoNotice><Panel className="chat-panel"><SessionToolbar onEnd={() => setEnding(true)} /><MessageList messages={messages} status={status} submittedDraft={submitted} onStart={() => { setDraft('今天有件事想慢慢说。'); input.current?.focus(); }} onRetry={() => send(submitted)} onRestore={() => { setDraft(submitted); setSubmitted(''); setStatus('normal'); setNotice('已取回本次提交快照，可以编辑后再发送演示。'); input.current?.focus(); }} onCancel={() => { setStatus('normal'); setDraft(submitted); setSubmitted(''); setNotice('已停止本地等待演示，示例提交快照已取回。没有调用服务端取消接口。'); }} /><MessageComposer value={draft} onChange={setDraft} busy={status === 'loading'} onSend={() => send()} onClear={() => setDraft('')} inputRef={input} /></Panel>{notice && <PreviewNotice title={notice} onClose={() => setNotice('')} />}{ending && <ConfirmDialog onCancel={() => setEnding(false)} onConfirm={() => { setEnding(false); setMessages([]); setDraft(''); setSubmitted(''); setStatus('empty'); setNotice('本地演示已结束，当前消息、快照和草稿已清空。'); }} />}</>;
}
export function SourcesPreview({ status, setStatus }) {
  const [question, setQuestion] = useState(DEMO_QUESTION);
  const [searched, setSearched] = useState(true);
  const [expanded, setExpanded] = useState(['demo-source-1']);
  const [active, setActive] = useState(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (active) document.getElementById(`source-${active}`)?.focus();
  }, [active, expanded]);
  function showResult() { setSearched(true); setExpanded(['demo-source-1']); setActive(null); setStatus('normal'); }
  function clear() { setQuestion(''); setSearched(false); setExpanded([]); setActive(null); setStatus('empty'); setNotice('问题与结果已在本地清空。没有服务端查询任务。'); }
  const copy = {
    empty: searched ? ['暂未找到可核查来源', '成功完成但结果为 EMPTY 的模拟；当前问题仍可编辑。没有摘要、引用或可保存结果。'] : ['先写下一个问题', '当前尚未查询。此初始空态不代表服务返回了 EMPTY。'],
    loading: ['正在查找资料', '等待状态演示：不提前填入摘要，也不沿用上一题的来源。'],
    error: ['这次查询未完成', '任务明确失败的模拟，不能判断是否存在资料。问题已保留，可以编辑后手动重试。'],
  }[status] || [];
  return <><Panel className="search-panel"><SearchBar value={question} onChange={setQuestion} busy={status === 'loading'} onSearch={showResult} onClear={clear} onCancel={() => { setStatus('empty'); setSearched(false); setNotice('已停止本地等待演示。没有调用服务端取消接口；问题仍保留。'); }} /></Panel>
    <AsyncState status={status} title={copy[0]} description={copy[1]} onRetry={status === 'error' && question.trim() && codePoints(question) <= 4000 ? showResult : undefined} retryLabel="重试查询示例" onStart={status === 'empty' ? () => { if (!question.trim() || codePoints(question) > 4000) setQuestion(DEMO_QUESTION); showResult(); } : undefined} startLabel={searched ? '查看有来源的示例' : '填入问题并查看示例'}>
      <div className="search-result"><section className="claim-panel"><div className="section-heading"><h2>逐条查看依据</h2><StatusBadge>固定示例 · 非实时检索</StatusBadge></div><UncertaintyNotice>以下摘要和引用关系均为展示数据，尚未实时核对原文。时效标签不代表事实可信度。</UncertaintyNotice>{DEMO_CLAIMS.map(claim => <ClaimItem key={claim.id} claim={claim} sources={DEMO_SOURCES} onLocateSource={id => { setActive(id); setExpanded(previous => previous.includes(id) ? [...previous] : [...previous, id]); }} />)}<p className="save-explanation"><ShieldCheck size={17} aria-hidden="true" />本页不提供保存；正式保存需登录、有效结果和单次 SAVE 许可。</p></section><section className="sources-panel" aria-labelledby="sources-title"><div className="section-heading"><h2 id="sources-title">来源 <span className="count">02</span></h2><span className="muted">可展开核对</span></div><SourceList sources={DEMO_SOURCES} expandedIds={expanded} activeId={active} onToggle={id => setExpanded(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id])} /></section></div>
    </AsyncState>{notice && <PreviewNotice title={notice} onClose={() => setNotice('')} />}
  </>;
}
