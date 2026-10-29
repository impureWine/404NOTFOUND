const API_PREFIX = '/api/';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export class ApiError extends Error {
  constructor(message, { code = 'API_ERROR', status = 0, requestId = null, fields = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.fields = fields;
  }
}

export function createApiClient({
  mode = 'mock',
  csrfHeaderName = '',
  fetchImpl = globalThis.fetch,
} = {}) {
  let csrfToken = null;

  const request = async (method, path, { body, signal } = {}) => {
    const verb = method.toUpperCase();
    if (!path.startsWith(API_PREFIX) || path.startsWith('//')) {
      throw new ApiError('API 路径必须使用同源 /api 路径。', { code: 'INVALID_API_PATH' });
    }
    if (mode !== 'real') {
      throw new ApiError('当前使用模拟适配器，未连接后端 API。', { code: 'API_NOT_CONNECTED' });
    }
    if (typeof fetchImpl !== 'function') {
      throw new ApiError('当前环境没有可用的 fetch。', { code: 'FETCH_UNAVAILABLE' });
    }

    const headers = new Headers({ Accept: 'application/json', 'Cache-Control': 'no-store' });
    if (body !== undefined) headers.set('Content-Type', 'application/json; charset=utf-8');
    if (MUTATING_METHODS.has(verb)) {
      if (!csrfHeaderName || !csrfToken) {
        throw new ApiError('写请求缺少契约配置的 CSRF 头名或当前上下文令牌。', { code: 'CSRF_CONFIG_MISSING' });
      }
      headers.set(csrfHeaderName, csrfToken);
    }

    let response;
    try {
      response = await fetchImpl(path, {
        method: verb,
        headers,
        credentials: 'include',
        cache: 'no-store',
        signal,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new ApiError('网络请求失败；服务端操作状态需要按对应契约核实。', { code: 'NETWORK_ERROR' });
    }

    if (response.status === 204) {
      if (!response.ok) throw new ApiError('API 请求失败。', { status: response.status });
      return null;
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new ApiError('API 响应不是有效 JSON。', { code: 'INVALID_API_RESPONSE', status: response.status });
    }
    if (!response.ok) {
      const error = payload?.error || {};
      throw new ApiError(error.message || 'API 请求失败。', {
        code: error.code || 'API_ERROR',
        status: response.status,
        requestId: payload?.meta?.requestId || null,
        fields: error.fields || null,
      });
    }
    return Object.hasOwn(payload || {}, 'data') ? payload.data : payload;
  };

  const get = (path, options) => request('GET', path, options);
  const post = (path, body, options) => request('POST', path, { ...options, body });

  return Object.freeze({
    mode,
    clearAuthContext() {
      csrfToken = null;
    },
    async getAuthContext(options) {
      const context = await get('/api/auth/context', options);
      csrfToken = context?.csrfToken || null;
      return context;
    },
    register: (payload, options) => post('/api/auth/register', payload, options),
    login: async (payload, options) => {
      try {
        return await post('/api/auth/login', payload, options);
      } finally {
        csrfToken = null;
      }
    },
    logout: async (options) => {
      try {
        return await post('/api/auth/logout', undefined, options);
      } finally {
        csrfToken = null;
      }
    },
    changePassword: async (payload, options) => {
      try {
        return await post('/api/auth/change-password', payload, options);
      } finally {
        csrfToken = null;
      }
    },
    getProfile: options => get('/api/profile', options),
    updateProfile: (payload, options) => request('PATCH', '/api/profile', { ...options, body: payload }),
    createConsent: (payload, options) => post('/api/consents', payload, options),
    getCapabilities: options => get('/api/capabilities', options),
    createSession: (payload, options) => post('/api/sessions', payload, options),
    switchSessionMode: (sessionId, payload, options) => post(`/api/sessions/${encodeURIComponent(sessionId)}/switch`, payload, options),
    actOnSession: (sessionId, payload, options) => post(`/api/sessions/${encodeURIComponent(sessionId)}/actions`, payload, options),
    createAgentTask: (payload, options) => post('/api/agent/tasks', payload, options),
    getAgentTask: (requestId, options) => get(`/api/agent/tasks/${encodeURIComponent(requestId)}`, options),
    cancelAgentTask: (requestId, cancelPayload, options) => post(`/api/agent/tasks/${encodeURIComponent(requestId)}/cancel`, cancelPayload, options),
    createSearchTask: (payload, options) => post('/api/search/tasks', payload, options),
    getSearchTask: (requestId, options) => get(`/api/search/tasks/${encodeURIComponent(requestId)}`, options),
    cancelSearchTask: (requestId, cancelPayload, options) => post(`/api/search/tasks/${encodeURIComponent(requestId)}/cancel`, cancelPayload, options),
    updateRecord: (id, payload, options) => request('PATCH', `/api/records/${encodeURIComponent(id)}`, { ...options, body: payload }),
    createRecord: (payload, options) => post('/api/records', payload, options),
    listRecords(query = {}, options) {
      const search = new URLSearchParams(query);
      return get(`/api/records${search.size ? `?${search}` : ''}`, options);
    },
    getRecord: (recordId, options) => get(`/api/records/${encodeURIComponent(recordId)}`, options),
    createRecordClearConfirmation: (recordId, payload, options) => post(`/api/records/${encodeURIComponent(recordId)}/clear-confirmations`, payload, options),
    clearRecord: (recordId, payload, options) => post(`/api/records/${encodeURIComponent(recordId)}/clear`, payload, options),
  });
}

const buildEnv = import.meta.env || {};
export const apiMode = buildEnv.VITE_API_MODE === 'real' ? 'real' : 'mock';
export const apiClient = createApiClient({
  mode: apiMode,
  csrfHeaderName: buildEnv.VITE_CSRF_HEADER_NAME || '',
});
export const apiStatusLabel = apiMode === 'mock'
  ? 'API 模拟适配层 · 后端未接入'
  : '真实 API 模式 · 尚未联调';
