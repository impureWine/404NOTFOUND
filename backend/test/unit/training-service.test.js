import assert from 'node:assert/strict';
import test from 'node:test';

import { TrainingService } from '../../src/services/training-service.js';

const context = { sessionId: 'anonymous-a', accountId: null };
const requestIds = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
];

test('five-senses training pauses without advancing and resumes at the same step', () => {
  let clock = 0;
  const service = new TrainingService({ now: () => clock });
  const started = service.start(context, {
    requestId: requestIds[0],
    definitionId: 'FIVE_SENSES',
  });
  assert.equal(started.state, 'running');
  assert.equal(started.step.stepId, 'SEE');

  clock = 1_250;
  const paused = service.action(context, started.trainingSessionId, {
    requestId: requestIds[1],
    action: 'PAUSE',
    expectedVersion: 0,
  });
  clock = 20_000;
  const stillPaused = service.get(context, started.trainingSessionId);
  assert.equal(stillPaused.elapsedMs, 1_250);
  assert.equal(stillPaused.stepIndex, 0);
  assert.equal(stillPaused.step.stepId, 'SEE');

  const resumed = service.action(context, started.trainingSessionId, {
    requestId: requestIds[2],
    action: 'RESUME',
    expectedVersion: paused.version,
  });
  assert.equal(resumed.state, 'running');
  assert.equal(resumed.step.stepId, 'SEE');
});

test('five-senses training advances deterministically and exits in one action', () => {
  const service = new TrainingService({ now: () => 100 });
  const started = service.start(context, {
    requestId: requestIds[0],
    definitionId: 'FIVE_SENSES',
  });
  const advanced = service.action(context, started.trainingSessionId, {
    requestId: requestIds[1],
    action: 'NEXT',
    expectedVersion: 0,
  });
  assert.equal(advanced.step.stepId, 'TOUCH');

  const exited = service.action(context, started.trainingSessionId, {
    requestId: requestIds[2],
    action: 'EXIT',
    expectedVersion: advanced.version,
  });
  assert.equal(exited.state, 'exited');
  assert.equal(exited.step, null);
  assert.throws(
    () => service.action(context, started.trainingSessionId, {
      requestId: requestIds[3],
      action: 'RESUME',
      expectedVersion: exited.version,
    }),
    /不能执行 RESUME/,
  );
});

test('training sessions are isolated by owner and reject stale actions', () => {
  const service = new TrainingService();
  const started = service.start(context, {
    requestId: requestIds[0],
    definitionId: 'FIVE_SENSES',
  });
  assert.throws(
    () => service.get({ sessionId: 'anonymous-b', accountId: null }, started.trainingSessionId),
    /不存在/,
  );
  assert.throws(
    () => service.action(context, started.trainingSessionId, {
      requestId: requestIds[1],
      action: 'PAUSE',
      expectedVersion: 9,
    }),
    /已变化/,
  );
});
