import { ChatOpenAI } from '@langchain/openai';

import { getModelConfig } from './model-config.js';
import { providerOutputSchema } from './model-contracts.js';
import { buildModelMessages } from './model-input.js';

function getRequestId(input) {
  return typeof input?.request_id === 'string' ? input.request_id : 'unknown';
}

function readTextContent(message) {
  if (typeof message?.content === 'string') {
    return message.content.trim();
  }
  if (Array.isArray(message?.content)) {
    return message.content
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('')
      .trim();
  }
  return '';
}

function parseJsonObject(text) {
  const withoutFence = text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  return JSON.parse(withoutFence);
}

function mapUsage(message) {
  const usage = message?.usage_metadata;
  if (!usage) {
    return null;
  }
  return {
    input_tokens: usage.input_tokens ?? null,
    output_tokens: usage.output_tokens ?? null,
  };
}

function mapError(error) {
  if (error?.code === 'INVALID_INPUT') {
    return ['INVALID_REQUEST', false, '请求内容不符合模型调用要求。'];
  }
  if (
    error?.name === 'AbortError'
    || error?.name === 'TimeoutError'
    || error?.code === 'ETIMEDOUT'
    || error?.code === 'ECONNABORTED'
  ) {
    return ['MODEL_TIMEOUT', true, '暂时没有获得响应，你可以稍后重新尝试。'];
  }
  if (error?.status === 429) {
    return ['MODEL_RATE_LIMITED', true, '模型服务当前繁忙，请稍后重试。'];
  }
  if (error?.code === 'EMPTY_MODEL_OUTPUT') {
    return ['EMPTY_MODEL_OUTPUT', true, '模型暂时没有返回可用内容。'];
  }
  if (error instanceof SyntaxError || error?.code === 'INVALID_MODEL_OUTPUT') {
    return ['INVALID_MODEL_OUTPUT', false, '模型返回内容无法安全使用。'];
  }
  return ['MODEL_UNAVAILABLE', true, '模型服务暂时不可用。'];
}

async function invokeWithTimeout(chatModel, messages, timeoutMs, externalSignal) {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, timeoutController.signal])
    : timeoutController.signal;

  try {
    return await Promise.race([
      chatModel.invoke(messages, { signal }),
      new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          const error = new Error(
            externalSignal?.aborted ? 'Model request aborted' : 'Model request timed out',
          );
          error.name = externalSignal?.aborted ? 'AbortError' : 'TimeoutError';
          reject(error);
        }, { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function errorResponse({ input, config, startedAt, now, error }) {
  const [code, retryable, userMessage] = mapError(error);
  return {
    contract_version: '1.1',
    request_id: getRequestId(input),
    status: 'error',
    error: {
      code,
      retryable,
      user_message: userMessage,
      internal_message: code,
    },
    model_info: { provider: config.provider, model: config.model, mock: false },
    timing: { latency_ms: Math.max(0, now() - startedAt), attempts: 1 },
  };
}

/**
 * 创建指向智谱 OpenAI 兼容接口的 LangChain 模型实例。
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env - 环境变量。
 * @param {ReturnType<getModelConfig>} config - 已通过免费模型白名单检查的配置。
 * @returns {ChatOpenAI}
 */
export function createZhipuChatModel(env, config) {
  if (!env.ZHIPU_API_KEY) {
    throw new Error('缺少 ZHIPU_API_KEY，未发起模型调用。');
  }
  return new ChatOpenAI({
    apiKey: env.ZHIPU_API_KEY,
    model: config.model,
    maxTokens: config.maxOutputTokens,
    timeout: config.timeoutMs,
    maxRetries: config.maxRetries,
    modelKwargs: { thinking: { type: 'disabled' } },
    configuration: { baseURL: config.baseUrl },
  });
}

export class LangChainModelAdapter {
  constructor({ env = process.env, chatModel, now = Date.now } = {}) {
    this.config = getModelConfig(env);
    this.chatModel = chatModel ?? null;
    this.initializationError = null;
    if (!this.chatModel) {
      try {
        this.chatModel = createZhipuChatModel(env, this.config);
      } catch (error) {
        this.initializationError = error;
      }
    }
    this.now = now;
  }

  getCapabilities() {
    return Object.freeze({
      provider: this.config.provider,
      model: this.config.model,
      structuredOutput: true,
      streaming: false,
      maxOutputTokens: this.config.maxOutputTokens,
    });
  }

  async respond(input, { signal } = {}) {
    const startedAt = this.now();
    let request;
    try {
      if (this.initializationError) {
        throw this.initializationError;
      }
      const built = buildModelMessages(input);
      request = built.request;
      const message = await invokeWithTimeout(
        this.chatModel,
        built.messages,
        this.config.timeoutMs,
        signal,
      );
      const text = readTextContent(message);
      if (!text) {
        const error = new Error('Empty model output');
        error.code = 'EMPTY_MODEL_OUTPUT';
        throw error;
      }

      const parsedOutput = providerOutputSchema.safeParse(parseJsonObject(text));
      if (!parsedOutput.success) {
        const error = new Error('Invalid model output');
        error.code = 'INVALID_MODEL_OUTPUT';
        throw error;
      }

      const result = parsedOutput.data;
      if (!request.constraints.allowed_actions.includes(result.suggested_action)) {
        const error = new Error('Model returned an action outside the request allowlist');
        error.code = 'INVALID_MODEL_OUTPUT';
        throw error;
      }
      const sourceIds = new Set(request.context.sources.map((source) => source.source_id));
      if (result.citations.some((citation) => !sourceIds.has(citation))) {
        const error = new Error('Model returned an unknown citation');
        error.code = 'INVALID_MODEL_OUTPUT';
        throw error;
      }

      return {
        contract_version: '1.1',
        request_id: request.request_id,
        status: 'success',
        result,
        model_info: {
          provider: this.config.provider,
          model: message?.response_metadata?.model_name
            ?? message?.response_metadata?.model
            ?? this.config.model,
          mock: false,
        },
        usage: mapUsage(message),
        timing: { latency_ms: Math.max(0, this.now() - startedAt), attempts: 1 },
      };
    } catch (error) {
      return errorResponse({ input, config: this.config, startedAt, now: this.now, error });
    }
  }
}
