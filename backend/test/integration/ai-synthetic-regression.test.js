import assert from 'node:assert/strict';
import test from 'node:test';

import { MockModelAdapter } from '../../src/ai/mock-model-adapter.js';
import { TaskService } from '../../src/services/task-service.js';
import { AI_REGRESSION_CASES } from '../fixtures/ai-regression-cases.js';
import { createSyntheticModelRequest } from '../fixtures/model-requests.js';

const context = { sessionId: 'synthetic-regression-session', accountId: null };
const consentService = { assert() {} };
let idSequence = 0;

function nextId() {
  idSequence += 1;
  return `77777777-7777-4777-8777-${String(idSequence).padStart(12, '0')}`;
}

function createService(modelAdapter) {
  return new TaskService({
    modelAdapter,
    consentService,
    searchProvider: { search: async () => ({ searchState: 'EMPTY', sources: [] }) },
  });
}

function createTask(service, text) {
  const session = service.createSession(context, { requestId: nextId(), mode: 'LISTEN' });
  const requestId = nextId();
  service.createAgentTask(context, {
    requestId,
    sessionId: session.sessionId,
    activityId: session.activityId,
    sessionGeneration: session.sessionGeneration,
    activityGeneration: session.activityGeneration,
    mode: 'LISTEN',
    operation: 'REPLY',
    selectedText: text,
    selectedContextIds: [],
    consentId: nextId(),
  });
  return requestId;
}

test('synthetic normal set completes through the companion model route', async () => {
  for (const scenario of AI_REGRESSION_CASES.normal) {
    let calls = 0;
    const service = createService({
      async respond(input) {
        calls += 1;
        assert.equal(input.mode, scenario.expectedRoute);
        return {
          status: 'success',
          result: { content: '这是与当前输入关联的合成陪伴回复。' },
        };
      },
    });
    const requestId = createTask(service, scenario.text);
    await new Promise((resolve) => setImmediate(resolve));
    const task = service.getAgentTask(context, requestId);

    assert.equal(task.status, 'completed', scenario.id);
    assert.equal(task.route, undefined, scenario.id);
    assert.equal(calls, 1, scenario.id);
  }
});

test('synthetic failure set keeps stable non-sensitive error contracts', async () => {
  const request = createSyntheticModelRequest();
  for (const scenario of AI_REGRESSION_CASES.failures) {
    const response = await new MockModelAdapter({ behavior: scenario.behavior }).respond(request);
    assert.equal(response.status, 'error', scenario.id);
    assert.equal(response.error.code, scenario.expectedCode, scenario.id);
    assert.equal(typeof response.error.user_message, 'string', scenario.id);
    assert.equal('stack' in response.error, false, scenario.id);
  }
});

test('synthetic explicit-harm set uses a fixed safety route without model dispatch', async () => {
  for (const scenario of AI_REGRESSION_CASES.sensitive) {
    const service = createService(null);
    const requestId = createTask(service, scenario.text);
    await new Promise((resolve) => setImmediate(resolve));
    const task = service.getAgentTask(context, requestId);

    assert.equal(task.status, 'completed', scenario.id);
    assert.equal(task.route, 'SAFETY', scenario.id);
    assert.equal(task.safetyReason, undefined, scenario.id);
    assert.equal(service.agentTasks.get(requestId).safetyReason, scenario.expectedReason, scenario.id);
    assert.match(task.result.text, /紧急服务/);
    assert.match(task.result.text, /无法代你报警/);
    assert.doesNotMatch(task.result.text, /风险分数|风险等级/);
  }
});
