import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PGlite } from '@electric-sql/pglite';

import { runMigrations } from '../../src/db/migration-runner.js';
import { RecordRepository } from '../../src/repositories/record-repository.js';
import { WikipediaSearchProvider } from '../../src/search/wikipedia-search-provider.js';

const database = new PGlite();
const syntheticCiphertext = (value) => Buffer.from(`synthetic:${value}`, 'utf8');

try {
  const appliedMigrations = await runMigrations(database);
  const migrationRows = await database.query(
    'SELECT name FROM schema_migrations ORDER BY name',
  );

  const schemaRows = await database.query(`
    SELECT table_name, column_name, data_type, udt_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (
        'entry_points', 'user_accounts', 'login_sessions', 'saved_records',
        'saved_messages', 'saved_queries', 'sources', 'claims', 'evidence_links'
      )
    ORDER BY table_name, ordinal_position
  `);
  const constraintRows = await database.query(`
    SELECT conrelid::regclass::text AS table_name,
           conname,
           contype,
           pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid::regclass::text IN (
      'entry_points', 'user_accounts', 'login_sessions', 'saved_records',
      'saved_messages', 'saved_queries', 'sources', 'claims', 'evidence_links'
    )
    ORDER BY table_name, conname
  `);

  const entryA = await database.query(
    "INSERT INTO entry_points (code) VALUES ('BETA_DAY1_WEB_A') RETURNING id",
  );
  const entryB = await database.query(
    "INSERT INTO entry_points (code) VALUES ('BETA_DAY1_WEB_B') RETURNING id",
  );
  const accountA = await database.query(`
    INSERT INTO user_accounts (login_identifier, login_identifier_normalized)
    VALUES ('beta_day1_a', 'beta_day1_a')
    RETURNING id
  `);
  const accountB = await database.query(`
    INSERT INTO user_accounts (login_identifier, login_identifier_normalized)
    VALUES ('beta_day1_b', 'beta_day1_b')
    RETURNING id
  `);

  const scopeA = {
    accountId: accountA.rows[0].id,
    entryPointId: entryA.rows[0].id,
  };
  const scopeB = {
    accountId: accountB.rows[0].id,
    entryPointId: entryB.rows[0].id,
  };
  const scopeAOtherEntry = {
    accountId: accountA.rows[0].id,
    entryPointId: entryB.rows[0].id,
  };
  const repository = new RecordRepository(database);
  const recordA = await repository.create({
    ...scopeA,
    requestId: randomUUID(),
    kind: 'CONVERSATION',
    titleCiphertext: null,
    titleKeyVersion: null,
    details: {
      messages: [
        {
          role: 'USER',
          contentCiphertext: syntheticCiphertext('beta-day1-a'),
          cipherKeyVersion: 1,
        },
      ],
    },
  });
  const recordB = await repository.create({
    ...scopeB,
    requestId: randomUUID(),
    kind: 'CONVERSATION',
    titleCiphertext: null,
    titleKeyVersion: null,
    details: {
      messages: [
        {
          role: 'USER',
          contentCiphertext: syntheticCiphertext('beta-day1-b'),
          cipherKeyVersion: 1,
        },
      ],
    },
  });
  const recordAOtherEntry = await repository.create({
    ...scopeAOtherEntry,
    requestId: randomUUID(),
    kind: 'CONVERSATION',
    titleCiphertext: null,
    titleKeyVersion: null,
    details: {
      messages: [
        {
          role: 'USER',
          contentCiphertext: syntheticCiphertext('beta-day1-a-other-entry'),
          cipherKeyVersion: 1,
        },
      ],
    },
  });

  const listA = await repository.list(scopeA);
  const detailA = await repository.get({ ...scopeA, recordId: recordA.id });
  const listB = await repository.list(scopeB);
  const listAOtherEntry = await repository.list(scopeAOtherEntry);
  let crossAccountRead = 'unexpectedly allowed';
  try {
    await repository.get({ ...scopeA, recordId: recordB.id });
  } catch (error) {
    crossAccountRead = error.constructor.name;
  }
  let crossEntryRead = 'unexpectedly allowed';
  try {
    await repository.get({ ...scopeA, recordId: recordAOtherEntry.id });
  } catch (error) {
    crossEntryRead = error.constructor.name;
  }
  assert.equal(listA.items.length, 1);
  assert.equal(listB.items.length, 1);
  assert.equal(listAOtherEntry.items.length, 1);
  assert.equal(detailA.details.messages.length, 1);
  assert.equal(crossAccountRead, 'NotFoundError');
  assert.equal(crossEntryRead, 'NotFoundError');

  let providerRequest;
  const provider = new WikipediaSearchProvider({
    language: 'zh',
    timeoutMs: 5000,
    fetchImplementation: async (url) => {
      providerRequest = String(url);
      return new Response(JSON.stringify({ query: { search: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  const syntheticSearch = await provider.search({ question: 'Beta Day1 contract', limit: 5 });

  console.log(JSON.stringify({
    status: 'PASS',
    migrations: {
      appliedOnCleanDatabase: appliedMigrations,
      recorded: migrationRows.rows.map((row) => row.name),
    },
    schema: {
      columnCount: schemaRows.rows.length,
      constraintCount: constraintRows.rows.length,
      keyTables: [...new Set(schemaRows.rows.map((row) => row.table_name))],
    },
    recordAccess: {
      accountAListCount: listA.items.length,
      accountBListCount: listB.items.length,
      accountAOtherEntryListCount: listAOtherEntry.items.length,
      accountADetailMessageCount: detailA.details.messages.length,
      crossAccountRead,
      crossEntryRead,
    },
    searchContract: {
      provider: 'WikipediaSearchProvider',
      requestUrl: providerRequest,
      syntheticResponseState: syntheticSearch.searchState,
      syntheticResponseSourceCount: syntheticSearch.sources.length,
      realNetwork: false,
    },
  }, null, 2));
} finally {
  await database.close();
}
