import { apiClient } from '../api/client.js';
export const id = () => crypto.randomUUID();
export async function saveContent(kind, content, requestId = id()) {
  const payload = { kind, content };
  const consent = await apiClient.createConsent({ requestId: id(), purpose: 'SAVE', operation: 'RECORD_CREATE', payload });
  return apiClient.createRecord({ ...payload, requestId, consentId: consent.consentId });
}
export async function updateContent(record, content, requestId = id()) {
  const payload = { recordId: record.id, expectedVersion: record.version, content };
  const consent = await apiClient.createConsent({ requestId: id(), purpose: 'SAVE', operation: 'RECORD_UPDATE', payload });
  return apiClient.updateRecord(record.id, { requestId, consentId: consent.consentId, expectedVersion: record.version, content });
}
export async function clearOwned(record) {
  if (!window.confirm(`确认清除“${record.title}”？只清除此条记录。`)) return false;
  const confirmation = await apiClient.clearConfirmation(record.id, { requestId: id(), expectedVersion: record.version });
  await apiClient.clearRecord(record.id, { requestId: id(), expectedVersion: record.version, confirmationId: confirmation.confirmationId });
  return true;
}
function delay(signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('已取消', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 600);
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
  });
}
export async function runTask(session, input, { signal, search = false, onAccepted = () => {}, client = apiClient }) {
  const requestId = id();
  const payload = { sessionId: session.sessionId, activityId: session.activityId,
    sessionGeneration: session.sessionGeneration, activityGeneration: session.activityGeneration, ...input };
  const cancel = () => (search ? client.cancelSearchTask : client.cancelAgentTask)(requestId, { requestId: id() }).catch(() => {});
  try {
    const consent = await client.createConsent({ requestId: id(), purpose: search ? 'SEARCH_PROCESS' : 'AI_PROCESS', operation: search ? 'SEARCH_TASK_CREATE' : 'AGENT_TASK_CREATE', payload }, { signal });
    const accepted = await (search ? client.createSearchTask : client.createAgentTask)({ ...payload, requestId, consentId: consent.consentId }, { signal });
    onAccepted(accepted);
    const deadline = Date.now() + 75000;
    while (Date.now() < deadline) {
      if (signal.aborted) throw new DOMException('已取消', 'AbortError');
      const result = await (search ? client.getSearchTask : client.getAgentTask)(requestId, { signal });
      if (result.status === 'completed') return result;
      if (['failed', 'expired', 'cancelled'].includes(result.status)) {
        const failureMessages = search ? {
          SEARCH_NOT_CONFIGURED: 'Bing 搜索尚未配置，请联系服务管理员配置检索密钥。',
          SEARCH_AUTH_FAILED: 'Bing 搜索密钥无效或无权限，请检查 SerpAPI 账户配置。',
          SEARCH_RATE_LIMITED: 'Bing 搜索调用额度不足或请求过于频繁，请检查 SerpAPI 账户后重试。',
          TIMEOUT: 'Bing 搜索超时，请检查网络连接后重试。',
          SERVICE_UNAVAILABLE: 'Bing 搜索服务暂不可用，请检查网络连接或稍后重试。',
          PROVIDER_UNAVAILABLE: 'Bing 搜索服务暂不可用，请检查网络连接或稍后重试。',
        } : {
          TIMEOUT: '模型响应超时，请稍后重试。',
          PROVIDER_UNAVAILABLE: '模型服务暂不可用，请检查服务配置或稍后重试。',
          OUTPUT_INVALID: '模型返回内容无法使用，请重新尝试。',
        };
        const fallback = result.status === 'cancelled'
          ? (search ? '查询已取消。' : '本次任务已取消。')
          : result.status === 'expired'
            ? (search ? '查询已过期，请重新查询。' : '本次任务已过期，请重新尝试。')
            : (search ? '查询未完成，请稍后重试。' : '服务未完成任务，请稍后重试。');
        throw new Error(failureMessages[result.failureReason] || fallback);
      }
      await delay(signal);
    }
    await cancel(); throw new Error('任务等待超时；已请求取消，请稍后重试。');
  } catch (error) { await cancel(); throw error; }
}
export async function endSession(session) {
  if (!session) return;
  return apiClient.actOnSession(session.sessionId, { requestId: id(), action: 'END', expectedSessionGeneration: session.sessionGeneration, expectedActivityGeneration: session.activityGeneration });
}
