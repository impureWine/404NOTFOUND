import assert from 'node:assert/strict';
import test from 'node:test';

import { TaskService } from '../../src/services/task-service.js';

const context = { sessionId: 'context-a', accountId: null };
const ids = {
  sessionRequest: '11111111-1111-4111-8111-111111111111',
  taskRequest: '22222222-2222-4222-8222-222222222222',
  actionRequest: '33333333-3333-4333-8333-333333333333',
  consent: '44444444-4444-4444-8444-444444444444',
};

function successResponse(content = '我听见你最近承担了很多事情。你想先说说最卡住的部分吗？') {
  return {
    status: 'success',
    result: { content, suggested_action: 'STAY', citations: [], uncertainty: null },
  };
}

function createService(modelAdapter) {
  return new TaskService({
    modelAdapter,
    consentService: { assert() {} },
    searchProvider: { search: async () => ({ searchState: 'EMPTY', sources: [] }) },
  });
}

function taskBody(session) {
  return {
    requestId: ids.taskRequest,
    sessionId: session.sessionId,
    activityId: session.activityId,
    sessionGeneration: 0,
    activityGeneration: 0,
    mode: 'LISTEN',
    operation: 'REPLY',
    selectedText: '我最近任务很多，只想找个人说说。',
    selectedContextIds: [],
    consentId: ids.consent,
  };
}

test('companion task calls the constrained model request and exposes a completed reply', async () => {
  let received;
  const service = createService({
    async respond(input) {
      received = input;
      return successResponse();
    },
  });
  const session = service.createSession(context, { requestId: ids.sessionRequest, mode: 'LISTEN' });
  const accepted = service.createAgentTask(context, taskBody(session));
  assert.equal(accepted.status, 'pending');
  await new Promise((resolve) => setImmediate(resolve));

  const task = service.getAgentTask(context, ids.taskRequest);
  assert.equal(task.status, 'completed');
  assert.match(task.result.text, /承担了很多事情/);
  assert.equal(received.mode, 'COMPANION');
  assert.equal(received.task_type, 'COMPANION_REPLY');
  assert.deepEqual(received.context.recent_messages, [
    { role: 'user', content: '我最近任务很多，只想找个人说说。' },
  ]);
});

test('model timeout becomes a stable task failure reason', async () => {
  const service = createService({
    async respond() {
      return { status: 'error', error: { code: 'MODEL_TIMEOUT' } };
    },
  });
  const session = service.createSession(context, { requestId: ids.sessionRequest, mode: 'LISTEN' });
  service.createAgentTask(context, taskBody(session));
  await new Promise((resolve) => setImmediate(resolve));

  const task = service.getAgentTask(context, ids.taskRequest);
  assert.equal(task.status, 'failed');
  assert.equal(task.failureReason, 'TIMEOUT');
  assert.equal(task.result, undefined);
});

test('pause cancels an in-flight model task and a late reply cannot refill it after resume', async () => {
  let finish;
  let observedSignal;
  const service = createService({
    respond(_input, { signal }) {
      observedSignal = signal;
      return new Promise((resolve) => { finish = resolve; });
    },
  });
  const session = service.createSession(context, { requestId: ids.sessionRequest, mode: 'LISTEN' });
  service.createAgentTask(context, taskBody(session));
  await new Promise((resolve) => setImmediate(resolve));

  service.action(context, session.sessionId, {
    requestId: ids.actionRequest,
    action: 'PAUSE',
    expectedSessionGeneration: 0,
    expectedActivityGeneration: 0,
  });
  assert.equal(observedSignal.aborted, true);
  service.action(context, session.sessionId, {
    requestId: '55555555-5555-4555-8555-555555555555',
    action: 'RESUME',
    expectedSessionGeneration: 0,
    expectedActivityGeneration: 0,
  });

  finish(successResponse('这是一条供应商迟到回复，不应回填。'));
  await new Promise((resolve) => setImmediate(resolve));
  const task = service.getAgentTask(context, ids.taskRequest);
  assert.equal(task.status, 'cancelled');
  assert.equal(task.result, undefined);
});

