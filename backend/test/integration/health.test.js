import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';

import { createApp } from '../../src/app.js';
import { createTestDatabase } from '../helpers/database.js';

test('health endpoints report process and database readiness without exposing details', async () => {
  const database = await createTestDatabase();
  const server = createApp({ database }).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    const live = await fetch(`http://127.0.0.1:${address.port}/health/live`);
    const ready = await fetch(`http://127.0.0.1:${address.port}/health/ready`);
    assert.equal(live.status, 200);
    assert.deepEqual(await live.json(), { status: 'ok' });
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { status: 'ready' });
    assert.equal(live.headers.get('cache-control'), 'no-store');
    assert.equal(ready.headers.get('cache-control'), 'no-store');
  } finally {
    server.close();
    await once(server, 'close');
    await database.close();
  }
});
