import React, { useState } from 'react';
import { FileClock, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { apiMode } from '../api/client.js';
import { Button, DemoNote, EmptyState, Panel, Tag } from '../ui.jsx';
import { useRecordVault } from './useRecordVault.js';

const kindLabel = kind => ({ CONVERSATION: '会话记录', EMOTION: '情绪记录', WORRY_OBJECT: '物件记录', REHEARSAL_DRAFT: '排练草稿', DEPOSIT: '担忧暂存', QUERY: '查询记录' }[kind] || '记录');
const codePoints = value => Array.from(value).length;

export function RecordVault({ authenticated, accountKey }) {
  const vault = useRecordVault({ authenticated, accountKey });
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [review, setReview] = useState(null);
  const [saveConsent, setSaveConsent] = useState(false);
  const [formError, setFormError] = useState('');

  const beginSave = event => {
    event.preventDefault();
    const normalizedTitle = title.trim() || '主动保存的记录';
    if (!body.trim()) {
      setFormError('请填写要主动保存的正文。');
      return;
    }
    setFormError('');
    setReview({ title: normalizedTitle, body });
    setSaveConsent(false);
  };

  const confirmSave = async () => {
    if (!review || !saveConsent) return;
    const saved = await vault.save(review);
    if (saved) {
      setTitle('');
      setBody('');
      setReview(null);
      setSaveConsent(false);
    }
  };

  return <section className="record-vault" aria-labelledby="record-vault-title">
    <div className="record-vault-heading"><div><span className="eyebrow">本人 · 当前入口</span><h2 id="record-vault-title">主动保存与历史</h2><p>内容默认不保存；此处只发送你明确选择保存的文字。</p></div><Button variant="neutral" icon={RefreshCw} disabled={vault.busy || !authenticated || apiMode !== 'real'} onClick={() => vault.refresh()}>刷新列表</Button></div>
    <div className="record-vault-grid">
      <Panel className="record-save-panel">
        <h3>主动保存一则文字记录</h3>
        <p>这里可以单独保存一则文字备忘；陪伴、日历、物件、排练和寄存也分别提供主动保存入口。不会自动抓取其他页面内容。</p>
        <form className="record-save-form" onSubmit={beginSave}>
          <label>标题（可选）<input value={title} maxLength={160} onChange={event => setTitle(Array.from(event.target.value).slice(0, 80).join(''))} placeholder="留空时使用“主动保存的记录”" disabled={Boolean(review) || vault.busy} /></label>
          <label>正文<textarea value={body} maxLength={8000} onChange={event => setBody(Array.from(event.target.value).slice(0, 4000).join(''))} placeholder="只写你决定保存的内容" disabled={Boolean(review) || vault.busy} /></label>
          <div className="record-field-count">{codePoints(title)} / 80 · {codePoints(body)} / 4000 Unicode 码点</div>
          {formError && <p className="record-error" role="alert">{formError}</p>}
          <Button type="submit" disabled={!authenticated || apiMode !== 'real' || Boolean(review) || vault.busy}>检查并选择保存</Button>
        </form>
        {!authenticated && <p className="record-gate" role="status">登录后才能查看或保存私密记录；访客不会请求记录列表。</p>}
        {apiMode !== 'real' && authenticated && <p className="record-gate" role="status">当前是 API 模拟模式；不会模拟保存成功或展示虚构账户历史。</p>}
        {review && <div className="record-consent" role="group" aria-label="保存前确认">
          <h4>保存前确认</h4><strong>{review.title}</strong><p className="preserve-lines">{review.body}</p>
          <label className="record-consent-choice"><input type="checkbox" checked={saveConsent} onChange={event => setSaveConsent(event.target.checked)} disabled={vault.busy} /><span>我明确选择将以上内容保存为本人当前入口的记录。此许可仅用于 SAVE，不代表允许 AI 处理。</span></label>
          {vault.saveResultUnknown && <p className="record-gate" role="status">服务端保存结果未知。请保持这个快照并用同一请求重试核实；不能取消后改成新内容。</p>}
          <div className="button-row"><Button disabled={!saveConsent || vault.busy} onClick={confirmSave}>{vault.busy ? '正在保存…' : vault.saveResultUnknown ? '用同一请求重试核实' : vault.hasPendingSave ? '用同一请求重试保存' : '确认保存'}</Button><Button variant="neutral" disabled={vault.busy || vault.saveResultUnknown} onClick={() => { if (vault.cancelSave()) { setReview(null); setSaveConsent(false); setFormError(''); } }}>取消</Button></div>
        </div>}
      </Panel>

      <Panel className="record-history-panel">
        <div className="record-history-heading"><div><h3>我的记录</h3><span>当前入口 · 最多显示 20 条元数据</span></div><Tag>{vault.loadState === 'loading' ? '读取中' : vault.loadState === 'ready' ? `${vault.items.length} 条` : '未确认'}</Tag></div>
        {vault.loadState === 'loading' && <p role="status">正在从记录服务读取本人当前入口的列表…</p>}
        {vault.loadState === 'error' && <div className="record-error" role="alert">{vault.loadError}<Button variant="neutral" disabled={vault.busy} onClick={() => vault.refresh()}>重新读取</Button></div>}
        {vault.loadState === 'unavailable' && <p className="record-gate" role="status">{vault.loadError}</p>}
        {vault.loadState === 'ready' && vault.items.length === 0 && <EmptyState title="当前入口没有已保存记录" desc="空状态只在列表读取成功后显示，不代表其他入口或其他账号没有记录。" />}
        {vault.loadState === 'ready' && vault.items.length > 0 && <div className="record-history-list">{vault.items.map(record => <article className="record-history-item" key={record.id}>
          <span className="record-history-icon"><FileClock size={17} /></span>
          <div className="record-history-meta"><strong>{kindLabel(record.kind)}</strong><span>{new Date(record.updatedAt || record.createdAt).toLocaleString('zh-CN')} · v{record.version}</span><small>列表只显示类型与时间；详情由服务端核验归属后解密。</small></div>
          <Button variant="neutral" disabled={vault.busy} onClick={() => vault.openDetail(record.id)}>详情</Button>
          {vault.pendingClearId === record.id
            ? <div className="record-clear-confirm"><p role="status">{vault.clearResultUnknown ? '上次清除请求结果未知；请用同一请求标识重试核实。' : vault.clearConfirmationReady ? `一次性确认约于 ${new Date(vault.clearExpiresAt).toLocaleTimeString('zh-CN')} 过期。确认前可取消。` : vault.clearConfirmationResultUnknown ? '清除确认结果待核实；重试会沿用同一请求标识，尚未提交清除请求。' : '尚未收到服务端确认凭证；可重试申请，当前没有提交清除请求。'}</p><div className="button-row"><Button variant="danger" icon={Trash2} disabled={vault.busy} onClick={() => vault.clearResultUnknown || vault.clearConfirmationReady ? vault.confirmClear(record) : vault.requestClear(record)}>{vault.busy ? '处理中…' : vault.clearResultUnknown ? '用同一请求重试核实' : vault.clearConfirmationReady ? '确认清除' : '重试申请确认'}</Button><Button variant="neutral" disabled={vault.busy || vault.clearResultUnknown} onClick={vault.cancelClear}>取消确认</Button></div></div>
            : <Button variant="neutral" disabled={vault.busy} onClick={() => vault.requestClear(record)}>清除</Button>}
        </article>)}</div>}
        {vault.detail && <div className="record-detail" role="region" aria-label="记录详情"><div className="record-history-heading"><h4>{kindLabel(vault.detail.kind)}详情</h4><Button variant="neutral" onClick={vault.closeDetail}>关闭详情</Button></div><p>已按服务端身份读取记录版本 v{vault.detail.version}。</p><h4>{vault.detail.title}</h4>{vault.detail.content?.messages?.map((message,index) => <p className="preserve-lines" key={index}><strong>{message.role === 'USER' ? '用户' : '助手'}：</strong>{message.content}</p>)}<p className="preserve-lines">{vault.detail.content?.body || vault.detail.content?.note || vault.detail.content?.scene || vault.detail.content?.question}</p>{vault.detail.content?.expressions?.map((text,index)=><p className="preserve-lines" key={index}>{text}</p>)}{vault.detail.kind === 'DEPOSIT' && <p>寄存正文需在到期后前往<a href="#deposit">寄存所</a>主动取出。</p>}</div>}
      </Panel>
    </div>
    {vault.notice && <div className="record-notice" role="status">{vault.notice}</div>}
    <DemoNote><ShieldCheck size={16} />保存许可与 AI/检索许可相互独立；清除按“签发一次性确认 → 用户再次确认提交”两步执行。列表和详情错误不会显示为空历史。清除结果未知时保留相同请求标识以便幂等核实。</DemoNote>
  </section>;
}
