import { createApp } from './app.js';
import { createPoolFromEnv } from './db/database.js';
import { runMigrations } from './db/migration-runner.js';

const database = createPoolFromEnv();
if (process.env.MIGRATE_ON_START === 'true') {
  await runMigrations(database);
}

const port = Number(process.env.PORT ?? 3000);
const app = createApp({ database });
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
