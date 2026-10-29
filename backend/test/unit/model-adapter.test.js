import assert from 'node:assert/strict';
import test from 'node:test';

import { LangChainModelAdapter } from '../../src/ai/langchain-model-adapter.js';
import { buildModelMessages } from '../../src/ai/model-input.js';
import { MockModelAdapter } from '../../src/ai/mock-model-adapter.js';
import { createSyntheticModelRequest } from '../fixtures/model-requests.js';

const fakeConfigEnv = {
  ZHIPU_MODEL: 'glm-4.7-flash',
  ZHIPU_BASE_URL: 'https://open.bigmodel.cn/api/paas/v4/',
};

test('model input contains only the approved payload fields', () => {
  const request = createSyntheticModelRequest();
  const { messages } = buildModelMessages(request);
  const payload = JSON.parse(messages[1].content);

  assert.equal(payload.mode, 'COMPANION');
  assert.equal(payload.context.recent_messages[0].content, request.context.recent_messages[0].content);
  assert.equal('request_id' in payload, false);
  assert.equal('session_id' in payload, false);
  assert.equal('metadata' in payload, false);
  assert.equal('history_retention' in payload.state, false);
});

test('model input rejects memories without explicit authorization', () => {
  const request = createSyntheticModelRequest({
    context: {
      relevant_memories: [
        {
          memory_id: 'mem-synthetic-001',
          kind: 'REPLY_PREFERENCE',
          content: '用户希望回复简短',
          confirmed_at: '2026-10-23T10:00:00+08:00',
          updated_at: '2026-10-23T10:00:00+08:00',
          expires_at: '2026-11-23T10:00:00+08:00',
          version: 1,
        },
      ],
    },
  });

  assert.throws(() => buildModelMessages(request), /explicit authorization/);
});

test('adapter maps a valid provider response to the unified contract', async () => {
  const chatModel = {
    async invoke() {
      return {
        content: JSON.stringify({
          content: '听起来你今天有些忙。',
          intent: 'COMPANION',
          suggested_action: 'STAY',
          citations: [],
          uncertainty: null,
        }),
        usage_metadata: { input_tokens: 20, output_tokens: 10 },
        response_metadata: { model_name: 'glm-4.7-flash' },
      };
    },
  };
  const adapter = new LangChainModelAdapter({ env: fakeConfigEnv, chatModel });
  const response = await adapter.respond(createSyntheticModelRequest());

  assert.equal(response.status, 'success');
  assert.equal(response.model_info.model, 'glm-4.7-flash');
  assert.equal(response.model_info.mock, false);
  assert.deepEqual(response.usage, { input_tokens: 20, output_tokens: 10 });
});

test('adapter accepts a JSON object wrapped in a Markdown fence', async () => {
  const chatModel = {
    async invoke() {
      return {
        content: `\`\`\`json
{"content":"我在听。","intent":"COMPANION","suggested_action":"STAY","citations":[],"uncertainty":null}
\`\`\``,
      };
    },
  };
  const adapter = new LangChainModelAdapter({ env: fakeConfigEnv, chatModel });
  const response = await adapter.respond(createSyntheticModelRequest());

  assert.equal(response.status, 'success');
  assert.equal(response.result.content, '我在听。');
});

test('adapter rejects an action outside the request allowlist', async () => {
  const chatModel = {
    async invoke() {
      return {
        content: JSON.stringify({
          content: '现在直接开始练习。',
          intent: 'COMPANION',
          suggested_action: 'OFFER_EXERCISE',
          citations: [],
          uncertainty: null,
        }),
      };
    },
  };
  const adapter = new LangChainModelAdapter({ env: fakeConfigEnv, chatModel });
  const response = await adapter.respond(createSyntheticModelRequest());

  assert.equal(response.status, 'error');
  assert.equal(response.error.code, 'INVALID_MODEL_OUTPUT');
});

