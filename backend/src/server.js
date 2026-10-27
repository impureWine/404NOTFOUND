import { loadEnvFile } from 'node:process';

import { createApp } from './app.js';
import { LangChainModelAdapter } from './ai/langchain-model-adapter.js';
import { createPoolFromEnv } from './db/database.js';
import { runMigrations } from './db/migration-runner.js';
import { parseProfileKey } from './security/crypto.js';
import { AuthService } from './services/auth-service.js';
import { TaskService } from './services/task-service.js';
import { TrainingService } from './services/training-service.js';
import { WikipediaSearchProvider } from './search/wikipedia-search-provider.js';
import { RecordRepository } from './repositories/record-repository.js';
import { RecordService } from './services/record-service.js';
import { ConsentService } from './services/consent-service.js';

try {
  loadEnvFile();
} catch (error) {
  if (error?.code !== 'ENOENT') {
    throw error;
  }
}

const database = createPoolFromEnv();
if (process.env.MIGRATE_ON_START === 'true') {
  await runMigrations(database);
}

const port = Number(process.env.PORT ?? 3000);
const modelAdapter = new LangChainModelAdapter();
const authService = new AuthService(database, {
  profileKey: parseProfileKey(process.env.PROFILE_ENCRYPTION_KEY),
});
const consentService = new ConsentService();
const taskService = new TaskService({
  consentService,
  modelAdapter,
  searchProvider: new WikipediaSearchProvider({
    language: process.env.SEARCH_LANGUAGE ?? 'zh',
    timeoutMs: Number(process.env.SEARCH_TIMEOUT_MS ?? 5000),
  }),
});
const trainingService = new TrainingService();
const recordService = new RecordService(new RecordRepository(database), {
  encryptionKey: parseProfileKey(process.env.PROFILE_ENCRYPTION_KEY),
  consentService,
});
const app = createApp({
  database,
  modelAdapter,
  authService,
  taskService,
  trainingService,
  recordService,
  consentService,
  appOrigin: process.env.APP_ORIGIN ?? 'http://127.0.0.1:5173',
  secureCookies: process.env.SESSION_COOKIE_SECURE === 'true',
  internalModelToken: process.env.INTERNAL_MODEL_TOKEN ?? null,
});
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Data service listening on http://127.0.0.1:${port}`);
});

async function shutdown() {
  server.close(async () => {
    await database.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
