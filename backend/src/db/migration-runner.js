import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { executeSqlScript, withTransaction } from './database.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(currentDirectory, '..', '..');
const repositoryRoot = path.resolve(backendRoot, '..');

async function migrationFiles() {
  const localDirectory = path.join(backendRoot, 'migrations');
  const localFiles = (await readdir(localDirectory))
    .filter((name) => /^\d{3}_.+\.sql$/.test(name))
    .sort()
    .map((name) => ({ name, path: path.join(localDirectory, name) }));

  return [
    {
      name: '001_baseline.sql',
      path: path.join(
        repositoryRoot,
        'database-design',
        'sql',
        '404notfound_postgresql.sql',
      ),
    },
    ...localFiles,
  ];
}

function checksum(sql) {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

export async function runMigrations(database) {
  await database.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name varchar(255) PRIMARY KEY,
      checksum char(64) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = [];
  for (const migration of await migrationFiles()) {
    const sql = await readFile(migration.path, 'utf8');
    const expectedChecksum = checksum(sql);
    const existing = await database.query(
      'SELECT checksum FROM schema_migrations WHERE name = $1',
      [migration.name],
    );

    if (existing.rows.length > 0) {
      if (existing.rows[0].checksum.trim() !== expectedChecksum) {
        throw new Error(`Migration checksum mismatch: ${migration.name}`);
      }
      continue;
    }

    await withTransaction(database, async (transaction) => {
      await executeSqlScript(transaction, sql);
      await transaction.query(
        'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
        [migration.name, expectedChecksum],
      );
    });
    applied.push(migration.name);
  }

  return applied;
}
