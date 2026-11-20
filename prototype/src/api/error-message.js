const API_ERROR_MESSAGES = Object.freeze({
  API_NOT_CONNECTED: '真实 API 未连接；本次请求没有按成功处理。',
  NETWORK_ERROR: '网络中断；服务器是否已处理本次请求尚未确认。',
  CSRF_CONFIG_MISSING: '会话校验信息缺失或已失效，本次写请求未发送；请重新核验身份。',
  AUTH_REQUIRED: '登录状态已失效；私密内容保持隐藏，请重新登录。',
  CONFLICT: '服务端状态已变化；请刷新后重新确认本次操作。',
  SESSION_STALE: '会话状态已变化；旧任务已在本地停止，请重新开始。',
});

export function getApiErrorMessage(error, fallback = '请求未完成，请检查服务状态后重试。') {
  return API_ERROR_MESSAGES[error?.code] || error?.message || fallback;
}
