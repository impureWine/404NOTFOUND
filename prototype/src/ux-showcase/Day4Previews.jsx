import React, { useRef, useState } from 'react';
import { Bookmark, History } from 'lucide-react';
import { AsyncState, Button, InfoNotice, Panel } from './components.jsx';
import { codePoints, DEMO_MESSAGES } from './data.js';
import { ClearRecordConfirmation, GuestSaveGate, RecordDetail, RecordHistoryList, RecordSceneHeader, SaveConfirmation, SaveSelection } from './Day4Components.jsx';

const identityNames = { guest: '游客', 'account-a': '示例账号 A', 'account-b': '示例账号 B' };
const seedRecords = () => ({
  'account-a': [
    { id: 'day4-a-1', title: '给忙碌的一天留一个停顿', kind: 'CONVERSATION', time: '示例 · 2026-10-25 20:10', version: 1,
      items: [{ id: 'day4-a-message', role: 'user', text: '我想先从一件能做的小事开始。' }] },
    { id: 'day4-a-2', title: '此刻的心情', kind: 'EMOTION', time: '示例 · 2026-10-24 18:30', version: 1,
      items: [{ id: 'day4-a-emotion', role: 'user', text: '有点累，也想给自己一点空间。' }] },
  ],
  'account-b': [
    { id: 'day4-b-1', title: '账号 B 的独立示例', kind: 'CONVERSATION', time: '示例 · 2026-10-25 16:00', version: 1,
      items: [{ id: 'day4-b-message', role: 'user', text: '这段合成文字只展示在示例账号 B 下。' }] },
  ],
});

/** In-memory fixtures only. This hook is not an authentication or storage adapter. */
export function useDay4Workspace() {
  const [identity, setIdentity] = useState('account-a');
  const [records, setRecords] = useState(seedRecords);
  const [activeId, setActiveId] = useState('day4-a-1');
  const [notice, setNotice] = useState('');
  const sequence = useRef(0);
  function switchIdentity(next) {
    setIdentity(next);
    setActiveId(null);
    setNotice('模拟身份已切换；原选择、保存确认与详情不继续使用。');
  }
  function save(snapshot) {
    if (identity === 'guest') return null;
    const record = {
      id: `day4-local-${++sequence.current}`, title: snapshot.title, kind: 'CONVERSATION',
      time: '本次页面 · ' + new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
      version: 1, items: snapshot.items.map(item => ({ ...item })),
    };
    setRecords(previous => ({ ...previous, [identity]: [record, ...previous[identity]] }));
    setActiveId(record.id);
    return record;
  }
  function clear(record) {
    const current = records[identity]?.find(item => item.id === record.id);
    if (!current || current.version !== record.version) return false;
    setRecords(previous => ({ ...previous, [identity]: previous[identity].filter(item => item.id !== record.id) }));
    setActiveId(null);
    setNotice('这条示例记录已从本次历史移除；列表与详情不再显示其正文。');
    return true;
  }
  function reset() {
    setRecords(seedRecords()); setIdentity('account-a'); setActiveId('day4-a-1'); setNotice(''); sequence.current = 0;
  }
  return { identity, identityName: identityNames[identity], items: records[identity] || [], activeId,
    setActiveId, notice, setNotice, switchIdentity, save, clear, reset };
}

function SceneHeader({ title, description, workspace, changeIdentity }) {
  return <RecordSceneHeader title={title} description={description} identity={workspace.identity} onIdentity={changeIdentity} />;
}

