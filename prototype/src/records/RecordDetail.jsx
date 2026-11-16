import React from 'react';
import { Button } from '../ui.jsx';
import './record-detail.css';

const names = { CONVERSATION: '会话记录', EMOTION: '情绪记录', WORRY_OBJECT: '物件记录', REHEARSAL_DRAFT: '排练草稿', DEPOSIT: '担忧暂存', QUERY: '查询记录' };
const sourceState = value => ({ VERIFIED: '已核对来源信息', PARTIAL: '尚未完整核验', UNAVAILABLE: '来源暂不可用' }[value] || '未标注');
const claimState = value => ({ SUPPORTED: '有来源支持', CONFLICTED: '来源存在冲突', UNKNOWN: '未经独立核验' }[value] || '未经独立核验');
const queryState = value => ({ SUCCESS: '来源已保存', PARTIAL_SUCCESS: '部分来源可用', STALE_SOURCE: '来源可能已过时', CONFLICTED: '来源存在冲突', EMPTY: '当时没有结果' }[value] || '状态未标注');
const sourceQuality = value => ({ CURRENT: '当前可用', STALE: '可能已过时', UNKNOWN: '时效未知' }[value] || '时效未标注');
const sourceTier = value => ({ S1: '一级来源', S2: '二级来源', S3: '三级来源', S4: '四级来源', SX: '来源级别未核定' }[value] || '来源级别未标注');
const readableTime = value => { const date = new Date(value); return value && Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN') : '未标注'; };
const safeLink = value => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
};

function Source({ source = {}, id }) {
  const href = safeLink(source.url);
  return <div className="record-detail-source" id={id}>{href ? <a href={href} target="_blank" rel="noreferrer">{source.title || source.url}</a> : <strong>{source.title || '来源链接不可用'}</strong>}
    <p>来源：{source.publisher || '未标注'} · 来源级别：{sourceTier(source.sourceTier)} · 发布时间：{readableTime(source.publishedAt)} · 获取时间：{readableTime(source.retrievedAt)} · {sourceState(source.verificationState)} · {sourceQuality(source.quality)}</p>
  </div>;
}

export function RecordDetail({ record, onClose }) {
  const content = record.content || {};
  const hasContent = record.content && typeof record.content === 'object';
  const savedSources = Array.isArray(content.sources) ? content.sources : [];
  const querySources = savedSources.length
    ? savedSources
    : (content.claims || []).flatMap(claim => (claim.evidence || []).map(evidence => evidence.source).filter(Boolean))
      .filter((source, index, all) => all.findIndex(item => (item.id && item.id === source.id) || (item.url && item.url === source.url)) === index);
  const sourceId = (source, index) => `record-query-source-${source.id || index}`;
  const matchingSource = source => querySources.findIndex(item => (source?.id && item.id === source.id) || (source?.url && item.url === source.url));
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
        {record.kind === 'QUERY' && <><h4>当时查询的问题</h4><p className="preserve-lines">{content.question || '未返回查询文字。'}</p><p>以下为当时主动保存的结果快照，不是重新搜索的结果。</p>
          <p>查询状态：{queryState(content.status)}</p>
          {content.uncertaintyNote && <p role="note">不确定性：{content.uncertaintyNote}</p>}
          {content.snapshotOrigin === 'LEGACY_BACKFILL' && <p role="note">历史补录：此来源由后续数据补入，不代表原始查询保存时的快照。</p>}
          {content.snapshotOrigin === 'SAVED' && <p>来源快照：查询保存时记录。</p>}
          {content.claims?.map((claim, index) => <article className="record-detail-excerpt" key={claim.id || index}><h4>摘录 {index + 1}</h4><p className="preserve-lines">{claim.text}</p><p>{claimState(claim.status)}</p>{claim.evidence?.map((evidence, sourceIndex) => {
            const source = evidence.source || {};
            const matchedIndex = matchingSource(source);
            const href = matchedIndex >= 0 ? `#${sourceId(querySources[matchedIndex], matchedIndex)}` : safeLink(source.url);
            const sourceName = source.title || '关联来源';
            return <p key={source.id || sourceIndex}>证据来源：{href ? <a href={href} {...(href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}>{sourceName}</a> : sourceName} · {evidence.relation || '关系未标注'}</p>;
          })}</article>)}
          <h4>本次保存的全部来源（{querySources.length}）</h4>
          {querySources.length ? querySources.map((source, index) => <Source key={source.id || source.url || index} id={sourceId(source, index)} source={source} />) : <p>这条查询没有保存可显示的来源。</p>}
        </>}
        {!names[record.kind] && <p>暂不支持展示此类记录，请前往对应业务入口查看。</p>}
      </>}
    </div>
  </section>;
}
