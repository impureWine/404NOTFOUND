import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../../src/app.js';
import { sessionCookie } from '../../src/http/request.js';
import { parseProfileKey } from '../../src/security/crypto.js';
import { RecordRepository } from '../../src/repositories/record-repository.js';
import { AuthService } from '../../src/services/auth-service.js';
import { ConsentService } from '../../src/services/consent-service.js';
import { RecordService } from '../../src/services/record-service.js';
import { createTestDatabase } from '../helpers/database.js';

const ORIGIN = 'http://127.0.0.1:5173';
const KEY = parseProfileKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
const PASSWORD = 'correct-horse-battery';
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
    await callback({ baseUrl: `http://127.0.0.1:${server.address().port}`, database, authService });
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
  assert.equal((await mutate(baseUrl, '/api/auth/register', anonymous, {
    requestId: nextId(), loginName, password: PASSWORD, confirmPassword: PASSWORD,
  })).status, 201);
  const login = await mutate(baseUrl, '/api/auth/login', anonymous, {
    loginName, password: PASSWORD, target: 'PROFILE',
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

test('Day 4 record HTTP flow validates queries, versions, idempotency, revoked sessions and entry scope', async () => {
  await withApi(async ({ baseUrl, database, authService }) => {
    const alice = await registerAndLogin(baseUrl, 'record_day4_alice');
    const bob = await registerAndLogin(baseUrl, 'record_day4_bob');
    const payload = { kind: 'CONVERSATION', content: { title: 'Day4 标题', body: 'Day4 正文' } };
    const consent = await mutate(baseUrl, '/api/consents', alice, {
      requestId: nextId(), purpose: 'SAVE', operation: 'RECORD_CREATE', payload,
    });
    const createBody = {
      requestId: nextId(), consentId: (await consent.json()).data.consentId, ...payload,
    };

    const firstCreate = await mutate(baseUrl, '/api/records', alice, createBody);
    assert.equal(firstCreate.status, 201);
    const created = (await firstCreate.json()).data;
    const replayCreate = await mutate(baseUrl, '/api/records', alice, createBody);
    assert.equal(replayCreate.status, 201);
    const replayed = (await replayCreate.json()).data;
    assert.equal(replayed.id, created.id);
    assert.equal(replayed.idempotent, true);

    const changedPayload = {
      kind: 'CONVERSATION',
      content: { title: '不同标题', body: '不同正文' },
    };
    const changedConsent = await mutate(baseUrl, '/api/consents', alice, {
      requestId: nextId(), purpose: 'SAVE', operation: 'RECORD_CREATE', payload: changedPayload,
    });
    assert.equal((await mutate(baseUrl, '/api/records', alice, {
      ...createBody,
      consentId: (await changedConsent.json()).data.consentId,
      ...changedPayload,
    })).status, 409);

    assert.equal((await (await fetch(`${baseUrl}/api/records`, {
      headers: { Cookie: bob.cookie },
    })).json()).data.items.length, 0);
    assert.equal((await fetch(`${baseUrl}/api/records/${created.id}`, {
      headers: { Cookie: bob.cookie },
    })).status, 404);

    assert.equal((await fetch(`${baseUrl}/api/records?limit=51`, {
      headers: { Cookie: alice.cookie },
    })).status, 400);
    assert.equal((await fetch(`${baseUrl}/api/records?unexpected=true`, {
      headers: { Cookie: alice.cookie },
    })).status, 400);

    const staleConfirmation = await mutate(
      baseUrl,
      `/api/records/${created.id}/clear-confirmations`,
      alice,
      { requestId: nextId(), expectedVersion: created.version + 1 },
    );
    assert.equal(staleConfirmation.status, 409);
    const unknownConfirmationField = await mutate(
      baseUrl,
      `/api/records/${created.id}/clear-confirmations`,
      alice,
      { requestId: nextId(), expectedVersion: created.version, accountId: nextId() },
    );
    assert.equal(unknownConfirmationField.status, 400);

    const accountId = (await database.query(
      'SELECT id FROM user_accounts WHERE login_identifier_normalized = $1',
      ['record_day4_alice'],
    )).rows[0].id;
    const desktopEntry = (await database.query(
      "INSERT INTO entry_points (code) VALUES ('DESKTOP_DAY4') RETURNING id",
    )).rows[0].id;
    const desktopContext = await authService.createContext(accountId, desktopEntry);
    const desktopCookie = sessionCookie(desktopContext.sessionToken).split(';')[0];
    assert.equal((await fetch(`${baseUrl}/api/records/${created.id}`, {
      headers: { Cookie: desktopCookie },
    })).status, 404);

    const confirmation = await mutate(baseUrl, `/api/records/${created.id}/clear-confirmations`, alice, {
      requestId: nextId(), expectedVersion: created.version,
    });
    assert.equal(confirmation.status, 201);
    const clearBody = {
      requestId: nextId(),
      expectedVersion: created.version,
      confirmationId: (await confirmation.json()).data.confirmationId,
    };
    const firstClear = await mutate(baseUrl, `/api/records/${created.id}/clear`, alice, clearBody);
    assert.equal(firstClear.status, 200);
    const replayClear = await mutate(baseUrl, `/api/records/${created.id}/clear`, alice, clearBody);
    assert.equal(replayClear.status, 200);
    assert.equal((await replayClear.json()).data.idempotent, true);

    assert.equal((await fetch(`${baseUrl}/api/records/${created.id}`, {
      headers: { Cookie: alice.cookie },
    })).status, 404);
    assert.equal((await (await fetch(`${baseUrl}/api/records`, {
      headers: { Cookie: alice.cookie },
    })).json()).data.items.length, 0);
    const deletionState = await database.query(
      `
        SELECT
          (SELECT count(*)::int FROM deletion_jobs) AS jobs,
          (SELECT count(*)::int FROM deletion_targets) AS targets,
          (SELECT count(*)::int FROM deletion_outbox) AS outbox
      `,
    );
    assert.deepEqual(deletionState.rows[0], { jobs: 1, targets: 1, outbox: 1 });

    const switchedLogin = await mutate(baseUrl, '/api/auth/login', alice, {
      loginName: 'record_day4_bob', password: PASSWORD, target: 'PROFILE',
    });
    assert.equal(switchedLogin.status, 200);
    const switchedBob = await context(
      baseUrl,
      switchedLogin.headers.get('set-cookie').split(';')[0],
    );
    assert.equal((await fetch(`${baseUrl}/api/records`, {
      headers: { Cookie: alice.cookie },
    })).status, 401);
    assert.equal((await (await fetch(`${baseUrl}/api/records`, {
      headers: { Cookie: switchedBob.cookie },
    })).json()).data.items.length, 0);

    assert.equal((await mutate(baseUrl, '/api/auth/logout', switchedBob, {})).status, 204);
    assert.equal((await fetch(`${baseUrl}/api/records`, {
      headers: { Cookie: switchedBob.cookie },
    })).status, 401);
  });
});
