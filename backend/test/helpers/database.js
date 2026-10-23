import { PGlite } from '@electric-sql/pglite';

import { runMigrations } from '../../src/db/migration-runner.js';

export async function createTestDatabase() {
  const database = new PGlite();
  await runMigrations(database);
  return database;
}

export async function seedScope(database, suffix = 'a') {
  const entry = await database.query(
    `
      INSERT INTO entry_points (code)
      VALUES ($1)
      RETURNING id
    `,
    [`WEB_${suffix.toUpperCase()}`],
  );
  const account = await database.query(
    `
      INSERT INTO user_accounts (login_identifier, login_identifier_normalized)
      VALUES ($1, $2)
      RETURNING id
    `,
    [`user_${suffix}`, `user_${suffix}`],
  );
  return {
    accountId: account.rows[0].id,
    entryPointId: entry.rows[0].id,
  };
}
