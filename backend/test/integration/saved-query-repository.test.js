import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';

import { InvalidInputError, NotFoundError } from '../../src/domain/errors.js';
import { SavedQueryRepository, persistentStatus } from '../../src/repositories/saved-query-repository.js';
import { createTestDatabase, seedScope } from '../helpers/database.js';

const cipher = (value) => Buffer.from(`synthetic:${value}`, 'utf8');

function queryInput(scope, overrides = {}) {
  return {
    ...scope,
    requestId: randomUUID(),
    searchRequestId: randomUUID(),
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

test('saved query keeps claim-to-source evidence and enforces account isolation', async () => {
  const database = await createTestDatabase();
  try {
    const scopeA = await seedScope(database, 'query_a');
    const scopeB = await seedScope(database, 'query_b');
    const repository = new SavedQueryRepository(database);
    const saved = await repository.save(queryInput(scopeA));

    assert.equal(saved.status, 'SUCCESS');
    assert.equal(saved.sourceCount, 1);
    assert.equal(saved.claimCount, 1);

    const loaded = await repository.get({ ...scopeA, recordId: saved.id });
    assert.equal(loaded.evidence.length, 1);
    assert.equal(loaded.evidence[0].source.url, 'https://example.org/facts');
    assert.equal(loaded.evidence[0].relation, 'SUPPORTS');

    await assert.rejects(
      repository.get({ ...scopeB, recordId: saved.id }),
      NotFoundError,
    );
  } finally {
    await database.close();
  }
});

test('saved query rejects evidence that is not part of the supplied sources', async () => {
  const database = await createTestDatabase();
  try {
    const scope = await seedScope(database, 'query_invalid');
    const repository = new SavedQueryRepository(database);
    const input = queryInput(scope);
    input.claims[0].evidence[0].sourceUrl = 'https://other.example.org/facts';
    await assert.rejects(repository.save(input), InvalidInputError);
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
