import assert from 'node:assert/strict';
import test from 'node:test';
import { listenForHttp } from '../helpers/http.js';

import { createApp } from '../../src/app.js';
import { sessionCookie } from '../../src/http/request.js';
import { parseProfileKey } from '../../src/security/crypto.js';
import { RecordRepository } from '../../src/repositories/record-repository.js';
import { AuthService } from '../../src/services/auth-service.js';
import { ConsentService } from '../../src/services/consent-service.js';
import { TaskService } from '../../src/services/task-service.js';
import { TrainingService } from '../../src/services/training-service.js';
import { createSavedQueries } from '../../src/services/saved-query-service.js';
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
  const taskService = new TaskService({ consentService,
    modelAdapter: { respond: async () => ({ status: 'success', result: { content: '受控测试模型输出' } }) },
    searchProvider: { search: async () => ({ searchState: 'SUCCESS', sources: [{ id: nextId(), title: '受控测试来源', url: 'https://example.org/source', snippet: '测试来源摘录', publisher: 'Example', sourceTier: 'S3', quality: 'UNKNOWN', publishedAt: null, retrievedAt: new Date().toISOString(), verificationState: 'VERIFIED' }], partial: false, hasConflict: false, claims: [] }) },
  });
  const trainingService = new TrainingService();
  const recordService = new RecordService(new RecordRepository(database), {
    encryptionKey: KEY,
    savedQueries: createSavedQueries(database, taskService, KEY),
    consentService,
  });
  taskService.resolveSelectedContext = (context, ids) => recordService.resolveContext(context, ids);
  const server = await listenForHttp(createApp({ database, authService, consentService, recordService, taskService, trainingService, appOrigin: ORIGIN }));
  try {
    await callback({ baseUrl: `http://127.0.0.1:${server.address().port}`, database, authService, recordService, taskService });
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


test('real records preserve dialogue roles, decrypt only owner reads, and support optional calendar fields and versioned edits', async () => {
  await withApi(async ({ baseUrl, database }) => {
    const alice = await registerAndLogin(baseUrl, 'live_alice');
    const bob = await registerAndLogin(baseUrl, 'live_bob');
    const read = async (path, state = alice) => fetch(`${baseUrl}${path}`, { headers: { Cookie: state.cookie } });
    const grant = async (operation, payload, state = alice) => {
      const response = await mutate(baseUrl, '/api/consents', state, { requestId: nextId(), purpose: 'SAVE', operation, payload });
      assert.equal(response.status, 201);
      return (await response.json()).data.consentId;
    };
    const create = async payload => {
      const response = await mutate(baseUrl, '/api/records', alice, { requestId: nextId(), consentId: await grant('RECORD_CREATE', payload), ...payload });
      assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
      return (await response.json()).data;
    };
    const messages = [{ role: 'USER', content: '这是我的真实记录' }, { role: 'ASSISTANT', content: '保留助手角色' }];
    const conversation = await create({ kind: 'CONVERSATION', content: { title: '完整对话', messages } });
    const recovered = (await (await read(`/api/records/${conversation.id}`)).json()).data;
    assert.deepEqual(recovered.content.messages, messages);
    assert.equal(JSON.stringify(recovered).includes('Ciphertext'), false);
    assert.equal(recovered.title, '完整对话');
    assert.equal((await read(`/api/records/${conversation.id}`, bob)).status, 404);

    const content = { title: '今天', recordDate: '2026-10-29', emotionCodes: [], intensity: null, timezoneName: 'Asia/Hong_Kong', note: '只记下一句话' };
    const emotion = await create({ kind: 'EMOTION', content });
    const stored = (await database.query('SELECT event_ciphertext FROM emotion_records WHERE saved_record_id = $1', [emotion.id])).rows[0];
    assert.equal(Buffer.from(stored.event_ciphertext).includes(Buffer.from(content.note)), false);
    const detail = (await (await read(`/api/records/${emotion.id}`)).json()).data;
    const { title, ...expectedContent } = content;
    assert.deepEqual(detail.content, expectedContent);
    const october = (await (await read('/api/records?kind=EMOTION&from=2026-10-01&to=2026-10-31')).json()).data;
    assert.deepEqual(october.items.map(item => item.id), [emotion.id]);
    assert.equal((await (await read('/api/records?kind=EMOTION&from=2026-11-01&to=2026-11-30')).json()).data.items.length, 0);
    assert.equal((await read('/api/records?kind=EMOTION&from=2026-02-30&to=2026-03-01')).status, 400);
    assert.equal((await read('/api/records?kind=EMOTION&from=2026-11-01')).status, 400);
    assert.equal((await (await read('/api/records?kind=EMOTION', bob)).json()).data.items.length, 0);
    await create({ kind: 'EMOTION', content: { ...content, title: '另一条' } });
    const page = (await (await read('/api/records?kind=EMOTION&from=2026-10-01&to=2026-10-31&limit=1')).json()).data;
    assert.ok(page.nextCursor);
    assert.equal((await read(`/api/records?kind=EMOTION&from=2026-11-01&to=2026-11-30&cursor=${page.nextCursor}`)).status, 400);
    const changed = { ...content, emotionCodes: ['平静'], intensity: 2, note: '修改后的备注' };
    const updatePayload = { recordId: emotion.id, expectedVersion: emotion.version, content: changed };
    const updateBody = { requestId: nextId(), expectedVersion: emotion.version, content: changed, consentId: await grant('RECORD_UPDATE', updatePayload) };
    const patch = (body, state = alice) => fetch(`${baseUrl}/api/records/${emotion.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: state.cookie, Origin: ORIGIN, 'X-CSRF-Token': state.csrf }, body: JSON.stringify(body) });
    assert.equal((await patch(updateBody, bob)).status, 404);
    const updated = await patch(updateBody);
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).data.version, emotion.version + 1);
    assert.equal((await patch(updateBody)).status, 200, 'same request retries despite randomized encryption');
    assert.equal((await patch({ ...updateBody, requestId: nextId() })).status, 409);
    const reopened = (await (await read(`/api/records/${emotion.id}`)).json()).data;
    assert.equal(reopened.content.note, changed.note);
    assert.equal(reopened.content.intensity, 2);
    const wrongBody = { ...updateBody, requestId: nextId(), expectedVersion: emotion.version + 1, content: { ...changed, note: '未经许可修改' } };
    assert.equal((await patch(wrongBody)).status, 403);
    const mismatched = { kind: 'EMOTION', content: { title: '错误类型', messages } };
    const rejected = await mutate(baseUrl, '/api/records', alice, { ...mismatched, requestId: nextId(), consentId: await grant('RECORD_CREATE', mismatched) });
    assert.equal(rejected.status, 400);
  });
});


test('all persisted business kinds, deposit controls, preferences and real search-save wiring work through HTTP', async () => {
  await withApi(async ({ baseUrl, database, authService, recordService, taskService }) => {
    const alice = await registerAndLogin(baseUrl, 'all_features_alice');
    const bob = await registerAndLogin(baseUrl, 'all_features_bob');
    const read = path => fetch(`${baseUrl}${path}`, { headers: { Cookie: alice.cookie } });
    const grant = async (payload, purpose = 'SAVE', operation = 'RECORD_CREATE') => (await (await mutate(baseUrl, '/api/consents', alice, { requestId: nextId(), purpose, operation, payload })).json()).data.consentId;
    const create = async (kind, content) => {
      const payload = { kind, content };
      const response = await mutate(baseUrl, '/api/records', alice, { ...payload, requestId: nextId(), consentId: await grant(payload) });
      assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
      return (await response.json()).data;
    };
    const conversation = await create('CONVERSATION', { title: '可选历史', messages: [{ role: 'USER', content: '本人选择的历史内容' }] });
    const aliceContext = await authService.resolveContext(alice.cookie.split('=')[1]);
    const bobContext = await authService.resolveContext(bob.cookie.split('=')[1]);
    const selected = await recordService.resolveContext(aliceContext, [conversation.id]);
    assert.equal(selected[0].content.messages[0].content, '本人选择的历史内容');
    await assert.rejects(recordService.resolveContext(bobContext, [conversation.id]));
    const emotion = await create('EMOTION', { title: '不自动展开', recordDate: '2026-10-29', emotionCodes: [], intensity: null, timezoneName: 'Asia/Hong_Kong', note: '日历正文' });
    await assert.rejects(recordService.resolveContext(aliceContext, [emotion.id]));
    let modelInput;
    taskService.modelAdapter = { respond: async input => { modelInput = input; return { status: 'success', result: { content: '测试历史选择链路' } }; } };
    const aiSession = (await (await mutate(baseUrl, '/api/sessions', alice, { requestId: nextId(), mode: 'LISTEN' })).json()).data;
    const aiPayload = { sessionId: aiSession.sessionId, activityId: aiSession.activityId, sessionGeneration: 0, activityGeneration: 0, mode: 'LISTEN', operation: 'REPLY', selectedText: '继续整理', selectedContextIds: [conversation.id] };
    const aiResponse = await mutate(baseUrl, '/api/agent/tasks', alice, { ...aiPayload, requestId: nextId(), consentId: await grant(aiPayload, 'AI_PROCESS', 'AGENT_TASK_CREATE') });
    assert.equal(aiResponse.status, 202);
    const aiId = (await aiResponse.json()).data.requestId;
    for (let attempt=0; attempt<20; attempt++) { if (taskService.getAgentTask(aliceContext, aiId).status === 'completed') break; await new Promise(resolve => setTimeout(resolve, 5)); }
    assert.equal(modelInput.context.summary.selected_records[0].content.messages[0].content, '本人选择的历史内容');
    const worry = await create('WORRY_OBJECT', { title: '一件事', shapeCode: 'STONE', body: '需要整理的烦恼' });
    assert.equal((await (await read(`/api/records/${worry.id}`)).json()).data.content.body, '需要整理的烦恼');
    const draft = await create('REHEARSAL_DRAFT', { title: '认可的表达', scene: '与同学交流', expressions: ['我需要一点准备时间'] });
    assert.deepEqual((await (await read(`/api/records/${draft.id}`)).json()).data.content.expressions, ['我需要一点准备时间']);
    const deposit = await create('DEPOSIT', { title: '先放下', body: '寄存私密正文', reopenAt: new Date(Date.now()+3600000).toISOString() });
    let state = (await (await read(`/api/records/${deposit.id}/deposit`)).json()).data;
    assert.equal(state.body, null); assert.equal(state.state, 'STORED');
    assert.equal(JSON.stringify((await (await read(`/api/records/${deposit.id}`)).json()).data).includes('寄存私密正文'), false);
    assert.equal((await mutate(baseUrl, `/api/records/${deposit.id}/deposit/retrieve`, alice, { requestId: nextId(), expectedVersion: state.version })).status, 409);
    assert.equal((await mutate(baseUrl, `/api/records/${deposit.id}/deposit/retrieve`, bob, { requestId: nextId(), expectedVersion: state.version })).status, 404);
    const postponed = await mutate(baseUrl, `/api/records/${deposit.id}/deposit/postpone`, alice, { requestId: nextId(), expectedVersion: state.version, reopenAt: new Date(Date.now()+7200000).toISOString() });
    assert.equal(postponed.status, 200); assert.equal((await postponed.json()).data.body, null);
    await database.query("UPDATE worry_deposits SET reopen_at = now() - interval '1 second' WHERE saved_record_id = $1", [deposit.id]);
    state = (await (await read(`/api/records/${deposit.id}/deposit`)).json()).data;
    assert.equal(state.state, 'AVAILABLE'); assert.equal(state.body, null);
    const retrieved = await mutate(baseUrl, `/api/records/${deposit.id}/deposit/retrieve`, alice, { requestId: nextId(), expectedVersion: state.version });
    assert.equal(retrieved.status, 200); assert.equal((await retrieved.json()).data.body, '寄存私密正文');

    const prefs = (await (await read('/api/preferences')).json()).data;
    const update = await fetch(`${baseUrl}/api/preferences`, { method: 'PATCH', headers: { Cookie: alice.cookie, Origin: ORIGIN, 'X-CSRF-Token': alice.csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: nextId(), expectedVersion: prefs.version, offerHistorySave: true }) });
    assert.equal(update.status, 200); assert.equal((await update.json()).data.offerHistorySave, true);
    assert.equal((await (await read('/api/profile/summary')).json()).data.counts.WORRY_OBJECT, 1);

    for (const definitionId of ['BREATHING','FIVE_SENSES','PAUSE_ORGANIZE','TASK_SPLIT']) {
      const start = await mutate(baseUrl,'/api/trainings',alice,{ requestId: nextId(), definitionId });
      assert.equal(start.status,201); const training = (await start.json()).data;
      assert.equal(training.definitionId,definitionId); assert.equal(training.state,'running');
      assert.equal((await mutate(baseUrl,`/api/trainings/${training.trainingSessionId}/actions`,alice,{ requestId:nextId(),expectedVersion:training.version,action:'EXIT' })).status,200);
    }
    const session = (await (await mutate(baseUrl,'/api/sessions',alice,{ requestId:nextId(),mode:'SEARCH' })).json()).data;
    const payload = { sessionId:session.sessionId,activityId:session.activityId,sessionGeneration:session.sessionGeneration,activityGeneration:session.activityGeneration,question:'受控测试问题' };
    const consentId = await grant(payload,'SEARCH_PROCESS','SEARCH_TASK_CREATE');
    const searchId = nextId();
    assert.equal((await mutate(baseUrl,'/api/search/tasks',alice,{ ...payload,requestId:searchId,consentId })).status,202);
    await new Promise(resolve => setImmediate(resolve));
    const queryPayload = { kind:'QUERY',searchRequestId:searchId };
    const saved = await mutate(baseUrl,'/api/saved-queries',alice,{ requestId:nextId(),searchRequestId:searchId,consentId:await grant(queryPayload) });
    assert.equal(saved.status,201,JSON.stringify(await saved.clone().json()));
    const queryId = (await saved.json()).data.id;
    const detail = (await (await read(`/api/records/${queryId}`)).json()).data;
    assert.equal(detail.content.question,'受控测试问题');
    assert.equal(detail.content.claims[0].text,'测试来源摘录');
    assert.equal(detail.content.claims[0].status,'UNKNOWN');
    assert.equal(JSON.stringify(detail).includes('Ciphertext'),false);
    const forbidden = await mutate(baseUrl,'/api/saved-queries',bob,{ requestId:nextId(),searchRequestId:searchId,consentId:await grant(queryPayload) });
    assert.equal(forbidden.status,403);
    const switched = await mutate(baseUrl,`/api/sessions/${session.sessionId}/switch`,alice,{ requestId:nextId(),targetMode:'LISTEN',expectedSessionGeneration:0,selectedContextIds:[] });
    assert.equal(switched.status,200); assert.equal((await switched.json()).data.mode,'LISTEN');
  });
});
