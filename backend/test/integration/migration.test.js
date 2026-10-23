import assert from 'node:assert/strict';
import test from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { runMigrations } from '../../src/db/migration-runner.js';

test('baseline and support migrations execute once on a clean database', async () => {
  const database = new PGlite();
  try {
    assert.deepEqual(await runMigrations(database), [
      '001_baseline.sql',
      '002_data_service_support.sql',
    ]);
    assert.deepEqual(await runMigrations(database), []);

    const migrations = await database.query(
      'SELECT name FROM schema_migrations ORDER BY name',
    );
    assert.deepEqual(migrations.rows.map((row) => row.name), [
      '001_baseline.sql',
      '002_data_service_support.sql',
    ]);

    const tables = await database.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    const names = new Set(tables.rows.map((row) => row.table_name));
    assert.ok(names.has('saved_records'));
    assert.ok(names.has('idempotency_keys'));
    assert.ok(names.has('evidence_links'));
  } finally {
    await database.close();
  }
});

test('database constraints reject duplicate normalized login identifiers', async () => {
  const database = new PGlite();
  try {
    await runMigrations(database);
    await database.query(
      `
        INSERT INTO user_accounts (login_identifier, login_identifier_normalized)
        VALUES ('Example', 'example')
      `,
    );
    await assert.rejects(
      database.query(
        `
          INSERT INTO user_accounts (login_identifier, login_identifier_normalized)
          VALUES ('EXAMPLE', 'example')
        `,
      ),
      /unique|duplicate/i,
    );
  } finally {
    await database.close();
  }
});
