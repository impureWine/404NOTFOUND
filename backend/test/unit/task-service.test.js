import assert from 'node:assert/strict';
import test from 'node:test';

import { TaskService } from '../../src/services/task-service.js';

const context = { sessionId: 'context-a', accountId: null };
const requestId = '2f74a372-2e54-4fe7-945a-a7992cf4a06b';
const consentId = '734e2dc1-a990-429a-a7ca-561a643263bf';

test('search task returns sources and remains scoped to its owner', async () => {
  const service = new TaskService({
    consentService: { assert() {} },
    searchProvider: {
      search: async () => ({
        searchState: 'SUCCESS',
        partial: false,
        hasConflict: false,
        claims: [],
        sources: [{ id: '1', title: '来源', url: 'https://example.test', retrievedAt: new Date().toISOString() }],
      }),
    },
  });
  const session = service.createSession(context, { requestId, mode: 'SEARCH' });
  const accepted = service.createSearchTask(context, {
    requestId,
    sessionId: session.sessionId,
    activityId: session.activityId,
    sessionGeneration: 0,
    activityGeneration: 0,
    question: '测试查询',
    consentId,
  });
  assert.equal(accepted.status, 'pending');
  await new Promise((resolve) => setImmediate(resolve));
  const completed = service.getSearchTask(context, requestId);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.sources.length, 1);
  assert.throws(() => service.getSearchTask({ sessionId: 'context-b', accountId: null }, requestId), /not found/i);
});

test('ending a session cancels an in-flight search and prevents late refill', async () => {
  let finish;
  const service = new TaskService({
    consentService: { assert() {} },
    searchProvider: { search: () => new Promise((resolve) => { finish = resolve; }) },
  });
  const session = service.createSession(context, { requestId, mode: 'SEARCH' });
  service.createSearchTask(context, {
    requestId,
    sessionId: session.sessionId,
    activityId: session.activityId,
    sessionGeneration: 0,
    activityGeneration: 0,
    question: '测试查询',
    consentId,
  });
  await new Promise((resolve) => setImmediate(resolve));
  service.action(context, session.sessionId, {
    requestId: consentId,
    action: 'END',
    expectedSessionGeneration: 0,
    expectedActivityGeneration: 0,
  });
  finish({ searchState: 'SUCCESS', sources: [{ title: '迟到结果' }] });
  await new Promise((resolve) => setImmediate(resolve));
  const task = service.getSearchTask(context, requestId);
  assert.equal(task.status, 'cancelled');
  assert.equal(task.sources, undefined);
});
