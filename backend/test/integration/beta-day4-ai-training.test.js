import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { MockModelAdapter } from '../../src/ai/mock-model-adapter.js';
import { NamingCard } from '../../src/ai/naming-card-router.js';
import { TaskService } from '../../src/services/task-service.js';
import { TrainingService } from '../../src/services/training-service.js';

const context = {
  sessionId: 'beta-day4-session',
  accountId: null,
  entryPointId: 'WEB',
};

const consentService = { assert() {} };
const searchProvider = {
  async search() {
    return { searchState: 'EMPTY', sources: [] };
  },
};

function flushTask() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createAgentSession(service) {
  return service.createSession(context, {
    requestId: randomUUID(),
    mode: 'LISTEN',
  });
}

function createAgentTask(service, session, selectedText) {
  const requestId = randomUUID();
  const accepted = service.createAgentTask(context, {
    requestId,
    sessionId: session.sessionId,
    activityId: session.activityId,
    sessionGeneration: session.sessionGeneration,
    activityGeneration: session.activityGeneration,
    mode: 'LISTEN',
    operation: 'REPLY',
    selectedText,
    selectedContextIds: [],
    consentId: randomUUID(),
  });
  return { requestId, accepted };
}

test('B03 naming is deterministic and a companion task exposes waiting before success', async () => {
  assert.equal(NamingCard.select({ emotionWords: ['疲惫'], need: 'LISTEN' }).targetMode, 'COMPANION');
  assert.equal(NamingCard.select({ emotionWords: ['烦躁'], need: 'ORGANIZE' }).targetMode, 'COMPANION');
  assert.deepEqual(NamingCard.select({ emotionWords: ['担心'], need: 'SEARCH' }), {
    targetMode: 'SEARCH',
    emotionWords: ['担心'],
    requiresQuestion: true,
  });
  assert.equal(NamingCard.select({ emotionWords: ['说不清'] }).targetMode, null);

  let finishModel;
  const service = new TaskService({
    consentService,
    searchProvider,
    modelAdapter: {
      respond() {
        return new Promise((resolve) => { finishModel = resolve; });
      },
    },
  });
  const session = createAgentSession(service);
  const { requestId, accepted } = createAgentTask(service, session, 'synthetic: 今天有点累。');

  assert.equal(accepted.status, 'pending');
  await Promise.resolve();
  assert.equal(service.getAgentTask(context, requestId).status, 'running');

  finishModel({
    status: 'success',
    result: { content: 'synthetic: 我在听，可以先说最想处理的一件事。' },
  });
  await flushTask();
  const completed = service.getAgentTask(context, requestId);
  assert.equal(completed.status, 'completed');
  assert.match(completed.result.text, /^synthetic:/);
});

test('B03 empty, timeout and provider failure remain distinct and retry uses a new request', async (t) => {
  const cases = [
    ['empty', 'OUTPUT_INVALID'],
    ['timeout', 'TIMEOUT'],
    ['unavailable', 'PROVIDER_UNAVAILABLE'],
  ];

  for (const [behavior, expectedFailure] of cases) {
    await t.test(behavior, async () => {
      let attempt = 0;
      const service = new TaskService({
        consentService,
        searchProvider,
        modelAdapter: {
          respond(input, options) {
            attempt += 1;
            const adapter = new MockModelAdapter({ behavior: attempt === 1 ? behavior : 'success' });
            return adapter.respond(input, options);
          },
        },
      });
      const session = createAgentSession(service);
      const first = createAgentTask(service, session, `synthetic: ${behavior}`);
      await flushTask();
      const failed = service.getAgentTask(context, first.requestId);
      assert.equal(failed.status, 'failed');
      assert.equal(failed.failureReason, expectedFailure);
      assert.equal('result' in failed, false);

      const retry = createAgentTask(service, session, `synthetic: retry ${behavior}`);
      assert.notEqual(retry.requestId, first.requestId);
      assert.equal(retry.accepted.status, 'pending');
      await flushTask();
      assert.equal(service.getAgentTask(context, retry.requestId).status, 'completed');
      assert.equal(service.getAgentTask(context, first.requestId).status, 'failed');
    });
  }
});

test('B05 all four training definitions support start, pause, resume and exit', () => {
  for (const definitionId of ['BREATHING', 'FIVE_SENSES', 'PAUSE_ORGANIZE', 'TASK_SPLIT']) {
    let clock = 0;
    const service = new TrainingService({ now: () => clock });
    const started = service.start(context, { requestId: randomUUID(), definitionId });
    assert.equal(started.state, 'running', definitionId);

    clock = 1_000;
    const paused = service.action(context, started.trainingSessionId, {
      requestId: randomUUID(),
      action: 'PAUSE',
      expectedVersion: started.version,
    });
    clock = 20_000;
    assert.equal(service.get(context, started.trainingSessionId).elapsedMs, 1_000, definitionId);

    const resumed = service.action(context, started.trainingSessionId, {
      requestId: randomUUID(),
      action: 'RESUME',
      expectedVersion: paused.version,
    });
    assert.equal(resumed.state, 'running', definitionId);

    clock = 21_000;
    const exited = service.action(context, started.trainingSessionId, {
      requestId: randomUUID(),
      action: 'EXIT',
      expectedVersion: resumed.version,
    });
    assert.equal(exited.state, 'exited', definitionId);
    assert.equal(exited.elapsedMs, 2_000, definitionId);
    assert.equal(exited.step, null, definitionId);
  }
});
