import { loadEnvFile } from 'node:process';

import { createApp } from './app.js';
import { LangChainModelAdapter } from './ai/langchain-model-adapter.js';
import { createPoolFromConfig } from './db/database.js';
import { runMigrations } from './db/migration-runner.js';
import { parseProfileKey } from './security/crypto.js';
import { AuthService } from './services/auth-service.js';
import { TaskService } from './services/task-service.js';
import { TrainingService } from './services/training-service.js';
import { BingSearchProvider } from './search/bing-search-provider.js';
import { createSavedQueries } from './services/saved-query-service.js';
import { fileURLToPath } from 'node:url';
import { RecordRepository } from './repositories/record-repository.js';
import { RecordService } from './services/record-service.js';
import { ConsentService } from './services/consent-service.js';
import { getRuntimeConfig } from './runtime-config.js';

try {
  loadEnvFile();
} catch (error) {
  if (error?.code !== 'ENOENT') {
    throw error;
  }
}

const config = getRuntimeConfig();
const database = createPoolFromConfig(config.database);
if (config.migrateOnStart) {
  await runMigrations(database);
}

const modelAdapter = new LangChainModelAdapter();
const authService = new AuthService(database, {
  profileKey: parseProfileKey(process.env.PROFILE_ENCRYPTION_KEY),
  entryCode: process.env.APP_ENTRY_POINT || 'WEB',
});
const consentService = new ConsentService();
const taskService = new TaskService({
  consentService,
  modelAdapter,
  searchProvider: new BingSearchProvider({
    apiKey: process.env.SERPAPI_API_KEY,
    market: config.search.market,
    timeoutMs: config.search.timeoutMs,
  }),
});
const trainingService = new TrainingService();
const recordService = new RecordService(new RecordRepository(database), {
  encryptionKey: parseProfileKey(process.env.PROFILE_ENCRYPTION_KEY),
  consentService,
  savedQueries: createSavedQueries(database, taskService, parseProfileKey(process.env.PROFILE_ENCRYPTION_KEY)),
});
taskService.resolveObject = (context, recordId, version) => recordService.resolveObject(context, recordId, version);
taskService.resolveSelectedContext = (context, ids) => recordService.resolveContext(context, ids);
const app = createApp({
  database,
  modelAdapter,
  authService,
  taskService,
  trainingService,
  recordService,
  consentService,
  appOrigin: config.appOrigin,
  secureCookies: config.secureCookies,
  staticDirectory: process.env.APP_SERVE_FRONTEND === 'true' ? fileURLToPath(new URL('../../prototype/dist/', import.meta.url)) : null,
  internalModelToken: process.env.INTERNAL_MODEL_TOKEN ?? null,
});
const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`Data service listening on http://127.0.0.1:${config.port}`);
});

async function shutdown() {
  server.close(async () => {
    await database.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
