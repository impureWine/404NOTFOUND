import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import { createApp } from '../../src/app.js';
import { MockModelAdapter } from '../../src/ai/mock-model-adapter.js';
import { createSyntheticModelRequest } from '../fixtures/model-requests.js';

async function withServer(modelAdapter, callback) {
  const app = createApp({ database: {}, modelAdapter });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('model endpoint returns a normal unified response without caching', async () => {
  await withServer(new MockModelAdapter(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/internal/v1/model/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createSyntheticModelRequest()),
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).status, 'success');
  });
});

test('model endpoint exposes stable timeout and unavailable prompts', async () => {
  for (const [behavior, httpStatus, code] of [
    ['timeout', 504, 'MODEL_TIMEOUT'],
    ['unavailable', 503, 'MODEL_UNAVAILABLE'],
  ]) {
    await withServer(new MockModelAdapter({ behavior }), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/internal/v1/model/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(createSyntheticModelRequest()),
      });
      const body = await response.json();

      assert.equal(response.status, httpStatus);
      assert.equal(body.error.code, code);
      assert.equal(typeof body.error.user_message, 'string');
      assert.equal('stack' in body.error, false);
    });
  }
});

test('model endpoint hides unexpected adapter errors behind the unavailable prompt', async () => {
  const throwingAdapter = {
    async respond() {
      throw new Error('synthetic provider detail');
    },
  };

  await withServer(throwingAdapter, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/internal/v1/model/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createSyntheticModelRequest()),
    });
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(body.error.code, 'MODEL_UNAVAILABLE');
    assert.equal(JSON.stringify(body).includes('synthetic provider detail'), false);
  });
});
