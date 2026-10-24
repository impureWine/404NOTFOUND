import test from 'node:test';
import assert from 'node:assert/strict';
import {
  codePointLength,
  createAgentTaskRequestSchema,
  registerRequestSchema,
} from '@404notfound/contracts';

const id = '2f74a372-2e54-4fe7-945a-a7992cf4a06b';

test('Unicode code point length treats emoji as one code point', () => {
  assert.equal(codePointLength('A😀B'), 3);
});

test('registration accepts 12 and 128 code points and rejects 11 and 129', () => {
  const base = { requestId: id, loginName: 'Team_404' };
  for (const length of [12, 128]) {
    const password = '密'.repeat(length);
    assert.equal(registerRequestSchema.safeParse({ ...base, password, confirmPassword: password }).success, true);
  }
  for (const length of [11, 129]) {
    const password = '密'.repeat(length);
    assert.equal(registerRequestSchema.safeParse({ ...base, password, confirmPassword: password }).success, false);
  }
});

test('strict registration schema rejects client supplied ownerId', () => {
  const password = 'valid-password';
  const result = registerRequestSchema.safeParse({
    requestId: id,
    loginName: 'team_404',
    password,
    confirmPassword: password,
    ownerId: id,
  });
  assert.equal(result.success, false);
});

test('login name is NFKC normalized and indexed in lowercase', () => {
  const password = 'valid-password';
  const result = registerRequestSchema.parse({
    requestId: id,
    loginName: 'Team_404',
    password,
    confirmPassword: password,
  });
  assert.equal(result.loginName, 'team_404');
});

test('rehearsal task requires simulation and dual generations', () => {
  const result = createAgentTaskRequestSchema.safeParse({
    requestId: id,
    sessionId: id,
    activityId: id,
    sessionGeneration: 0,
    activityGeneration: 0,
    mode: 'REHEARSE',
    operation: 'REHEARSAL_REPLY',
    selectedText: '测试',
    selectedContextIds: [],
    consentId: id,
  });
  assert.equal(result.success, false);
  assert.ok(result.error.issues.some((issue) => issue.path[0] === 'simulation'));
});
