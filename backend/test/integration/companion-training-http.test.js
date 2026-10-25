import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import { createApp } from '../../src/app.js';
import { TaskService } from '../../src/services/task-service.js';
import { TrainingService } from '../../src/services/training-service.js';

const ORIGIN = 'http://127.0.0.1:5173';
const context = { sessionId: 'http-context', accountId: null };
const ids = {
  session: '11111111-1111-4111-8111-111111111111',
  agent: '22222222-2222-4222-8222-222222222222',
  consent: '33333333-3333-4333-8333-333333333333',
  training: '44444444-4444-4444-8444-444444444444',
  pause: '55555555-5555-4555-8555-555555555555',
  resume: '66666666-6666-4666-8666-666666666666',
  exit: '77777777-7777-4777-8777-777777777777',
};

async function post(baseUrl, path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      'X-CSRF-Token': 'test-csrf',
    },
    body: JSON.stringify(body),
  });
}

test('HTTP flow routes naming card, completes companion reply, and controls one training', async () => {
  const modelAdapter = {
    async respond() {
      return {
        status: 'success',
        result: {
          content: '听起来你今天承受了不少压力，我们可以先从最急的一件事聊起。',
          suggested_action: 'STAY',
          citations: [],
          uncertainty: null,
        },
      };
    },
  };
  const consentService = { assert() {} };
  const taskService = new TaskService({
    modelAdapter,
    consentService,
    searchProvider: { search: async () => ({ searchState: 'EMPTY', sources: [] }) },
  });
  const app = createApp({
    database: {},
    modelAdapter,
    taskService,
    trainingService: new TrainingService(),
    consentService: null,
    authService: {
      async resolveContext() { return context; },
      verifyCsrf() {},
    },
    appOrigin: ORIGIN,
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const routeResponse = await post(baseUrl, '/api/naming-card/route', {
      emotionWords: ['焦虑', '疲惫'],
      need: 'LISTEN',
    });
    assert.equal(routeResponse.status, 200);
    assert.equal((await routeResponse.json()).data.targetMode, 'COMPANION');

    const sessionResponse = await post(baseUrl, '/api/sessions', {
      requestId: ids.session,
      mode: 'LISTEN',
    });
    const session = (await sessionResponse.json()).data;
    assert.equal(sessionResponse.status, 201);
    assert.equal('ownerKey' in session, false);

    const acceptedResponse = await post(baseUrl, '/api/agent/tasks', {
      requestId: ids.agent,
      sessionId: session.sessionId,
      activityId: session.activityId,
      sessionGeneration: 0,
      activityGeneration: 0,
      mode: 'LISTEN',
      operation: 'REPLY',
      selectedText: '我今天有点撑不住了。',
      selectedContextIds: [],
      consentId: ids.consent,
    });
    assert.equal(acceptedResponse.status, 202);
    await new Promise((resolve) => setImmediate(resolve));
    const agentResponse = await fetch(`${baseUrl}/api/agent/tasks/${ids.agent}`);
    const agentTask = (await agentResponse.json()).data;
    assert.equal(agentTask.status, 'completed');
    assert.match(agentTask.result.text, /压力/);

    const trainingResponse = await post(baseUrl, '/api/trainings', {
      requestId: ids.training,
      definitionId: 'FIVE_SENSES',
    });
    const started = (await trainingResponse.json()).data;
    assert.equal(started.step.stepId, 'SEE');
    const paused = (await (await post(baseUrl, `/api/trainings/${started.trainingSessionId}/actions`, {
      requestId: ids.pause,
      action: 'PAUSE',
      expectedVersion: 0,
    })).json()).data;
    assert.equal(paused.state, 'paused');
    const resumed = (await (await post(baseUrl, `/api/trainings/${started.trainingSessionId}/actions`, {
      requestId: ids.resume,
      action: 'RESUME',
      expectedVersion: paused.version,
    })).json()).data;
    assert.equal(resumed.step.stepId, 'SEE');
    const exited = (await (await post(baseUrl, `/api/trainings/${started.trainingSessionId}/actions`, {
      requestId: ids.exit,
      action: 'EXIT',
      expectedVersion: resumed.version,
    })).json()).data;
    assert.equal(exited.state, 'exited');
    assert.equal(exited.step, null);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