export function SavePreview({ status, setStatus, navigate, workspace, changeIdentity }) {
  const submittedState = ['loading', 'error', 'timeout'].includes(status);
  const [items, setItems] = useState(status === 'empty' ? [] : DEMO_MESSAGES.map(item => ({ ...item })));
  const [selectedIds, setSelectedIds] = useState(submittedState ? [DEMO_MESSAGES[0].id] : []);
  const [title, setTitle] = useState('给今天留一句话');
  const [snapshot, setSnapshot] = useState(null);
  const [consent, setConsent] = useState(false);
  const [gate, setGate] = useState(false);
  const [keepSelection, setKeepSelection] = useState(false);
  const [saved, setSaved] = useState(null);
  const [notice, setNotice] = useState('');
  const committed = useRef(false);
  const locked = ['loading', 'timeout', 'expired', 'success'].includes(status) || !!saved;
  function preview() {
    const selected = items.filter(item => selectedIds.includes(item.id)).map(item => ({ ...item }));
    const length = selected.reduce((sum, item) => sum + codePoints(item.text), 0);
    if (!selected.length || selected.length > 20 || length > 12000 || !title.trim() || codePoints(title.trim()) > 80 || locked) return;
    setSnapshot({ title: title.trim(), items: selected }); setConsent(false);
    if (workspace.identity === 'guest') { setGate(true); setKeepSelection(false); }
  }
  function confirm() {
    if (!consent || !snapshot || committed.current) return;
    committed.current = true;
    const record = workspace.save(snapshot);
    if (!record) { committed.current = false; setSnapshot(null); return; }
    setSaved(record); setSnapshot(null); setConsent(false); setStatus('success');
  }
  function login() {
    const kept = keepSelection ? snapshot : null;
    workspace.switchIdentity('account-a');
    setGate(false); setSnapshot(null); setConsent(false); setKeepSelection(false);
    setItems(kept?.items || []); setSelectedIds(kept?.items.map(item => item.id) || []);
    setTitle(kept?.title || '给今天留一句话');
    setNotice(kept ? '已在本页保留你明确选择的片段。模拟登录完成，请重新预览并确认保存。' : '模拟登录完成；游客片段没有迁移。可以重新准备内容，再由你选择。');
    setStatus('normal');
  }
  return <>
    <SceneHeader title="主动保存，由你确认" description="先选择，再预览；只有明确确认，才加入本人历史。" workspace={workspace} changeIdentity={changeIdentity} />
    <InfoNotice>当前是页面内存演示，不写入服务器或浏览器存储；保存不等于授权 AI 处理。</InfoNotice>
    <div className="save-history-layout"><Panel className="save-editor-panel">
      {status === 'expired' ? <AsyncState status="error" title="登录已失效，保存未继续" description="当前选择已隐藏。重新登录后重新准备内容和保存许可。"
        onStart={() => { changeIdentity('account-a'); }} startLabel="重新模拟登录" /> : <>
        {!items.length ? <AsyncState status="empty" title="还没有可以保存的片段" description="不会自动收集整段会话。先准备一组虚构内容，再选择要留下的部分。"
          onStart={() => { setItems(DEMO_MESSAGES.map(item => ({ ...item }))); setSelectedIds([]); setStatus('normal'); }} startLabel="载入示例片段" /> :
          <SaveSelection items={items} selectedIds={selectedIds} title={title} locked={locked}
            onTitle={value => { setTitle(value); setConsent(false); setSnapshot(null); }}
            onToggle={id => { setSelectedIds(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]); setConsent(false); setSnapshot(null); }} onPreview={preview} />}
      </>}
    </Panel><Panel className="save-status-panel"><h3>本次保存状态</h3>
      {status === 'loading' ? <AsyncState status="loading" title="正在提交保存" description="这是保持中的等待示例；范围已锁定，不再重复提交。" /> :
        status === 'timeout' ? <div className="record-special-state" role="alert"><h3>保存超时，结果待确认</h3><p>客户端超时不能说明写入失败。保留本次选择，确认结果前不再次保存。</p>
          <Button variant="neutral" onClick={() => navigate('history')}>查看本人历史</Button>
          <Button variant="neutral" onClick={() => { setStatus('error'); setNotice('已切换到明确失败的本地示例；未调用真实核实接口。'); }}>查看明确失败示例</Button></div> :
        status === 'error' ? <div className="record-special-state" role="alert"><h3>本次保存未完成</h3><p>明确失败的示例；已保留选中内容。重试前仍需重新确认保存范围。</p><Button onClick={preview} disabled={!selectedIds.length}>重新预览并确认</Button></div> :
        saved || status === 'success' ? <div className="record-save-success" role="status"><span className="record-success-icon"><Bookmark size={27} aria-hidden="true" /></span><h3>{saved ? '已加入本次示例历史' : '已保存反馈示例'}</h3>
          <p>{saved ? `「${saved.title}」只包含这次确认的 ${saved.items.length} 条片段。` : '这是固定的完成反馈，切换预置状态不会创建新记录。'}</p><p>刷新后会重置；未执行真实持久化。</p>
          <Button icon={History} onClick={() => navigate('history')}>查看本人历史</Button></div> :
        <div className="record-save-explanation"><span className="eyebrow">默认不保存</span><h3>给想留下的内容一个位置</h3><ol><li>勾选片段，填写标题。</li><li>核对完整保存范围。</li><li>确认后，在本人历史查看。</li></ol><p>未勾选的内容不进入历史。更改范围后，需要再次确认。</p></div>}
    </Panel></div>
    {notice && <p className="record-inline-notice" role="status">{notice}</p>}
    {!gate && snapshot && <SaveConfirmation snapshot={snapshot} consent={consent} onConsent={setConsent}
      onCancel={() => { setSnapshot(null); setConsent(false); }} onConfirm={confirm} />}
    {gate && <GuestSaveGate keepSelection={keepSelection} onKeepSelection={setKeepSelection}
      onCancel={() => { setGate(false); setSnapshot(null); setKeepSelection(false); }} onLogin={login} />}
  </>;
}