test('adapter rejects a model intent that tries to leave the active route', async () => {
  const chatModel = {
    async invoke() {
      return {
        content: JSON.stringify({
          content: '我将直接转到查询。',
          intent: 'SEARCH',
          suggested_action: 'STAY',
          citations: [],
          uncertainty: null,
        }),
      };
    },
  };
  const adapter = new LangChainModelAdapter({ env: fakeConfigEnv, chatModel });
  const response = await adapter.respond(createSyntheticModelRequest());

  assert.equal(response.status, 'error');
  assert.equal(response.error.code, 'INVALID_MODEL_OUTPUT');
});

test('adapter rejects explicit treatment guarantees instead of displaying them', async () => {
  const chatModel = {
    async invoke() {
      return {
        content: JSON.stringify({
          content: '这个练习一定会治好你的焦虑。',
          intent: 'COMPANION',
          suggested_action: 'STAY',
          citations: [],
          uncertainty: null,
        }),
      };
    },
  };
  const adapter = new LangChainModelAdapter({ env: fakeConfigEnv, chatModel });
  const response = await adapter.respond(createSyntheticModelRequest());

  assert.equal(response.status, 'error');
  assert.equal(response.error.code, 'CONTENT_REJECTED');
  assert.equal(JSON.stringify(response).includes('一定会治好'), false);
});

test('failure substitute returns stable errors without calling a provider', async () => {
  const request = createSyntheticModelRequest();
  const timeout = await new MockModelAdapter({ behavior: 'timeout' }).respond(request);
  const rateLimited = await new MockModelAdapter({ behavior: 'rateLimited' }).respond(request);

  assert.equal(timeout.error.code, 'MODEL_TIMEOUT');
  assert.equal(rateLimited.error.code, 'MODEL_RATE_LIMITED');
  assert.equal(timeout.model_info.mock, true);
  assert.equal(rateLimited.model_info.mock, true);
});

test('adapter returns an unavailable message when the API key is missing', async () => {
  const adapter = new LangChainModelAdapter({ env: fakeConfigEnv });
  const response = await adapter.respond(createSyntheticModelRequest());

  assert.equal(response.status, 'error');
  assert.equal(response.error.code, 'MODEL_UNAVAILABLE');
  assert.equal(response.error.user_message, '模型服务暂时不可用。');
});

test('adapter enforces its timeout even if the provider does not settle', async () => {
  const chatModel = { invoke: async () => new Promise(() => {}) };
  const adapter = new LangChainModelAdapter({
    env: { ...fakeConfigEnv, ZHIPU_TIMEOUT_MS: '1000' },
    chatModel,
  });
  const response = await adapter.respond(createSyntheticModelRequest());

  assert.equal(response.status, 'error');
  assert.equal(response.error.code, 'MODEL_TIMEOUT');
  assert.equal(response.error.user_message, '暂时没有获得响应，你可以稍后重新尝试。');
});

test('adapter preserves caller cancellation and does not invoke a pre-cancelled request', async () => {
  let calls = 0;
  const chatModel = { invoke: async () => { calls += 1; return {}; } };
  const controller = new AbortController();
  controller.abort();
  const adapter = new LangChainModelAdapter({ env: fakeConfigEnv, chatModel });
  const response = await adapter.respond(createSyntheticModelRequest(), { signal: controller.signal });

  assert.equal(calls, 0);
  assert.equal(response.status, 'error');
  assert.equal(response.error.code, 'MODEL_CANCELLED');
  assert.equal(response.error.retryable, false);
});

test('adapter distinguishes an in-flight caller cancellation from timeout', async () => {
  const controller = new AbortController();
  let started;
  const invoked = new Promise((resolve) => { started = resolve; });
  const chatModel = {
    invoke: async () => {
      started();
      return new Promise(() => {});
    },
  };
  const adapter = new LangChainModelAdapter({
    env: { ...fakeConfigEnv, ZHIPU_TIMEOUT_MS: '1000' },
    chatModel,
  });
  const pending = adapter.respond(createSyntheticModelRequest(), { signal: controller.signal });
  await invoked;
  controller.abort();
  const response = await pending;

  assert.equal(response.status, 'error');
  assert.equal(response.error.code, 'MODEL_CANCELLED');
});
