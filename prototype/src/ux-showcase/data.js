// 固定的课堂展示数据；没有账号、任务 ID 或实时检索结果。
export const SCENES = [
  { id: 'login', code: 'LG', label: '登录', title: '从这里，轻轻开始', description: '登录表单、字段反馈与失败恢复。' },
  { id: 'home', code: 'HP', label: '首页', title: '给自己一点空间', description: '功能入口与最近记录的独立状态。' },
  { id: 'chat', code: 'CH', label: '聊天', title: '有些烦恼，说出来就好', description: '消息、输入与本次发送的恢复路径。' },
  { id: 'sources', code: 'SR', label: '来源展示', title: '把信息的来处看清楚', description: '逐条依据、来源详情与不确定性。' },
  { id: 'emotion', code: 'EC', label: '情绪命名卡', title: '给此刻一个名字', description: '自己选词、补充描述，明确选择带入聊天的内容。' },
  { id: 'training', code: 'TR', label: '训练操作', title: '留一个小小的停顿', description: '开始、暂停、继续、完成与退出的操作反馈。' },
  { id: 'save', code: 'SV', label: '主动保存', title: '留下多少，由你决定', description: '选择片段、核对范围与单次保存确认。' },
  { id: 'history', code: 'HS', label: '本人历史', title: '只看自己留下的内容', description: '历史列表、筛选与身份变化后的反馈。' },
  { id: 'record-detail', code: 'RD', label: '记录详情', title: '主动打开，再看正文', description: '详情读取、不可用、版本变化与清除确认。' },
];
export const TIMEOUT_STATE = { id: 'timeout', code: 'T', label: '超时', note: '结果待确认，不自动重发' };
export const statesForScene = scene => {
  if (scene === 'save') return [...STATES, TIMEOUT_STATE,
    { id: 'success', code: 'S', label: '已保存', note: '固定的成功反馈示例，不创建记录' }, EXPIRED_STATE];
  if (scene === 'history') return [...STATES, EXPIRED_STATE];
  if (scene === 'record-detail') return [...STATES, EXPIRED_STATE,
    { id: 'unavailable', code: 'U', label: '不可用', note: '不推断记录归属或是否存在' },
    { id: 'conflict', code: 'C', label: '状态变化', note: '先重新读取，再次确认清除' }];
  return ['chat', 'sources'].includes(scene) ? [...STATES, TIMEOUT_STATE] : STATES;
};
const EXPIRED_STATE = { id: 'expired', code: 'X', label: '登录失效', note: '隐藏本人内容，重新登录后再读取' };
export const STATES = [
  { id: 'normal', code: 'N', label: '正常', note: '可用内容与主要操作' },
  { id: 'loading', code: 'L', label: '加载', note: '人工保持的等待状态' },
  { id: 'empty', code: 'E', label: '空', note: '空表单／空会话／确认无结果' },
  { id: 'error', code: 'F', label: '失败', note: '保留上下文并提供恢复操作' },
];
export const DEMO_RECORDS = [
  { id: 'demo-record-1', title: '一次小小的心情记录', kind: '心情日历', time: '示例 · 10 月 23 日' },
  { id: 'demo-record-2', title: '给忙碌的一天留个停顿', kind: '倾诉片段', time: '示例 · 10 月 22 日' },
];
export const DEMO_MESSAGES = [
  { id: 'demo-message-1', role: 'user', text: '今天的待办有点多，不知道从哪里开始。' },
  { id: 'demo-message-2', role: 'assistant', text: '可以先停一小会儿。你愿意挑一件现在最想说的事吗？我们可以从它开始。' },
];
export const DEMO_DRAFT = '我想先从最容易的一件事开始。';
export const DEMO_QUESTION = '怎样为学习安排一个短暂的休息？';
// 链接仅作为示例依据入口，不声称本地运行曾请求、抓取或核验这些网站。
export const DEMO_SOURCES = [
  { id: 'demo-source-1', title: 'Every Mind Matters · Mental wellbeing tips', url: 'https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/', publishedAt: null, retrievedAt: null, quality: 'UNKNOWN' },
  { id: 'demo-source-2', title: 'Doing What Matters in Times of Stress', url: 'https://www.who.int/publications/i/item/9789240003927', publishedAt: '2020-04-29', retrievedAt: null, quality: 'STALE' },
];
export const DEMO_CLAIMS = [
  { id: 'demo-claim-1', summary: '先留一点照顾自己的时间，再决定下一步。此句为展示引用关系而写，不是对链接内容的实时摘要。', sourceIds: ['demo-source-1'] },
  { id: 'demo-claim-2', summary: '可以把短暂的停顿作为一个可尝试的起点。资料是否适合当前情境，仍需打开原文核对。', sourceIds: ['demo-source-1', 'demo-source-2'] },
];
export const codePoints = value => Array.from(value).length;
/**
 * 校验展示链接的格式与协议；不请求网络，也不判断页面是否可访问。
 * @param {string} value 原始链接。
 * @returns {URL|null} 可用的 HTTP(S) URL，或 null。
 */
export function safeSourceUrl(value) {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed : null;
  } catch { return null; }
}