export function HistoryPreview({ status, setStatus, navigate, workspace, changeIdentity }) {
  const [filter, setFilter] = useState('ALL');
  const effective = workspace.identity === 'guest' ? 'guest' : status;
  return <>
    <SceneHeader title="本人历史" description="只在你主动打开时，查看明确保存的记录。列表仅显示标题和时间。" workspace={workspace} changeIdentity={changeIdentity} />
    <InfoNotice>模拟身份与列表只用于交互展示。正式访问权限由服务端校验账号与入口，不由页面筛选代替。</InfoNotice>
    {workspace.notice && <p className="record-inline-notice" role="status">{workspace.notice}</p>}
    <Panel className="history-list-panel"><RecordHistoryList items={effective === 'empty' ? [] : workspace.items} filter={filter} onFilter={setFilter}
      status={effective} onRetry={() => setStatus('normal')} onStart={() => navigate('save')}
      onLogin={() => changeIdentity('account-a')} onOpen={id => { workspace.setActiveId(id); navigate('record-detail'); }} /></Panel>
    <div className="button-row record-page-actions"><Button icon={Bookmark} onClick={() => navigate('save')}>选择新的保存内容</Button></div>
    <details className="record-destroy-guide"><summary>文字销毁和记录清除有什么区别？</summary>
      <p>文字销毁只清空销毁页中独立输入的临时文字，不会读取或删除这里的历史。输入后主动选择销毁；清空或离开页面也会丢弃该页输入，不会发给 AI。</p>
      <p>已保存的内容需要先打开记录详情，再选择清除并确认范围。这里仅演示从页面内存移除，不表示已清除服务器或备份中的数据。</p>
    </details>
  </>;
}

export function RecordDetailPreview({ status, setStatus, navigate, workspace, changeIdentity }) {
  const [clearing, setClearing] = useState(null);
  const record = workspace.items.find(item => item.id === workspace.activeId);
  const effective = workspace.identity === 'guest' ? 'guest' : status;
  function clear() {
    const accepted = workspace.clear(clearing);
    setClearing(null);
    if (accepted) navigate('history');
    else setStatus('conflict');
  }
  return <>
    <SceneHeader title="记录详情" description="正文只在这条记录被主动打开后展示；查看不会自动分析或用于聊天。" workspace={workspace} changeIdentity={changeIdentity} />
    <Panel className="record-detail-panel"><RecordDetail record={record} status={effective} onBack={() => navigate('history')}
      onRetry={() => setStatus('normal')} onLogin={() => { changeIdentity('account-a'); navigate('history'); }}
      onClear={() => setClearing({ ...record })} /></Panel>
    {clearing && <ClearRecordConfirmation record={clearing} onCancel={() => setClearing(null)} onConfirm={clear} />}
  </>;
}
