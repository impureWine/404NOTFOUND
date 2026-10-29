import assert from 'node:assert/strict';
import test from 'node:test';
import { runTask } from '../src/live/business.js';

function fixture(result, search) {
  const calls = [];
  const client = Object.fromEntries(['createConsent', 'createSearchTask', 'getSearchTask', 'cancelSearchTask', 'createAgentTask', 'getAgentTask', 'cancelAgentTask'].map(name => [name, async (...args) => {
    calls.push({ name, args });
    if (name === 'createConsent') return { consentId: 'test-consent' };
    if (name.startsWith('get')) return result;
    return { status: 'pending' };
  }]));
  const execute = () => runTask({ sessionId: 'test-session', activityId: 'test-activity', sessionGeneration: 0, activityGeneration: 0 }, search ? { question: '合成测试问题' } : { selectedText: '合成测试输入' }, { signal: new AbortController().signal, search, client });
  return { execute, calls };
}

for (const code of ['TIMEOUT', 'SERVICE_UNAVAILABLE', 'PROVIDER_UNAVAILABLE', 'SEARCH_NOT_CONFIGURED', 'SEARCH_AUTH_FAILED', 'SEARCH_RATE_LIMITED']) {
  test(`search ${code} reports the search source, never the AI model`, async () => {
    const h = fixture({ status: 'failed', failureReason: code }, true);
    await assert.rejects(h.execute(), error => error.message.includes('Bing') && !error.message.includes('模型'));
    assert.deepEqual(h.calls.map(call => call.name), ['createConsent', 'createSearchTask', 'getSearchTask', 'cancelSearchTask']);
    assert.equal(h.calls[0].args[0].purpose, 'SEARCH_PROCESS');
  });
}

test('model timeout retains its AI message and uses the agent task route', async () => {
  const h = fixture({ status: 'failed', failureReason: 'TIMEOUT' }, false);
  await assert.rejects(h.execute(), /模型响应超时/);
  assert.deepEqual(h.calls.map(call => call.name), ['createConsent', 'createAgentTask', 'getAgentTask', 'cancelAgentTask']);
  assert.equal(h.calls[0].args[0].purpose, 'AI_PROCESS');
});

for (const [status, failureReason, expected] of [['cancelled', undefined, '查询已取消'], ['expired', undefined, '查询已过期'], ['failed', 'UNKNOWN', '查询未完成']]) {
  test(`search ${status} with ${failureReason || 'no code'} keeps a search-specific fallback`, async () => {
    const h = fixture({ status, failureReason }, true);
    await assert.rejects(h.execute(), error => error.message.includes(expected) && !error.message.includes('模型'));
  });
}
