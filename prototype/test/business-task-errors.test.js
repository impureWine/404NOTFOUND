import assert from 'node:assert/strict';
import test from 'node:test';
import { runTask } from '../src/live/business.js';

function fixture(result, search) {
  const calls = [];
  const client = Object.fromEntries(['createConsent', 'createSearchTask', 'getSearchTask', 'cancelSearchTask', 'createAgentTask', 'getAgentTask', 'cancelAgentTask', 'getRecord'].map(name => [name, async (...args) => {
    calls.push({ name, args });
    if (name === 'createConsent') return { consentId: 'test-consent' };
    if (name === 'getRecord') return { id: args[0] };
    if (name.startsWith('get')) return result;
    return { status: 'pending' };
  }]));
  const execute = (input = search ? { question: '合成测试问题' } : { selectedText: '合成测试输入' }) => runTask({ sessionId: 'test-session', activityId: 'test-activity', sessionGeneration: 0, activityGeneration: 0 }, input, { signal: new AbortController().signal, search, client });
  return { execute, calls, client };
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

test('selected history context is verified before creating consent or an AI task', async () => {
  const h = fixture({ status: 'completed', result: { text: '合成回复' } }, false);
  await h.execute({ selectedText: '合成测试输入', selectedContextIds: ['saved-record-1'] });
  assert.deepEqual(h.calls.map(call => call.name), ['getRecord', 'createConsent', 'createAgentTask', 'getAgentTask']);
  assert.equal(h.calls[0].args[0], 'saved-record-1');
  assert.ok(h.calls[0].args[1].signal instanceof AbortSignal);
});

test('cleared selected history is removed and blocks consent and AI task creation', async () => {
  const h = fixture({ status: 'pending' }, false);
  h.client.getRecord = async (...args) => {
    h.calls.push({ name: 'getRecord', args });
    throw Object.assign(new Error('Not found'), { status: 404, code: 'NOT_FOUND' });
  };
  await assert.rejects(h.execute({ selectedText: '合成测试输入', selectedContextIds: ['cleared-record'] }), error => {
    assert.equal(error.code, 'STALE_SELECTED_CONTEXT');
    assert.deepEqual(error.staleContextIds, ['cleared-record']);
    assert.match(error.message, /尚未发送本次输入/);
    return true;
  });
  assert.deepEqual(h.calls.map(call => call.name), ['getRecord']);
});

test('unverified selected history blocks task creation without disguising connection errors', async () => {
  const h = fixture({ status: 'pending' }, false);
  h.client.getRecord = async (...args) => {
    h.calls.push({ name: 'getRecord', args });
    throw Object.assign(new Error('offline'), { code: 'NETWORK_ERROR' });
  };
  await assert.rejects(h.execute({ selectedText: '合成测试输入', selectedContextIds: ['saved-record-1'] }), error => {
    assert.equal(error.code, 'SELECTED_CONTEXT_UNVERIFIED');
    assert.match(error.message, /未提交本次请求/);
    return true;
  });
  assert.deepEqual(h.calls.map(call => call.name), ['getRecord']);
});

for (const [failureReason, expected, retryText] of [
  ['PROVIDER_UNAVAILABLE', '模型服务暂不可用', '重试'],
  ['OUTPUT_INVALID', '模型返回内容无法使用', '重新尝试'],
]) {
  test(`model ${failureReason} keeps an actionable retry message`, async () => {
    const h = fixture({ status: 'failed', failureReason }, false);
    await assert.rejects(h.execute(), error => error.message.includes(expected) && error.message.includes(retryText));
    assert.deepEqual(h.calls.map(call => call.name), ['createConsent', 'createAgentTask', 'getAgentTask', 'cancelAgentTask']);
  });
}

for (const [status, failureReason, expected] of [['cancelled', undefined, '查询已取消'], ['expired', undefined, '查询已过期'], ['failed', 'UNKNOWN', '查询未完成']]) {
  test(`search ${status} with ${failureReason || 'no code'} keeps a search-specific fallback`, async () => {
    const h = fixture({ status, failureReason }, true);
    await assert.rejects(h.execute(), error => error.message.includes(expected) && !error.message.includes('模型'));
  });
}
