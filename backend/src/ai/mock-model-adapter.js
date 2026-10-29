import { modelRequestSchema } from './model-contracts.js';

const FAILURE_MESSAGES = {
  timeout: ['MODEL_TIMEOUT', true, '暂时没有获得响应，你可以稍后重新尝试。'],
  rateLimited: ['MODEL_RATE_LIMITED', true, '模型服务当前繁忙，请稍后重试。'],
  unavailable: ['MODEL_UNAVAILABLE', true, '模型服务暂时不可用。'],
  empty: ['EMPTY_MODEL_OUTPUT', true, '模型暂时没有返回可用内容。'],
  invalidOutput: ['INVALID_MODEL_OUTPUT', false, '模型返回内容无法安全使用。'],
  contentRejected: ['CONTENT_REJECTED', false, '模型返回内容超出了可安全展示的边界。'],
  cancelled: ['MODEL_CANCELLED', false, '请求已取消。'],
};

export class MockModelAdapter {
  constructor({ behavior = 'success' } = {}) {
    this.behavior = behavior;
  }

  async respond(input) {
    const parsed = modelRequestSchema.safeParse(input);
    const requestId = typeof input?.request_id === 'string' ? input.request_id : 'unknown';
    if (!parsed.success) {
      return this.#error(requestId, 'INVALID_REQUEST', false, '请求内容不符合模型调用要求。');
    }

    if (this.behavior !== 'success') {
      const failure = FAILURE_MESSAGES[this.behavior];
      if (!failure) {
        throw new Error(`Unknown mock behavior: ${this.behavior}`);
      }
      return this.#error(requestId, ...failure);
    }

    const request = parsed.data;
    return {
      contract_version: '1.1',
      request_id: request.request_id,
      status: 'success',
      result: {
        content: '这是仅用于离线测试的合成回复。',
        intent: request.mode,
        suggested_action: request.constraints.allowed_actions[0],
        citations: [],
        uncertainty: null,
      },
      model_info: { provider: 'mock', model: 'synthetic-model', mock: true },
      usage: { input_tokens: 0, output_tokens: 0 },
      timing: { latency_ms: 0, attempts: 1 },
    };
  }

  #error(requestId, code, retryable, userMessage) {
    return {
      contract_version: '1.1',
      request_id: requestId,
      status: 'error',
      error: {
        code,
        retryable,
        user_message: userMessage,
        internal_message: `mock:${code}`,
      },
      model_info: { provider: 'mock', model: 'synthetic-model', mock: true },
      timing: { latency_ms: 0, attempts: 1 },
    };
  }
}
