import assert from 'node:assert/strict';
import test from 'node:test';
import { createOperationScope } from './operation-scope.js';

test('a newer auth operation aborts and invalidates an older operation', () => {
  const scope = createOperationScope();
  const oldOperation = scope.begin();
  const currentOperation = scope.begin();

  assert.equal(oldOperation.signal.aborted, true);
  assert.equal(oldOperation.isCurrent(), false);
  assert.equal(currentOperation.signal.aborted, false);
  assert.equal(currentOperation.isCurrent(), true);
});

test('identity invalidation aborts pending work and prevents a late result from applying', async () => {
  const scope = createOperationScope();
  const operation = scope.begin();
  let resolveRequest;
  const request = new Promise(resolve => { resolveRequest = resolve; });
  let applied = false;
  const completion = request.then(() => {
    if (operation.isCurrent()) applied = true;
  });

  scope.invalidate();
  resolveRequest();
  await completion;

  assert.equal(operation.signal.aborted, true);
  assert.equal(operation.isCurrent(), false);
  assert.equal(applied, false);
});
