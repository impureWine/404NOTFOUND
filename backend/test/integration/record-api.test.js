import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../../src/app.js';
import { parseProfileKey } from '../../src/security/crypto.js';
import { RecordRepository } from '../../src/repositories/record-repository.js';
import { AuthService } from '../../src/services/auth-service.js';
import { ConsentService } from '../../src/services/consent-service.js';
import { RecordService } from '../../src/services/record-service.js';
import { createTestDatabase } from '../helpers/database.js';

const ORIGIN = 'http://127.0.0.1:5173';
const KEY = parseProfileKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
let sequence = 0;
const nextId = () => `2f74a372-2e54-4fe7-945a-${String(++sequence).padStart(12, '0')}`;

async function withApi(callback) {
  const database = await createTestDatabase();
  const authService = new AuthService(database, { profileKey: KEY });
  const consentService = new ConsentService();
  const recordService = new RecordService(new RecordRepository(database), {
    encryptionKey: KEY,
    consentService,
  });
  const server = createApp({ database, authService, consentService, recordService, appOrigin: ORIGIN })
    .listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await callback({ baseUrl: `http://127.0.0.1:${server.address().port}`, database });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await database.close();
  }
}

async function context(baseUrl, cookie) {
  const response = await fetch(`${baseUrl}/api/auth/context`, { headers: cookie ? { Cookie: cookie } : {} });
  const body = await response.json();
  return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: body.data.csrfToken };
}

async function mutate(baseUrl, path, state, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: state.cookie, Origin: ORIGIN, 'X-CSRF-Token': state.csrf },
    body: JSON.stringify(body),
  });
}

async function registerAndLogin(baseUrl, loginName) {
  const anonymous = await context(baseUrl);
  const password = 'correct-horse-battery';
  assert.equal((await mutate(baseUrl, '/api/auth/register', anonymous, {
    requestId: nextId(), loginName, password, confirmPassword: password,
  })).status, 201);
  const login = await mutate(baseUrl, '/api/auth/login', anonymous, {
    loginName, password, target: 'PROFILE',
  });
  assert.equal(login.status, 200);
  return context(baseUrl, login.headers.get('set-cookie').split(';')[0]);
}

test('record API binds SAVE consent, isolates owners, encrypts content and clears in two steps', async () => {
  await withApi(async ({ baseUrl, database }) => {
    const alice = await registerAndLogin(baseUrl, 'record_alice');
    const bob = await registerAndLogin(baseUrl, 'record_bob');
    const payload = { kind: 'CONVERSATION', content: { title: '私密标题', body: '私密正文' } };

    const wrongConsent = await mutate(baseUrl, '/api/consents', alice, {
      requestId: nextId(), purpose: 'SAVE', operation: 'RECORD_CREATE', payload: { ...payload, kind: 'EMOTION' },
    });
    const wrongConsentId = (await wrongConsent.json()).data.consentId;
    assert.equal((await mutate(baseUrl, '/api/records', alice, {
      requestId: nextId(), consentId: wrongConsentId, ...payload,
    })).status, 403);

    const consent = await mutate(baseUrl, '/api/consents', alice, {
      requestId: nextId(), purpose: 'SAVE', operation: 'RECORD_CREATE', payload,
    });
    const consentId = (await consent.json()).data.consentId;
    const createBody = { requestId: nextId(), consentId, ...payload };
    const createdResponse = await mutate(baseUrl, '/api/records', alice, createBody);
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()).data;

    const stored = await database.query(`
      SELECT r.title_ciphertext, m.content_ciphertext
      FROM saved_records r JOIN saved_messages m ON m.saved_record_id = r.id
      WHERE r.id = $1
    `, [created.id]);
    assert.equal(JSON.stringify(stored.rows).includes('私密标题'), false);
    assert.equal(JSON.stringify(stored.rows).includes('私密正文'), false);

    const aliceList = await fetch(`${baseUrl}/api/records`, { headers: { Cookie: alice.cookie } });
    assert.equal((await aliceList.json()).data.items.length, 1);
    const bobList = await fetch(`${baseUrl}/api/records`, { headers: { Cookie: bob.cookie } });
    assert.equal((await bobList.json()).data.items.length, 0);
    assert.equal((await fetch(`${baseUrl}/api/records/${created.id}`, { headers: { Cookie: bob.cookie } })).status, 404);

    const confirmation = await mutate(baseUrl, `/api/records/${created.id}/clear-confirmations`, alice, {
      requestId: nextId(), expectedVersion: created.version,
    });
    assert.equal(confirmation.status, 201);
    const confirmationId = (await confirmation.json()).data.confirmationId;
    const cleared = await mutate(baseUrl, `/api/records/${created.id}/clear`, alice, {
      requestId: nextId(), expectedVersion: created.version, confirmationId,
    });
    assert.equal(cleared.status, 200);
    assert.equal((await fetch(`${baseUrl}/api/records/${created.id}`, { headers: { Cookie: alice.cookie } })).status, 404);
  });
});
