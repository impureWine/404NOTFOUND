import assert from 'node:assert/strict';
import test from 'node:test';
import { getApiErrorMessage } from './error-message.js';

test('auth and record screens share public API error feedback', () => {
  const cases = [
    ['API_NOT_CONNECTED', '真实 API 未连接；本次请求没有按成功处理。'],
    ['NETWORK_ERROR', '网络中断；服务器是否已处理本次请求尚未确认。'],
    ['CSRF_CONFIG_MISSING', '会话校验信息缺失或已失效，本次写请求未发送；请重新核验身份。'],
    ['AUTH_REQUIRED', '登录状态已失效；私密内容保持隐藏，请重新登录。'],
    ['CONFLICT', '服务端状态已变化；请刷新后重新确认本次操作。'],
  ];

  for (const [code, expected] of cases) {
    assert.equal(getApiErrorMessage({ code }), expected);
  }
});

test('unknown API errors preserve a safe contract message or use the screen fallback', () => {
  assert.equal(getApiErrorMessage({ code: 'NEW_CONTRACT_ERROR', message: '请求被拒绝。' }), '请求被拒绝。');
  assert.equal(getApiErrorMessage({ code: 'NEW_CONTRACT_ERROR' }, '操作未完成。'), '操作未完成。');
});
