import { loadEnvFile } from 'node:process';

import { createApp } from './app.js';
import { LangChainModelAdapter } from './ai/langchain-model-adapter.js';
import { createPoolFromEnv } from './db/database.js';
import { runMigrations } from './db/migration-runner.js';

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
const app = createApp({ database, modelAdapter });
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
