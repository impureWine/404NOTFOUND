import { loadEnvFile } from 'node:process';
try { loadEnvFile(); } catch (error) { if (error?.code !== 'ENOENT') throw error; }

import { createPoolFromEnv } from './database.js';
import { runMigrations } from './migration-runner.js';

const pool = createPoolFromEnv();

try {
  const applied = await runMigrations(pool);
  console.log(JSON.stringify({ applied }));
} finally {
  await pool.end();
}
