/** Day 4 independent integration: real HTTP/AuthService/RecordService/PGlite, synthetic data only. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// In docs/alpha/曾俊涛/Day4_20261026/tests, five parents reach the repository root.
const repo = resolve(process.env.DAY4_REPO_ROOT ?? resolve(here, '../../../../..'));
const imported = relative => import(pathToFileURL(resolve(repo, relative)).href);
const [{ createApp }, { sessionCookie }, { parseProfileKey }, { AuthService }, { ConsentService }, { RecordService }, { RecordRepository }, { createTestDatabase }] = await Promise.all([
  imported('backend/src/app.js'), imported('backend/src/http/request.js'), imported('backend/src/security/crypto.js'),
  imported('backend/src/services/auth-service.js'), imported('backend/src/services/consent-service.js'),
  imported('backend/src/services/record-service.js'), imported('backend/src/repositories/record-repository.js'),
  imported('backend/test/helpers/database.js'),
]);

const ORIGIN = 'http://127.0.0.1:5173';
const KEY = parseProfileKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
const id = () => randomUUID();
const payload = () => ({ kind: 'CONVERSATION', content: { title: 'synthetic:Day4 title', body: 'synthetic:Day4 body' } });

async function harness(run) {
  const database = await createTestDatabase();
  const authService = new AuthService(database, { profileKey: KEY });
  const consentService = new ConsentService();
  const recordService = new RecordService(new RecordRepository(database), { encryptionKey: KEY, consentService });
  const server = createApp({ database, authService, consentService, recordService, appOrigin: ORIGIN }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await run({ base, database, authService }); }
  finally { await new Promise((yes, no) => server.close(error => error ? no(error) : yes())); await database.close(); }
}
async function context(base, cookie) {
  const response = await fetch(base + '/api/auth/context', { headers: cookie ? { Cookie: cookie } : {} });
  assert.equal(response.status, 200);
  const body = await response.json();
  return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: body.data.csrfToken };
}
async function post(base, path, state, body) {
  const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: state.cookie, Origin: ORIGIN, 'X-CSRF-Token': state.csrf }, body: JSON.stringify(body) });
  return { status: response.status, body: response.status === 204 ? null : await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function get(base, path, state) {
  const response = await fetch(base + path, { headers: state ? { Cookie: state.cookie } : {} });
  return { status: response.status, body: await response.json() };
}
async function account(base, loginName) {
  const password = 'Synthetic!Day4Pass123';
  const anonymous = await context(base);
  assert.equal((await post(base, '/api/auth/register', anonymous, { requestId: id(), loginName, password, confirmPassword: password })).status, 201);
  const login = await post(base, '/api/auth/login', anonymous, { loginName, password, target: 'HOME' });
  assert.equal(login.status, 200);
  return context(base, login.cookie);
}
async function consentFor(base, state, recordPayload) {
  const response = await post(base, '/api/consents', state, { requestId: id(), purpose: 'SAVE', operation: 'RECORD_CREATE', payload: recordPayload });
  assert.equal(response.status, 201);
  return response.body.data.consentId;
}
async function save(base, state, recordPayload = payload()) {
  const consentId = await consentFor(base, state, recordPayload);
  const request = { requestId: id(), consentId, ...recordPayload };
  const response = await post(base, '/api/records', state, request);
  assert.equal(response.status, 201);
  return { record: response.body.data, request };
}

test('D4-01 visitor denied; A explicitly saves, reads and logs out; B cannot view A', async () => {
  await harness(async ({ base, database }) => {
    assert.equal((await get(base, '/api/records')).status, 401);
    const a = await account(base, 'day4_synthetic_a');
    const b = await account(base, 'day4_synthetic_b');
    assert.equal((await get(base, '/api/records', a)).body.data.items.length, 0);
    const { record } = await save(base, a);
    const list = await get(base, '/api/records', a);
    assert.equal(list.status, 200); assert.equal(list.body.data.items.length, 1);
    assert.equal(list.body.data.items[0].id, record.id);
    assert.equal((await get(base, `/api/records/${record.id}`, a)).status, 200);
    assert.equal((await get(base, '/api/records', b)).body.data.items.length, 0);
    const denied = await get(base, `/api/records/${record.id}`, b);
    const missing = await get(base, `/api/records/${id()}`, b);
    assert.equal(denied.status, 404); assert.deepEqual(denied.body.error, missing.body.error);
    const rows = await database.query('SELECT title_ciphertext FROM saved_records WHERE id=$1', [record.id]);
    assert.equal(JSON.stringify(rows.rows).includes('synthetic:Day4 title'), false);
    assert.equal((await post(base, '/api/auth/logout', a, {})).status, 204);
    assert.equal((await get(base, '/api/records', a)).status, 401);
  });
});

test('D4-02 missing, mismatched and revoked SAVE consent cannot create a record', async () => {
  await harness(async ({ base, database }) => {
    const a = await account(base, 'day4_synthetic_consent');
    const p = payload();
    assert.equal((await post(base, '/api/records', a, { requestId: id(), consentId: id(), ...p })).status, 403);
    const wrong = await consentFor(base, a, { ...p, content: { ...p.content, title: 'synthetic:other' } });
    assert.equal((await post(base, '/api/records', a, { requestId: id(), consentId: wrong, ...p })).status, 403);
    const revoked = await consentFor(base, a, p);
    assert.equal((await post(base, `/api/consents/${revoked}/revoke`, a, {})).status, 200);
    assert.equal((await post(base, '/api/records', a, { requestId: id(), consentId: revoked, ...p })).status, 403);
    assert.equal((await database.query('SELECT id FROM saved_records')).rows.length, 0);
  });
});

test('D4-03 two-step clear rejects stale version and other account, removes payload and list visibility', async () => {
  await harness(async ({ base, database }) => {
    const a = await account(base, 'day4_synthetic_clear');
    const b = await account(base, 'day4_synthetic_clear_b');
    const { record } = await save(base, a);
    const path = `/api/records/${record.id}`;
    assert.equal((await post(base, `${path}/clear-confirmations`, a, { requestId: id(), expectedVersion: record.version + 1 })).status, 409);
    assert.equal((await post(base, `${path}/clear-confirmations`, b, { requestId: id(), expectedVersion: record.version })).status, 404);
    const confirmation = await post(base, `${path}/clear-confirmations`, a, { requestId: id(), expectedVersion: record.version });
    assert.equal(confirmation.status, 201);
    assert.equal((await get(base, path, a)).status, 200);
    const clear = await post(base, `${path}/clear`, a, { requestId: id(), expectedVersion: record.version, confirmationId: confirmation.body.data.confirmationId });
    assert.equal(clear.status, 200);
    assert.equal((await get(base, path, a)).status, 404);
    assert.equal((await get(base, '/api/records', a)).body.data.items.length, 0);
    const stored = await database.query('SELECT deleted_at, title_ciphertext FROM saved_records WHERE id=$1', [record.id]);
    assert.ok(stored.rows[0].deleted_at); assert.equal(stored.rows[0].title_ciphertext, null);
    assert.equal((await database.query('SELECT id FROM saved_messages WHERE saved_record_id=$1', [record.id])).rows.length, 0);
    const jobs = await database.query('SELECT status FROM deletion_jobs WHERE account_id=(SELECT account_id FROM saved_records WHERE id=$1)', [record.id]);
    assert.ok(jobs.rows.length > 0); // Background/backups are not proven erased by this check.
  });
});

test('D4-04 repeated save is idempotent; another entry and a revoked session cannot read the record', async () => {
  await harness(async ({ base, database, authService }) => {
    const a = await account(base, 'day4_synthetic_entry');
    const { record, request } = await save(base, a);
    const replay = await post(base, '/api/records', a, request);
    assert.equal(replay.status, 201); assert.equal(replay.body.data.id, record.id); assert.equal(replay.body.data.idempotent, true);
    const accountId = (await database.query('SELECT id FROM user_accounts WHERE login_identifier_normalized=$1', ['day4_synthetic_entry'])).rows[0].id;
    const entryId = (await database.query("INSERT INTO entry_points (code) VALUES ('DESKTOP_DAY4_MEMBER8') RETURNING id")).rows[0].id;
    const desktop = await authService.createContext(accountId, entryId);
    const desktopState = { cookie: sessionCookie(desktop.sessionToken).split(';')[0] };
    assert.equal((await get(base, `/api/records/${record.id}`, desktopState)).status, 404);
    assert.equal((await post(base, '/api/auth/logout', a, {})).status, 204);
    assert.equal((await get(base, `/api/records/${record.id}`, a)).status, 401);
  });
});
