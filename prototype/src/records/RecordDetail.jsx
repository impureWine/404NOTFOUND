import React from 'react';
import { Button } from '../ui.jsx';
import './record-detail.css';

const names = { CONVERSATION: '会话记录', EMOTION: '情绪记录', WORRY_OBJECT: '物件记录', REHEARSAL_DRAFT: '排练草稿', DEPOSIT: '担忧暂存', QUERY: '查询记录' };
const sourceState = value => ({ VERIFIED: '已核对来源信息', PARTIAL: '尚未完整核验', UNAVAILABLE: '来源暂不可用' }[value] || '未标注');
const claimState = value => ({ SUPPORTED: '有来源支持', CONFLICTED: '来源存在冲突', UNKNOWN: '未经独立核验' }[value] || '未经独立核验');
const readableTime = value => { const date = new Date(value); return value && Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN') : '未标注'; };
const safeLink = value => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
};

function Source({ source = {} }) {
  const href = safeLink(source.url);
  return <div className="record-detail-source">{href ? <a href={href} target="_blank" rel="noreferrer">{source.title || source.url}</a> : <strong>{source.title || '来源链接不可用'}</strong>}
    <p>来源：{source.publisher || '未标注'} · 获取时间：{readableTime(source.retrievedAt)} · {sourceState(source.verificationState)}</p>
  </div>;
}

export function RecordDetail({ record, onClose }) {
  const content = record.content || {};
  const hasContent = record.content && typeof record.content === 'object';
  return <section className="record-detail" role="region" aria-label="记录详情">
    <div className="record-history-heading"><h4>{names[record.kind] || '记录'}详情</h4><Button variant="neutral" onClick={onClose}>关闭详情</Button></div>
    <p>记录版本 v{record.version} · 更新时间：{readableTime(record.updatedAt || record.createdAt)}</p>
    <h3>{record.title || names[record.kind] || '已保存记录'}</h3>
    <div className="record-detail-body">
      {record.kind === 'DEPOSIT' ? <p>寄存正文需在到期后前往<a href="#deposit">烦恼寄存所</a>主动取出；这里不会提前展示正文。</p> : !hasContent ? <p role="alert">这条记录未返回正文，请重新读取；若仍为空，请检查记录服务。</p> : <>
        {record.kind === 'CONVERSATION' && <>{content.messages?.map((message, index) => <div className="record-detail-message" key={index}><strong>{message.role === 'USER' ? '我' : message.role === 'ASSISTANT' ? '助手' : '消息'}</strong><p className="preserve-lines">{message.content}</p></div>)}{!content.messages?.length && <p className="preserve-lines">{content.body || '这条记录没有可显示的对话正文。'}</p>}</>}
        {record.kind === 'EMOTION' && <><dl><dt>记录日期</dt><dd>{content.recordDate || '未标注'}</dd><dt>情绪</dt><dd>{content.emotionCodes?.join('、') || '未填写'}</dd><dt>强度</dt><dd>{content.intensity ?? '已跳过'}</dd><dt>时区</dt><dd>{content.timezoneName || '未标注'}</dd></dl><h4>当天的记录</h4><p className="preserve-lines">{content.note || '未填写文字备注。'}</p></>}
        {record.kind === 'WORRY_OBJECT' && <><p>物件形状：{({ TANGLE: '线团', STONE: '石头', NOTE: '便利贴' })[content.shapeCode] || content.shapeCode || '未标注'}</p><p className="preserve-lines">{content.body || '未填写描述。'}</p></>}
        {record.kind === 'REHEARSAL_DRAFT' && <><h4>排练场景</h4><p className="preserve-lines">{content.scene || '未填写场景。'}</p><h4>我认可的表达</h4><ol>{content.expressions?.map((text, index) => <li className="preserve-lines" key={index}>{text}</li>)}</ol></>}
        {record.kind === 'QUERY' && <><h4>当时查询的问题</h4><p className="preserve-lines">{content.question || '未返回查询文字。'}</p><p>以下为当时主动保存的来源与摘录，不是重新搜索的结果。</p>
          {content.claims?.map((claim, index) => <article className="record-detail-excerpt" key={claim.id || index}><h4>摘录 {index + 1}</h4><p className="preserve-lines">{claim.text}</p><p>{claimState(claim.status)}</p>{claim.evidence?.map((evidence, sourceIndex) => <Source key={evidence.source?.id || sourceIndex} source={evidence.source} />)}</article>)}
          {!content.claims?.length && <p>这条查询没有可显示的已保存摘录。</p>}
        </>}
        {!names[record.kind] && <p>暂不支持展示此类记录，请前往对应业务入口查看。</p>}
      </>}
    </div>
  </section>;
}
