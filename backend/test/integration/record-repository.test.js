import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';

import { ConflictError, InvalidInputError, NotFoundError } from '../../src/domain/errors.js';
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

    assert.equal((await repository.list(scopeA)).items.length, 1);
    assert.equal((await repository.list(scopeB)).items.length, 0);
    assert.equal((await repository.list({
      accountId: scopeA.accountId,
      entryPointId: otherEntry.rows[0].id,
    })).items.length, 0);

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
      repository.issueClearConfirmation({
        ...scopeB,
        recordId: created.id,
        requestId: randomUUID(),
        expectedVersion: created.version,
      }),
      NotFoundError,
    );
    await assert.rejects(
      repository.issueClearConfirmation({
        ...scopeA,
        recordId: created.id,
        requestId: randomUUID(),
        expectedVersion: created.version + 1,
      }),
      ConflictError,
    );

    const confirmationRequestId = randomUUID();
    const confirmation = await repository.issueClearConfirmation({
      ...scopeA,
      recordId: created.id,
      requestId: confirmationRequestId,
      expectedVersion: created.version,
    });
    assert.equal(confirmation.kind, 'CONVERSATION');
    const repeatedConfirmation = await repository.issueClearConfirmation({
      ...scopeA,
      recordId: created.id,
      requestId: confirmationRequestId,
      expectedVersion: created.version,
    });
    assert.equal(repeatedConfirmation.kind, 'CONVERSATION');
    const requestId = randomUUID();
    const cleared = await repository.clear({
      ...scopeA,
      recordId: created.id,
      requestId,
      expectedVersion: created.version,
      confirmationId: confirmation.confirmationId,
      confirmed: true,
    });
    assert.equal(cleared.cleared, true);
    assert.equal((await repository.list(scopeA)).items.length, 0);
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
      confirmationId: confirmation.confirmationId,
      confirmed: true,
    });
    assert.equal(retry.idempotent, true);

    const payloadRows = await database.query(
      'SELECT count(*)::int AS count FROM saved_messages WHERE saved_record_id = $1',
      [created.id],
    );
    assert.equal(payloadRows.rows[0].count, 0);
    const consumed = await database.query(
      'SELECT consumed_at IS NOT NULL AS consumed FROM record_clear_confirmations WHERE id = $1',
      [confirmation.confirmationId],
    );
    assert.equal(consumed.rows[0].consumed, true);
  } finally {
    await database.close();
  }
});

test('record cursors are opaque and bound to account, entry, and kind', async () => {
  const database = await createTestDatabase();
  try {
    const scopeA = await seedScope(database, 'cursor_a');
    const scopeB = await seedScope(database, 'cursor_b');
    const repository = new RecordRepository(database);
    await repository.create(conversationInput(scopeA));
    await repository.create(conversationInput(scopeA));

    const firstPage = await repository.list({ ...scopeA, kind: 'CONVERSATION', limit: 1 });
    assert.equal(firstPage.items.length, 1);
    assert.ok(firstPage.nextCursor);

    const secondPage = await repository.list({
      ...scopeA,
      kind: 'CONVERSATION',
      limit: 1,
      cursor: firstPage.nextCursor,
    });
    assert.equal(secondPage.items.length, 1);
    assert.notEqual(secondPage.items[0].id, firstPage.items[0].id);

    await assert.rejects(
      repository.list({ ...scopeB, kind: 'CONVERSATION', cursor: firstPage.nextCursor }),
      InvalidInputError,
    );
    await assert.rejects(
      repository.list({
        ...scopeA,
        kind: 'EMOTION',
        cursor: firstPage.nextCursor,
      }),
      InvalidInputError,
    );
  } finally {
    await database.close();
  }
});

test('clear confirmation expires after its two-minute window', async () => {
  const database = await createTestDatabase();
  try {
    const scope = await seedScope(database, 'confirmation');
    const repository = new RecordRepository(database);
    const created = await repository.create(conversationInput(scope));
    const confirmation = await repository.issueClearConfirmation({
      ...scope,
      recordId: created.id,
      requestId: randomUUID(),
      expectedVersion: created.version,
    });
    await database.query(
      `
        UPDATE record_clear_confirmations
        SET created_at = now() - interval '3 minutes',
            expires_at = now() - interval '1 minute'
        WHERE id = $1
      `,
      [confirmation.confirmationId],
    );
    await assert.rejects(
      repository.clear({
        ...scope,
        recordId: created.id,
        requestId: randomUUID(),
        expectedVersion: created.version,
        confirmationId: confirmation.confirmationId,
        confirmed: true,
      }),
      ConflictError,
    );
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
