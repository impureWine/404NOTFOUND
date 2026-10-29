import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import { createApp } from '../../src/app.js';

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

test('internal model endpoint is not exposed by the HTTP app', async () => {
  let calls = 0;
  await withServer({ async respond() { calls += 1; } }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/internal/v1/model/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, 'NOT_FOUND');
    assert.equal(calls, 0);
  });
});
