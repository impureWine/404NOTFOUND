import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';

import { ConflictError, NotFoundError } from '../../src/domain/errors.js';
import { RecordRepository } from '../../src/repositories/record-repository.js';
import { createTestDatabase, seedScope } from '../helpers/database.js';

const cipher = (value) => Buffer.from(`synthetic:${value}`, 'utf8');

function conversationInput(scope, overrides = {}) {
  return {
    ...scope,
    requestId: randomUUID(),
    kind: 'CONVERSATION',
    titleCiphertext: cipher('title'),
    titleKeyVersion: 1,
    details: {
      messages: [
        { role: 'USER', contentCiphertext: cipher('message'), cipherKeyVersion: 1 },
      ],
    },
    ...overrides,
  };
}

test('records are isolated by both account and entry point', async () => {
  const database = await createTestDatabase();
  try {
    const scopeA = await seedScope(database, 'a');
    const scopeB = await seedScope(database, 'b');
    const otherEntry = await database.query(
      "INSERT INTO entry_points (code) VALUES ('DESKTOP_A') RETURNING id",
    );
    const repository = new RecordRepository(database);
    const created = await repository.create(conversationInput(scopeA));

    assert.equal((await repository.list(scopeA)).length, 1);
    assert.equal((await repository.list(scopeB)).length, 0);
    assert.equal((await repository.list({
      accountId: scopeA.accountId,
      entryPointId: otherEntry.rows[0].id,
    })).length, 0);

    await assert.rejects(
      repository.get({ ...scopeB, recordId: created.id }),
      NotFoundError,
    );
    await assert.rejects(
      repository.get({
        accountId: scopeA.accountId,
        entryPointId: otherEntry.rows[0].id,
        recordId: created.id,
      }),
      NotFoundError,
    );
  } finally {
    await database.close();
  }
});

test('same idempotency key returns the original record and rejects changed payload', async () => {
  const database = await createTestDatabase();
  try {
    const scope = await seedScope(database, 'idem');
    const repository = new RecordRepository(database);
    const input = conversationInput(scope);
    const first = await repository.create(input);
    const retry = await repository.create(input);

    assert.equal(retry.id, first.id);
    assert.equal(retry.idempotent, true);

    await assert.rejects(
      repository.create({
        ...input,
        details: {
          messages: [
            { role: 'USER', contentCiphertext: cipher('changed'), cipherKeyVersion: 1 },
          ],
        },
      }),
      ConflictError,
    );
  } finally {
    await database.close();
  }
});

test('clear enforces version and scope, hides the record, and creates deletion outbox state', async () => {
  const database = await createTestDatabase();
  try {
    const scopeA = await seedScope(database, 'clear_a');
    const scopeB = await seedScope(database, 'clear_b');
    const repository = new RecordRepository(database);
    const created = await repository.create(conversationInput(scopeA));

    await assert.rejects(
      repository.clear({
        ...scopeB,
        recordId: created.id,
        requestId: randomUUID(),
        expectedVersion: created.version,
      }),
      NotFoundError,
    );
    await assert.rejects(
      repository.clear({
        ...scopeA,
        recordId: created.id,
        requestId: randomUUID(),
        expectedVersion: created.version + 1,
      }),
      ConflictError,
    );

    const requestId = randomUUID();
    const cleared = await repository.clear({
      ...scopeA,
      recordId: created.id,
      requestId,
      expectedVersion: created.version,
    });
    assert.equal(cleared.cleared, true);
    assert.equal((await repository.list(scopeA)).length, 0);
    await assert.rejects(repository.get({ ...scopeA, recordId: created.id }), NotFoundError);

    const state = await database.query(
      `
        SELECT
          (SELECT count(*)::int FROM deletion_jobs) AS jobs,
          (SELECT count(*)::int FROM deletion_targets) AS targets,
          (SELECT count(*)::int FROM deletion_outbox) AS outbox
      `,
    );
    assert.deepEqual(state.rows[0], { jobs: 1, targets: 1, outbox: 1 });

    const retry = await repository.clear({
      ...scopeA,
      recordId: created.id,
      requestId,
      expectedVersion: created.version,
    });
    assert.equal(retry.idempotent, true);
  } finally {
    await database.close();
  }
});

test('record type details are written in the same transaction', async () => {
  const database = await createTestDatabase();
  try {
    const scope = await seedScope(database, 'types');
    const repository = new RecordRepository(database);
    const emotion = await repository.create({
      ...scope,
      requestId: randomUUID(),
      kind: 'EMOTION',
      titleCiphertext: null,
      titleKeyVersion: null,
      details: {
        recordDate: '2026-10-23',
        emotionCodes: ['ANXIOUS', 'TIRED'],
        intensity: 3,
        timezoneName: 'Asia/Shanghai',
        eventCiphertext: cipher('event'),
        cipherKeyVersion: 1,
      },
    });
    const rows = await database.query(
      'SELECT intensity, timezone_name FROM emotion_records WHERE saved_record_id = $1',
      [emotion.id],
    );
    assert.deepEqual(rows.rows[0], { intensity: 3, timezone_name: 'Asia/Shanghai' });
  } finally {
    await database.close();
  }
});
