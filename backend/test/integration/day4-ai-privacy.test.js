import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../../src/app.js';
import { RecordRepository } from '../../src/repositories/record-repository.js';
import { parseProfileKey } from '../../src/security/crypto.js';
import { AuthService } from '../../src/services/auth-service.js';
import { ConsentService } from '../../src/services/consent-service.js';
import { RecordService } from '../../src/services/record-service.js';
import { TaskService } from '../../src/services/task-service.js';
import { createTestDatabase } from '../helpers/database.js';

const ORIGIN = 'http://127.0.0.1:5173';
const KEY = parseProfileKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
let sequence = 1000;
const nextId = () => `2f74a372-2e54-4fe7-945a-${String(++sequence).padStart(12, '0')}`;

function successfulReply(content = '这是一条合成陪伴回复。') {
  return {
    status: 'success',
    result: { content, suggested_action: 'STAY', citations: [], uncertainty: null },
  };
}

async function withApi(modelAdapter, callback) {
  const database = await createTestDatabase();
  const authService = new AuthService(database, { profileKey: KEY });
  const consentService = new ConsentService();
  const taskService = new TaskService({
    modelAdapter,
    consentService,
    searchProvider: { search: async () => ({ searchState: 'EMPTY', sources: [] }) },
  });
  const recordService = new RecordService(new RecordRepository(database), {
    encryptionKey: KEY,
    consentService,
  });
  const server = createApp({
    database,
    authService,
    consentService,
    taskService,
    recordService,
    appOrigin: ORIGIN,
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await callback({
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      database,
      taskService,
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await database.close();
  }
}

async function context(baseUrl, cookie) {
  const response = await fetch(`${baseUrl}/api/auth/context`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  const body = await response.json();
  return {
    cookie: response.headers.get('set-cookie').split(';')[0],
    csrf: body.data.csrfToken,
  };
}

async function post(baseUrl, path, state, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: state.cookie,
      Origin: ORIGIN,
      'X-CSRF-Token': state.csrf,
    },
    body: JSON.stringify(body),
  });
}

async function register(baseUrl, state, loginName) {
  const password = 'correct-horse-battery';
  const response = await post(baseUrl, '/api/auth/register', state, {
    requestId: nextId(),
    loginName,
    password,
    confirmPassword: password,
  });
  assert.equal(response.status, 201);
  return password;
}

async function login(baseUrl, state, loginName, password) {
  const response = await post(baseUrl, '/api/auth/login', state, {
    loginName,
    password,
    target: 'PROFILE',
  });
  assert.equal(response.status, 200);
  return context(baseUrl, response.headers.get('set-cookie').split(';')[0]);
}

async function startSession(baseUrl, state) {
  const response = await post(baseUrl, '/api/sessions', state, {
    requestId: nextId(),
    mode: 'LISTEN',
  });
  assert.equal(response.status, 201);
  return (await response.json()).data;
}

function agentPayload(session, selectedText) {
  return {
    sessionId: session.sessionId,
    activityId: session.activityId,
    sessionGeneration: session.sessionGeneration,
    activityGeneration: session.activityGeneration,
    mode: 'LISTEN',
    operation: 'REPLY',
    selectedText,
    selectedContextIds: [],
  };
}

async function issueConsent(baseUrl, state, purpose, operation, payload) {
  const response = await post(baseUrl, '/api/consents', state, {
    requestId: nextId(),
    purpose,
    operation,
    payload,
  });
  assert.equal(response.status, 201);
  return (await response.json()).data.consentId;
}

test('AI reply is temporary by default and AI_PROCESS cannot replace SAVE consent', async () => {
  let modelRequest;
  await withApi({
    async respond(input) {
      modelRequest = input;
      return successfulReply();
    },
  }, async ({ baseUrl, database }) => {
    const anonymous = await context(baseUrl);
    const password = await register(baseUrl, anonymous, 'day4_default_no_save');
    const user = await login(baseUrl, anonymous, 'day4_default_no_save', password);
    const session = await startSession(baseUrl, user);
    const selectedText = '只处理本轮合成文本，不要默认保存。';
    const aiPayload = agentPayload(session, selectedText);
    const aiConsentId = await issueConsent(
      baseUrl,
      user,
      'AI_PROCESS',
      'AGENT_TASK_CREATE',
      aiPayload,
    );
    const taskRequestId = nextId();
    const accepted = await post(baseUrl, '/api/agent/tasks', user, {
      requestId: taskRequestId,
      ...aiPayload,
      consentId: aiConsentId,
    });
    assert.equal(accepted.status, 202);
    await new Promise((resolve) => setImmediate(resolve));

    const completed = await fetch(`${baseUrl}/api/agent/tasks/${taskRequestId}`, {
      headers: { Cookie: user.cookie },
    });
    assert.equal(completed.status, 200);
    assert.equal((await completed.json()).data.status, 'completed');
    assert.equal(modelRequest.state.history_retention, false);
    assert.equal(modelRequest.state.long_term_memory_enabled, false);
    assert.equal((await database.query('SELECT count(*)::int AS count FROM saved_records')).rows[0].count, 0);

    const recordPayload = {
      kind: 'CONVERSATION',
      content: { title: '用户主动保存', body: selectedText },
    };
    const rejectedSave = await post(baseUrl, '/api/records', user, {
      requestId: nextId(),
      consentId: aiConsentId,
      ...recordPayload,
    });
    assert.equal(rejectedSave.status, 403);

    const saveConsentId = await issueConsent(
      baseUrl,
      user,
      'SAVE',
      'RECORD_CREATE',
      recordPayload,
    );
    const rejectedAi = await post(baseUrl, '/api/agent/tasks', user, {
      requestId: nextId(),
      ...aiPayload,
      consentId: saveConsentId,
    });
    assert.equal(rejectedAi.status, 403);

    const saved = await post(baseUrl, '/api/records', user, {
      requestId: nextId(),
      consentId: saveConsentId,
      ...recordPayload,
    });
    assert.equal(saved.status, 201);
    assert.equal((await database.query('SELECT count(*)::int AS count FROM saved_records')).rows[0].count, 1);
  });
});

test('switching accounts cancels the old login task and rejects its late reply', async () => {
  let finish;
  await withApi({
    respond() {
      return new Promise((resolve) => { finish = resolve; });
    },
  }, async ({ baseUrl, taskService }) => {
    const anonymous = await context(baseUrl);
    const alicePassword = await register(baseUrl, anonymous, 'day4_switch_alice');
    const alice = await login(baseUrl, anonymous, 'day4_switch_alice', alicePassword);
    const bobPassword = await register(baseUrl, alice, 'day4_switch_bob');

    const session = await startSession(baseUrl, alice);
    const aiPayload = agentPayload(session, '账号切换前的合成在途消息。');
    const consentId = await issueConsent(
      baseUrl,
      alice,
      'AI_PROCESS',
      'AGENT_TASK_CREATE',
      aiPayload,
    );
    const taskRequestId = nextId();
    assert.equal((await post(baseUrl, '/api/agent/tasks', alice, {
      requestId: taskRequestId,
      ...aiPayload,
      consentId,
    })).status, 202);
    await new Promise((resolve) => setImmediate(resolve));

    const bob = await login(baseUrl, alice, 'day4_switch_bob', bobPassword);
    finish(successfulReply('供应商在换号后才返回的旧回复。'));
    await new Promise((resolve) => setImmediate(resolve));

    const oldTask = taskService.agentTasks.get(taskRequestId);
    assert.equal(oldTask.status, 'cancelled');
    assert.equal(oldTask.result, undefined);
    const crossAccountRead = await fetch(`${baseUrl}/api/agent/tasks/${taskRequestId}`, {
      headers: { Cookie: bob.cookie },
    });
    assert.equal(crossAccountRead.status, 404);
  });
});
