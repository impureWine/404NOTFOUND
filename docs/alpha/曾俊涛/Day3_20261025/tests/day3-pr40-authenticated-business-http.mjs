/** Independent PR #40 check: real AuthService/PGlite, synthetic model and consent. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const repo = resolve(process.env.DAY3_PR_REPO_ROOT ?? workspace);
const imported = relative => import(pathToFileURL(resolve(repo, relative)).href);
const [{ createApp }, { AuthService }, { TaskService }, { TrainingService }, { parseProfileKey }, { createTestDatabase }] = await Promise.all([
  imported('backend/src/app.js'), imported('backend/src/services/auth-service.js'),
  imported('backend/src/services/task-service.js'), imported('backend/src/services/training-service.js'),
  imported('backend/src/security/crypto.js'), imported('backend/test/helpers/database.js'),
]);

const origin = 'http://127.0.0.1:5173';
const id = () => randomUUID();
const model = { respond: async () => ({ status: 'success', result: { content: '合成回复：可以先慢慢呼吸。', suggested_action: 'STAY', citations: [], uncertainty: null } }) };
const consent = { assert() {} }; // No real external processing; the consent boundary remains unverified.

async function harness(run, modelAdapter = model) {
  const database = await createTestDatabase();
  const authService = new AuthService(database, { profileKey: parseProfileKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=') });
  const taskService = new TaskService({ modelAdapter, consentService: consent, searchProvider: { search: async () => ({ searchState: 'EMPTY', sources: [] }) } });
  const server = createApp({ database, authService, taskService, trainingService: new TrainingService(), appOrigin: origin }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await run({ base }); }
  finally { await new Promise((yes, no) => server.close(error => error ? no(error) : yes())); await database.close(); }
}

async function context(base, cookie) {
  const response = await fetch(base + '/api/auth/context', { headers: cookie ? { Cookie: cookie } : {} });
  assert.equal(response.status, 200);
  const body = await response.json();
  return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: body.data.csrfToken };
}
async function post(base, path, state, body) {
  const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: state.cookie, Origin: origin, 'X-CSRF-Token': state.csrf }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function get(base, path, state) {
  const response = await fetch(base + path, { headers: { Cookie: state.cookie } });
  return { status: response.status, body: await response.json() };
}
async function account(base, name) {
  const password = 'Synthetic!Pass123';
  let state = await context(base);
  const registered = await post(base, '/api/auth/register', state, { requestId: id(), loginName: name, password, confirmPassword: password });
  assert.equal(registered.status, 201);
  const logged = await post(base, '/api/auth/login', state, { loginName: name, password, target: 'HOME' });
  assert.equal(logged.status, 200);
  state = await context(base, logged.cookie);
  return state;
}

test('authenticated naming-card, companion reply and Five Senses pause/resume/exit work at HTTP layer', async () => {
  await harness(async ({ base }) => {
    const user = await account(base, 'qa_day3_a');
    const route = await post(base, '/api/naming-card/route', user, { emotionWords: ['焦虑'], need: 'LISTEN' });
    assert.equal(route.status, 200); assert.equal(route.body.data.targetMode, 'COMPANION');
    const session = await post(base, '/api/sessions', user, { requestId: id(), mode: 'LISTEN' });
    assert.equal(session.status, 201);
    const s = session.body.data;
    const requestId = id();
    const accepted = await post(base, '/api/agent/tasks', user, { requestId, sessionId: s.sessionId, activityId: s.activityId, sessionGeneration: 0, activityGeneration: 0, mode: 'LISTEN', operation: 'REPLY', selectedText: '合成输入：今天有点紧张。', selectedContextIds: [], consentId: id() });
    assert.equal(accepted.status, 202);
    let task;
    for (let attempt = 0; attempt < 20; attempt++) { task = await get(base, `/api/agent/tasks/${requestId}`, user); if (task.body.data.status !== 'pending' && task.body.data.status !== 'running') break; await new Promise(yes => setTimeout(yes, 10)); }
    assert.equal(task.status, 200); assert.equal(task.body.data.status, 'completed'); assert.match(task.body.data.result.text, /合成回复/);
    const started = await post(base, '/api/trainings', user, { requestId: id(), definitionId: 'FIVE_SENSES' });
    assert.equal(started.status, 201); assert.equal(started.body.data.step.stepId, 'SEE');
    let t = started.body.data;
    for (const [action, expected] of [['PAUSE', 'paused'], ['RESUME', 'running'], ['EXIT', 'exited']]) {
      const result = await post(base, `/api/trainings/${t.trainingSessionId}/actions`, user, { requestId: id(), action, expectedVersion: t.version });
      assert.equal(result.status, 200); t = result.body.data; assert.equal(t.state, expected);
    }
    assert.equal(t.step, null);
  });
});

test('other account cannot read companion task or training state; stale training version is rejected', async () => {
  await harness(async ({ base }) => {
    const a = await account(base, 'qa_day3_owner'); const b = await account(base, 'qa_day3_other');
    const session = (await post(base, '/api/sessions', a, { requestId: id(), mode: 'LISTEN' })).body.data;
    const requestId = id();
    const created = await post(base, '/api/agent/tasks', a, { requestId, sessionId: session.sessionId, activityId: session.activityId, sessionGeneration: 0, activityGeneration: 0, mode: 'LISTEN', operation: 'REPLY', selectedText: '合成输入。', selectedContextIds: [], consentId: id() });
    assert.equal(created.status, 202);
    assert.equal((await get(base, `/api/agent/tasks/${requestId}`, b)).status, 404);
    const started = await post(base, '/api/trainings', a, { requestId: id(), definitionId: 'FIVE_SENSES' });
    assert.equal(started.status, 201);
    const t = started.body.data;
    assert.equal((await get(base, `/api/trainings/${t.trainingSessionId}`, b)).status, 404);
    assert.equal((await post(base, `/api/trainings/${t.trainingSessionId}/actions`, b, { requestId: id(), action: 'EXIT', expectedVersion: 0 })).status, 404);
    assert.equal((await post(base, `/api/trainings/${t.trainingSessionId}/actions`, a, { requestId: id(), action: 'PAUSE', expectedVersion: 0 })).status, 200);
    assert.equal((await post(base, `/api/trainings/${t.trainingSessionId}/actions`, a, { requestId: id(), action: 'RESUME', expectedVersion: 0 })).status, 409);
  });
});

test('cancelled companion task does not accept a late synthetic model reply', async () => {
  let finish;
  const delayedModel = { respond: () => new Promise(yes => { finish = yes; }) };
  await harness(async ({ base }) => {
    const user = await account(base, 'qa_day3_cancel');
    const session = (await post(base, '/api/sessions', user, { requestId: id(), mode: 'LISTEN' })).body.data;
    const requestId = id();
    const accepted = await post(base, '/api/agent/tasks', user, { requestId, sessionId: session.sessionId, activityId: session.activityId, sessionGeneration: 0, activityGeneration: 0, mode: 'LISTEN', operation: 'REPLY', selectedText: '合成输入。', selectedContextIds: [], consentId: id() });
    assert.equal(accepted.status, 202);
    const cancelled = await post(base, `/api/agent/tasks/${requestId}/cancel`, user, {});
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.data.status, 'cancelled');
    finish({ status: 'success', result: { content: '迟到的合成回复。' } });
    await new Promise(yes => setImmediate(yes));
    const after = await get(base, `/api/agent/tasks/${requestId}`, user);
    assert.equal(after.status, 200);
    assert.equal(after.body.data.status, 'cancelled');
    assert.equal(after.body.data.result, undefined);
  }, delayedModel);
});
