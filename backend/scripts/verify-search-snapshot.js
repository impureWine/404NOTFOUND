import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';

import { PGlite } from '@electric-sql/pglite';
import { searchTaskStateSchema } from '@404notfound/contracts';

import { runMigrations } from '../src/db/migration-runner.js';
import { RecordRepository } from '../src/repositories/record-repository.js';
import { BingSearchProvider } from '../src/search/bing-search-provider.js';
import { ConsentService } from '../src/services/consent-service.js';
import { RecordService } from '../src/services/record-service.js';
import { createSavedQueries } from '../src/services/saved-query-service.js';
import { TaskService } from '../src/services/task-service.js';

const startedAt = new Date().toISOString();
const begin = Date.now();
const { values } = parseArgs({ options: { 'env-file': { type: 'string' } } });
let database;
let taskService;
let context;
const report = { startedAt, provider: 'bing', via: 'SerpAPI',
  question: 'PostgreSQL documentation', database: 'isolated in-memory PGlite',
  networkAttempted: false, productionDatabaseTouched: false };

try {
  try {
    process.loadEnvFile(values['env-file']);
  } catch (error) {
    if (values['env-file'] || error.code !== 'ENOENT') throw error;
  }
  if (!process.env.SERPAPI_API_KEY?.trim()) {
    Object.assign(report, { status: 'blocked', code: 'SEARCH_NOT_CONFIGURED',
      nextStep: 'Configure SERPAPI_API_KEY in a backend-only local env file, then rerun.' });
    process.exitCode = 2;
  } else {
    const provider = new BingSearchProvider({ apiKey: process.env.SERPAPI_API_KEY,
      market: process.env.BING_SEARCH_MARKET || 'zh-CN',
      timeoutMs: Number(process.env.SEARCH_TIMEOUT_MS || 15000) });
    database = new PGlite();
    report.appliedMigrations = await runMigrations(database);
    const entry = await database.query("INSERT INTO entry_points (code) VALUES ('BETA_SEARCH_CHECK') RETURNING id");
    const account = await database.query(`INSERT INTO user_accounts (login_identifier, login_identifier_normalized)
      VALUES ('synthetic_search_check', 'synthetic_search_check') RETURNING id`);
    context = { accountId: account.rows[0].id, entryPointId: entry.rows[0].id, sessionId: randomUUID() };
    const consents = new ConsentService();
    taskService = new TaskService({ consentService: consents, searchProvider: provider });
    const records = new RecordService(new RecordRepository(database), {
      encryptionKey: Buffer.alloc(32, 4), consentService: consents,
      savedQueries: createSavedQueries(database, taskService, Buffer.alloc(32, 4)),
    });
    const session = taskService.createSession(context, { requestId: randomUUID(), mode: 'SEARCH' });
    const { mode, state, ...ids } = session;
    const payload = { ...ids, question: report.question };
    const consentId = consents.create(context, { requestId: randomUUID(), purpose: 'SEARCH_PROCESS',
      operation: 'SEARCH_TASK_CREATE', payload }).consentId;
    const requestId = randomUUID();
    report.networkAttempted = true;
    taskService.createSearchTask(context, { ...payload, requestId, consentId });
    let task;
    const deadline = Date.now() + provider.timeoutMs + 2000;
    do {
      task = searchTaskStateSchema.parse(taskService.getSearchTask(context, requestId));
      if (!['pending', 'running'].includes(task.status)) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    } while (Date.now() < deadline);
    if (task.status === 'failed') {
      Object.assign(report, { status: 'failed', code: task.failureReason });
      process.exitCode = 1;
    } else if (task.status !== 'completed') {
      taskService.cancelSearchTask(context, requestId);
      Object.assign(report, { status: 'failed', code: 'TIMEOUT' });
      process.exitCode = 1;
    } else if (task.searchState === 'EMPTY') {
      Object.assign(report, { status: 'empty', sourceCount: 0, snapshotVerified: false });
      process.exitCode = 2;
    } else {
      const savePayload = { kind: 'QUERY', searchRequestId: requestId };
      const saveConsent = consents.create(context, { requestId: randomUUID(), purpose: 'SAVE',
        operation: 'RECORD_CREATE', payload: savePayload });
      const body = { requestId: randomUUID(), searchRequestId: requestId, consentId: saveConsent.consentId };
      const saved = await records.saveQuery(context, body);
      const detail = await records.get(context, saved.id);
      assert.equal(detail.content.question, report.question);
      assert.equal(detail.content.sources.length, task.sources.length);
      assert.equal(detail.content.uncertaintyNote, task.uncertaintyNote);
      for (const [index, original] of task.sources.entries()) {
        const { id, snippet, ...metadata } = original;
        const { id: savedId, ...snapshot } = detail.content.sources[index];
        assert.deepEqual(snapshot, metadata);
      }
      assert.equal((await records.saveQuery(context, body)).id, saved.id);
      Object.assign(report, { status: 'success', sourceCount: task.sources.length,
        sources: detail.content.sources, uncertaintyNote: detail.content.uncertaintyNote,
        snapshotVerified: true, replayVerified: true });
    }
  }
} catch {
  // Never print credential-bearing URLs, env-file contents, or raw exceptions.
  Object.assign(report, { status: 'failed', code: 'VERIFICATION_FAILED' });
  process.exitCode = 1;
} finally {
  if (taskService && context) taskService.invalidateContext(context);
  if (database) await database.close();
  report.elapsedMs = Date.now() - begin;
  console.log(JSON.stringify(report, null, 2));
}
