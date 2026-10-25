import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';

import { ConflictError, InvalidInputError, NotFoundError } from '../../src/domain/errors.js';
import {
  SavedQueryRepository,
  persistentStatus,
} from '../../src/repositories/saved-query-repository.js';
import { createTestDatabase, seedScope } from '../helpers/database.js';

const cipher = (value) => Buffer.from(`synthetic:${value}`, 'utf8');

function completedResult(scope, searchRequestId, overrides = {}) {
  return {
    ...scope,
    searchRequestId,
    status: 'completed',
    searchState: 'SUCCESS',
    rawQueryCiphertext: cipher('raw query'),
    normalizedQueryCiphertext: cipher('normalized query'),
    cipherKeyVersion: 1,
    partial: false,
    hasConflict: false,
    uncertaintyNote: null,
    sources: [
      {
        url: 'https://example.org/facts',
        title: 'Synthetic source',
        publisher: 'Example',
        sourceTier: 'S2',
        quality: 'CURRENT',
        publishedAt: null,
        retrievedAt: '2026-10-23T08:00:00.000Z',
        verificationState: 'VERIFIED',
        contentFingerprint: cipher('fingerprint'),
      },
    ],
    claims: [
      {
        claimTextCiphertext: cipher('claim'),
        cipherKeyVersion: 1,
        status: 'SUPPORTED',
        evidence: [
          { sourceUrl: 'https://example.org/facts', relation: 'SUPPORTS' },
        ],
      },
    ],
    ...overrides,
  };
}

function repositoryWithResults(database, results) {
  return new SavedQueryRepository(database, {
    resolveCompletedSearch: async ({ searchRequestId }) => results.get(searchRequestId) ?? null,
  });
}

test('saved query copies server-owned completed search evidence and enforces isolation', async () => {
  const database = await createTestDatabase();
  try {
    const scopeA = await seedScope(database, 'query_a');
    const scopeB = await seedScope(database, 'query_b');
    const searchRequestId = randomUUID();
    const results = new Map([
      [searchRequestId, completedResult(scopeA, searchRequestId)],
    ]);
    const repository = repositoryWithResults(database, results);
    const saved = await repository.save({
      ...scopeA,
      requestId: randomUUID(),
      searchRequestId,
    });

    assert.equal(saved.status, 'SUCCESS');
    assert.equal(saved.sourceCount, 1);
    assert.equal(saved.claimCount, 1);

    const loaded = await repository.get({ ...scopeA, recordId: saved.id });
    assert.equal(loaded.evidence.length, 1);
    assert.equal(loaded.claims.length, 1);
    assert.deepEqual(Buffer.from(loaded.claims[0].claimTextCiphertext), cipher('claim'));
    assert.equal(loaded.claims[0].evidence[0].source.url, 'https://example.org/facts');
    assert.equal(loaded.evidence[0].source.url, 'https://example.org/facts');
    assert.equal(loaded.evidence[0].relation, 'SUPPORTS');

    await assert.rejects(
      repository.get({ ...scopeB, recordId: saved.id }),
      NotFoundError,
    );
    await assert.rejects(
      repository.save({
        ...scopeB,
        requestId: randomUUID(),
        searchRequestId,
      }),
      NotFoundError,
    );
  } finally {
    await database.close();
  }
});

test('saved query rejects client supplied evidence and invalid server evidence', async () => {
  const database = await createTestDatabase();
  try {
    const scope = await seedScope(database, 'query_invalid');
    const searchRequestId = randomUUID();
    const result = completedResult(scope, searchRequestId);
    result.claims[0].evidence[0].sourceUrl = 'https://other.example.org/facts';
    const repository = repositoryWithResults(database, new Map([[searchRequestId, result]]));

    await assert.rejects(
      repository.save({
        ...scope,
        requestId: randomUUID(),
        searchRequestId,
        sources: result.sources,
      }),
      InvalidInputError,
    );
    await assert.rejects(
      repository.save({ ...scope, requestId: randomUUID(), searchRequestId }),
      InvalidInputError,
    );

    const unsafeRequestId = randomUUID();
    const unsafe = completedResult(scope, unsafeRequestId);
    unsafe.sources[0].url = 'file:///synthetic/source';
    unsafe.claims[0].evidence[0].sourceUrl = unsafe.sources[0].url;
    const unsafeRepository = repositoryWithResults(
      database,
      new Map([[unsafeRequestId, unsafe]]),
    );
    await assert.rejects(
      unsafeRepository.save({
        ...scope,
        requestId: randomUUID(),
        searchRequestId: unsafeRequestId,
      }),
      InvalidInputError,
    );

    const duplicateRequestId = randomUUID();
    const duplicate = completedResult(scope, duplicateRequestId);
    duplicate.claims[0].evidence.push({
      sourceUrl: 'https://example.org:443/facts#duplicate',
      relation: 'CONTEXT',
    });
    const duplicateRepository = repositoryWithResults(
      database,
      new Map([[duplicateRequestId, duplicate]]),
    );
    await assert.rejects(
      duplicateRepository.save({
        ...scope,
        requestId: randomUUID(),
        searchRequestId: duplicateRequestId,
      }),
      InvalidInputError,
    );
  } finally {
    await database.close();
  }
});

test('empty or unfinished searches cannot be persisted as query history', async () => {
  const database = await createTestDatabase();
  try {
    const scope = await seedScope(database, 'query_empty');
    const emptyRequestId = randomUUID();
    const pendingRequestId = randomUUID();
    const results = new Map([
      [emptyRequestId, completedResult(scope, emptyRequestId, {
        searchState: 'EMPTY',
        sources: [],
        claims: [],
      })],
      [pendingRequestId, completedResult(scope, pendingRequestId, {
        status: 'pending',
        searchState: null,
        sources: [],
        claims: [],
      })],
    ]);
    const repository = repositoryWithResults(database, results);

    for (const searchRequestId of [emptyRequestId, pendingRequestId]) {
      await assert.rejects(
        repository.save({ ...scope, requestId: randomUUID(), searchRequestId }),
        ConflictError,
      );
    }
    const count = await database.query(
      "SELECT count(*)::int AS count FROM saved_records WHERE record_kind = 'QUERY'",
    );
    assert.equal(count.rows[0].count, 0);
  } finally {
    await database.close();
  }
});

test('persistent query status follows conflict, partial, stale, success priority', () => {
  const current = [{ quality: 'CURRENT' }];
  const stale = [{ quality: 'STALE' }];
  assert.equal(persistentStatus({ hasConflict: true, partial: true, sources: stale }), 'CONFLICTED');
  assert.equal(persistentStatus({ hasConflict: false, partial: true, sources: stale }), 'PARTIAL_SUCCESS');
  assert.equal(persistentStatus({ hasConflict: false, partial: false, sources: stale }), 'STALE_SOURCE');
  assert.equal(persistentStatus({ hasConflict: false, partial: false, sources: current }), 'SUCCESS');
});
