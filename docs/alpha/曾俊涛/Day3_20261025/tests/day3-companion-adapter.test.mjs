/**
 * Day 3 scenario preflight on fixed product code at main@0ee6d.
 * Place this file at docs/alpha/曾俊涛/Day3_20261025/tests in the repository.
 * The chat model is injected and synthetic: no public companion API, browser,
 * external model call, consent flow, or training engine is exercised here.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NamingCard } from '../../../../../backend/src/ai/naming-card-router.js';
import { LangChainModelAdapter } from '../../../../../backend/src/ai/langchain-model-adapter.js';
import { MockModelAdapter } from '../../../../../backend/src/ai/mock-model-adapter.js';
import { createSyntheticModelRequest } from '../../../../../backend/test/fixtures/model-requests.js';

const modelEnv = {
  ZHIPU_MODEL: 'glm-4.7-flash',
  ZHIPU_BASE_URL: 'https://open.bigmodel.cn/api/paas/v4/',
  ZHIPU_TIMEOUT_MS: '1000',
};

function syntheticReply() {
  return {
    content: JSON.stringify({
      content: '我在听。', intent: 'COMPANION',
      suggested_action: 'STAY', citations: [], uncertainty: null,
    }),
  };
}

test('D3-C01 naming choice and synthetic companion response stay in COMPANION mode', async () => {
  const choice = NamingCard.select({ emotionWords: ['紧张'], need: 'LISTEN' });
  assert.equal(choice.targetMode, 'COMPANION');
  assert.equal(choice.requiresQuestion, false);
  let observedMessages;
  const adapter = new LangChainModelAdapter({
    env: modelEnv,
    chatModel: { async invoke(messages) { observedMessages = messages; return syntheticReply(); } },
  });
  const request = createSyntheticModelRequest({
    mode: choice.targetMode,
    context: { recent_messages: [{ role: 'user', content: '合成输入：今天有点紧张。' }] },
  });
  const result = await adapter.respond(request);
  assert.equal(result.status, 'success');
  assert.equal(result.result.intent, 'COMPANION');
  assert.equal(result.result.content, '我在听。');
  const sent = observedMessages.map((message) => message.content).join('\n');
  assert.match(sent, /合成输入：今天有点紧张/);
  assert.equal(sent.includes(request.session_id), false);
  assert.equal(sent.includes(request.request_id), false);
  assert.equal(sent.includes(request.metadata.trace_id), false);
});

test('D3-C02 naming card without a selected need does not pick a companion target', () => {
  const choice = NamingCard.select({ emotionWords: ['紧张'], need: null });
  assert.equal(choice.targetMode, null);
  assert.deepEqual(choice.emotionWords, ['紧张']);
});

test('D3-C03 synthetic model timeout and unavailable states have distinct safe prompts', async () => {
  const request = createSyntheticModelRequest();
  for (const [behavior, code] of [
    ['timeout', 'MODEL_TIMEOUT'],
    ['unavailable', 'MODEL_UNAVAILABLE'],
  ]) {
    const response = await new MockModelAdapter({ behavior }).respond(request);
    assert.equal(response.status, 'error');
    assert.equal(response.error.code, code);
    assert.equal(response.error.retryable, true);
    assert.ok(response.error.user_message.length > 0);
    assert.equal(response.model_info.mock, true);
  }
});

test('D3-C04 aborted synthetic adapter call never surfaces its late reply', async () => {
  const controller = new AbortController();
  let notifyStarted;
  let releaseLate;
  const started = new Promise((resolve) => { notifyStarted = resolve; });
  const chatModel = {
    invoke() {
      notifyStarted();
      return new Promise((resolve) => { releaseLate = () => resolve(syntheticReply()); });
    },
  };
  const adapter = new LangChainModelAdapter({ env: modelEnv, chatModel });
  const pending = adapter.respond(createSyntheticModelRequest(), { signal: controller.signal });
  await started;
  controller.abort();
  const result = await pending;
  releaseLate();
  assert.equal(result.status, 'error');
  assert.equal(result.error.code, 'MODEL_CANCELLED');
  assert.equal(result.error.retryable, false);
  assert.equal(result.result, undefined);
});