test('explicit cancellation rejects a late model reply', async () => {
  let finish;
  let observedSignal;
  const service = createService({
    respond(_input, { signal }) {
      observedSignal = signal;
      return new Promise((resolve) => { finish = resolve; });
    },
  });
  const session = service.createSession(context, { requestId: ids.sessionRequest, mode: 'LISTEN' });
  service.createAgentTask(context, taskBody(session));
  await new Promise((resolve) => setImmediate(resolve));

  const cancelled = service.cancelAgentTask(context, ids.taskRequest);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(observedSignal.aborted, true);
  finish(successResponse('取消后的迟到回复'));
  await new Promise((resolve) => setImmediate(resolve));

  const task = service.getAgentTask(context, ids.taskRequest);
  assert.equal(task.status, 'cancelled');
  assert.equal(task.result, undefined);
});

test('restart changes the activity generation and rejects the previous activity reply', async () => {
  let finish;
  const service = createService({
    respond() {
      return new Promise((resolve) => { finish = resolve; });
    },
  });
  const session = service.createSession(context, { requestId: ids.sessionRequest, mode: 'LISTEN' });
  service.createAgentTask(context, taskBody(session));
  await new Promise((resolve) => setImmediate(resolve));

  const restarted = service.action(context, session.sessionId, {
    requestId: ids.actionRequest,
    action: 'RESTART',
    expectedSessionGeneration: 0,
    expectedActivityGeneration: 0,
  });
  assert.equal(restarted.activityGeneration, 1);
  assert.notEqual(restarted.activityId, session.activityId);

  finish(successResponse('上一轮活动的迟到回复'));
  await new Promise((resolve) => setImmediate(resolve));
  const task = service.getAgentTask(context, ids.taskRequest);
  assert.equal(task.status, 'cancelled');
  assert.equal(task.result, undefined);
});

test('account switch invalidates the old login context and its unread late reply', async () => {
  let finish;
  const alice = { sessionId: 'login-session-a', accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
  const bob = { sessionId: 'login-session-b', accountId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
  const service = createService({
    respond() {
      return new Promise((resolve) => { finish = resolve; });
    },
  });
  const session = service.createSession(alice, { requestId: ids.sessionRequest, mode: 'LISTEN' });
  service.createAgentTask(alice, taskBody(session));
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(service.invalidateContext(alice), { sessionsInvalidated: 1 });
  finish(successResponse('换号后的旧账号迟到回复'));
  await new Promise((resolve) => setImmediate(resolve));

  const oldTask = service.getAgentTask(alice, ids.taskRequest);
  assert.equal(oldTask.status, 'cancelled');
  assert.equal(oldTask.result, undefined);
  assert.throws(() => service.getAgentTask(bob, ids.taskRequest), /not found/i);
});

test('account switch also clears a completed reply that was not consumed', async () => {
  const alice = { sessionId: 'login-session-a', accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
  const service = createService({
    async respond() {
      return successResponse('换号前已经完成但尚未读取的回复');
    },
  });
  const session = service.createSession(alice, { requestId: ids.sessionRequest, mode: 'LISTEN' });
  service.createAgentTask(alice, taskBody(session));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(service.getAgentTask(alice, ids.taskRequest).status, 'completed');

  service.invalidateContext(alice);
  const invalidated = service.getAgentTask(alice, ids.taskRequest);
  assert.equal(invalidated.status, 'cancelled');
  assert.equal(invalidated.result, undefined);
});

test('ending a session also rejects an in-flight late model reply', async () => {
  let finish;
  const service = createService({
    respond() {
      return new Promise((resolve) => { finish = resolve; });
    },
  });
  const session = service.createSession(context, { requestId: ids.sessionRequest, mode: 'LISTEN' });
  service.createAgentTask(context, taskBody(session));
  await new Promise((resolve) => setImmediate(resolve));
  service.action(context, session.sessionId, {
    requestId: ids.actionRequest,
    action: 'END',
    expectedSessionGeneration: 0,
    expectedActivityGeneration: 0,
  });
  finish(successResponse('迟到回复'));
  await new Promise((resolve) => setImmediate(resolve));

  const task = service.getAgentTask(context, ids.taskRequest);
  assert.equal(task.status, 'cancelled');
  assert.equal(task.result, undefined);
  assert.throws(() => service.action(context, session.sessionId, {
    requestId: '88888888-8888-4888-8888-888888888888',
    action: 'RESUME',
    expectedSessionGeneration: 0,
    expectedActivityGeneration: 0,
  }), /不能执行 RESUME/);
});
