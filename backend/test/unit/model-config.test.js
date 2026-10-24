import assert from 'node:assert/strict';
import test from 'node:test';

import { getModelConfig } from '../../src/ai/model-config.js';

test('uses the approved free model and official API address by default', () => {
  assert.deepEqual(getModelConfig({}), {
    provider: 'zhipu',
    model: 'glm-4.7-flash',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4/',
    timeoutMs: 30_000,
    maxOutputTokens: 256,
    maxRetries: 0,
  });
});

test('blocks any model outside the approved free model', () => {
  assert.throws(
    () => getModelConfig({ ZHIPU_MODEL: 'glm-4.7-flashx' }),
    /模型配置被阻止/,
  );
});

test('blocks any API address outside the approved official endpoint', () => {
  assert.throws(
    () => getModelConfig({ ZHIPU_BASE_URL: 'https://example.com/v1/' }),
    /接口配置被阻止/,
  );
});

test('accepts a bounded model timeout and rejects unsafe values', () => {
  assert.equal(getModelConfig({ ZHIPU_TIMEOUT_MS: '5000' }).timeoutMs, 5000);
  assert.throws(
    () => getModelConfig({ ZHIPU_TIMEOUT_MS: '0' }),
    /模型超时配置无效/,
  );
});
