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
    const detail = await repository.get({ ...scopeA, recordId: created.id });

    assert.equal((await repository.list(scopeA)).items.length, 1);
    assert.deepEqual(Buffer.from(detail.titleCiphertext), cipher('title'));
    assert.equal(detail.titleKeyVersion, 1);
    assert.equal(detail.details.messages[0].role, 'USER');
    assert.equal(detail.details.messages[0].cipherKeyVersion, 1);
    assert.deepEqual(
      Buffer.from(detail.details.messages[0].contentCiphertext),
      cipher('message'),
    );
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

test('record update enforces scope, version, editable kind, and idempotency', async () => {
  const database = await createTestDatabase();
  try {
    const scopeA = await seedScope(database, 'update_a');
    const scopeB = await seedScope(database, 'update_b');
    const otherEntry = await database.query(
      "INSERT INTO entry_points (code) VALUES ('DESKTOP_UPDATE') RETURNING id",
    );
    const repository = new RecordRepository(database);
    const created = await repository.create({
      ...scopeA,
      requestId: randomUUID(),
      kind: 'EMOTION',
      titleCiphertext: cipher('emotion title'),
      titleKeyVersion: 1,
      details: {
        recordDate: '2026-10-24',
        emotionCodes: ['TIRED'],
        intensity: 2,
        timezoneName: 'Asia/Shanghai',
        eventCiphertext: null,
        cipherKeyVersion: null,
      },
    });
    const updateInput = {
      ...scopeA,
      recordId: created.id,
      requestId: randomUUID(),
      expectedVersion: created.version,
      titleCiphertext: cipher('updated title'),
      titleKeyVersion: 2,
      details: {
        recordDate: '2026-10-24',
        emotionCodes: ['CALM', 'FOCUSED'],
        intensity: 4,
        timezoneName: 'Asia/Shanghai',
        eventCiphertext: cipher('updated event'),
        cipherKeyVersion: 2,
      },
    };
    const updated = await repository.update(updateInput);
    assert.equal(updated.version, created.version + 1);
    const repeated = await repository.update(updateInput);
    assert.equal(repeated.idempotent, true);
    const detail = await repository.get({ ...scopeA, recordId: created.id });
    assert.deepEqual(Buffer.from(detail.titleCiphertext), cipher('updated title'));
    assert.deepEqual({
      ...detail.details,
      eventCiphertext: Buffer.from(detail.details.eventCiphertext),
    }, updateInput.details);

    const details = await database.query(
      `
        SELECT emotion_codes, intensity, cipher_key_version
        FROM emotion_records
        WHERE saved_record_id = $1
      `,
      [created.id],
    );
    assert.deepEqual(details.rows[0], {
      emotion_codes: ['CALM', 'FOCUSED'],
      intensity: 4,
      cipher_key_version: 2,
    });

    await assert.rejects(
      repository.update({
        ...updateInput,
        details: { ...updateInput.details, intensity: 5 },
      }),
      ConflictError,
    );
    await assert.rejects(
      repository.update({
        ...updateInput,
        ...scopeB,
        requestId: randomUUID(),
        expectedVersion: updated.version,
      }),
      NotFoundError,
    );
    await assert.rejects(
      repository.update({
        ...updateInput,
        entryPointId: otherEntry.rows[0].id,
        requestId: randomUUID(),
        expectedVersion: updated.version,
      }),
      NotFoundError,
    );
    await assert.rejects(
      repository.update({
        ...updateInput,
        requestId: randomUUID(),
      }),
      ConflictError,
    );

    const conversation = await repository.create(conversationInput(scopeA));
    await assert.rejects(
      repository.update({
        ...scopeA,
        recordId: conversation.id,
        requestId: randomUUID(),
        expectedVersion: conversation.version,
        titleCiphertext: null,
        titleKeyVersion: null,
        details: {},
      }),
      ConflictError,
    );
  } finally {
    await database.close();
  }
});

test('concurrent updates with the same expected version allow one winner only', async () => {
  const database = await createTestDatabase();
  try {
    const scope = await seedScope(database, 'update_race');
    const repository = new RecordRepository(database);
    const created = await repository.create({
      ...scope,
      requestId: randomUUID(),
      kind: 'EMOTION',
      titleCiphertext: cipher('initial title'),
      titleKeyVersion: 1,
      details: {
        recordDate: '2026-10-27',
        emotionCodes: ['CALM'],
        intensity: 2,
        timezoneName: 'Asia/Shanghai',
        eventCiphertext: null,
        cipherKeyVersion: null,
      },
    });
    const update = (label, intensity) => repository.update({
      ...scope,
      recordId: created.id,
      requestId: randomUUID(),
      expectedVersion: created.version,
      titleCiphertext: cipher(`${label} title`),
      titleKeyVersion: 2,
      details: {
        recordDate: '2026-10-27',
        emotionCodes: [label],
        intensity,
        timezoneName: 'Asia/Shanghai',
        eventCiphertext: cipher(`${label} event`),
        cipherKeyVersion: 2,
      },
    });

    const results = await Promise.allSettled([
      update('FOCUSED', 4),
      update('TIRED', 3),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0].reason instanceof ConflictError);

    const loaded = await repository.get({ ...scope, recordId: created.id });
    const expectedEmotionCode = Buffer.from(loaded.titleCiphertext).equals(
      cipher('FOCUSED title'),
    ) ? 'FOCUSED' : 'TIRED';
    assert.equal(loaded.version, created.version + 1);
    assert.deepEqual(loaded.details.emotionCodes, [expectedEmotionCode]);
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

test('failed record creation rolls back both the record and its idempotency claim', async () => {
  const database = await createTestDatabase();
  try {
    const scope = await seedScope(database, 'create_rollback');
    const repository = new RecordRepository(database);
    const requestId = randomUUID();
    await assert.rejects(
      repository.create({
        ...scope,
        requestId,
        kind: 'DEPOSIT',
        titleCiphertext: null,
        titleKeyVersion: null,
        details: {
          bodyCiphertext: cipher('deposit'),
          cipherKeyVersion: 1,
          reopenAt: '2020-01-01T00:00:00.000Z',
        },
      }),
      InvalidInputError,
    );
    const rolledBack = await database.query(
      `
        SELECT
          (SELECT count(*)::int FROM saved_records) AS records,
          (SELECT count(*)::int FROM idempotency_keys WHERE request_id = $1) AS keys
      `,
      [requestId],
    );
    assert.deepEqual(rolledBack.rows[0], { records: 0, keys: 0 });

    const retry = await repository.create({
      ...scope,
      requestId,
      kind: 'DEPOSIT',
      titleCiphertext: null,
      titleKeyVersion: null,
      details: {
        bodyCiphertext: cipher('deposit'),
        cipherKeyVersion: 1,
        reopenAt: '2099-01-01T00:00:00.000Z',
      },
    });
    assert.equal(retry.kind, 'DEPOSIT');
  } finally {
    await database.close();
  }
});

test('failed clear rolls back payload deletion, confirmation use, and outbox state', async () => {
  const database = await createTestDatabase();
  try {
    const scope = await seedScope(database, 'clear_rollback');
    const repository = new RecordRepository(database);
    const created = await repository.create(conversationInput(scope));
    const confirmation = await repository.issueClearConfirmation({
      ...scope,
      recordId: created.id,
      requestId: randomUUID(),
      expectedVersion: created.version,
    });
    const clearInput = {
      ...scope,
      recordId: created.id,
      requestId: randomUUID(),
      expectedVersion: created.version,
      confirmationId: confirmation.confirmationId,
      confirmed: true,
    };

    await database.exec(
      'ALTER TABLE deletion_outbox ADD CONSTRAINT ck_day4_force_rollback CHECK (false)',
    );
    await assert.rejects(repository.clear(clearInput));

    assert.equal((await repository.get({ ...scope, recordId: created.id })).id, created.id);
    const afterFailure = await database.query(
      `
        SELECT
          (SELECT count(*)::int FROM saved_messages WHERE saved_record_id = $1) AS messages,
          (SELECT count(*)::int FROM deletion_jobs) AS jobs,
          (SELECT count(*)::int FROM deletion_targets) AS targets,
          (SELECT count(*)::int FROM deletion_outbox) AS outbox,
          (SELECT count(*)::int FROM idempotency_keys WHERE request_id = $2) AS keys,
          (SELECT consumed_at IS NOT NULL FROM record_clear_confirmations WHERE id = $3) AS consumed
      `,
      [created.id, clearInput.requestId, confirmation.confirmationId],
    );
    assert.deepEqual(afterFailure.rows[0], {
      messages: 1,
      jobs: 0,
      targets: 0,
      outbox: 0,
      keys: 0,
      consumed: false,
    });

    await database.exec('ALTER TABLE deletion_outbox DROP CONSTRAINT ck_day4_force_rollback');
    const retry = await repository.clear(clearInput);
    assert.equal(retry.cleared, true);
    assert.equal(retry.idempotent, false);
  } finally {
    await database.close();
  }
});

test('explicit context selection enforces ownership, clearing, calendar, and deposit boundaries', async () => {
  const database = await createTestDatabase();
  try {
    const scopeA = await seedScope(database, 'context_a');
    const scopeB = await seedScope(database, 'context_b');
    const repository = new RecordRepository(database);
    const conversation = await repository.create(conversationInput(scopeA));
    const emotion = await repository.create({
      ...scopeA,
      requestId: randomUUID(),
      kind: 'EMOTION',
      titleCiphertext: null,
      titleKeyVersion: null,
      details: {
        recordDate: '2026-10-26',
        emotionCodes: ['CALM'],
        intensity: 3,
        timezoneName: 'Asia/Shanghai',
        eventCiphertext: null,
        cipherKeyVersion: null,
      },
    });
    const deposit = await repository.create({
      ...scopeA,
      requestId: randomUUID(),
      kind: 'DEPOSIT',
      titleCiphertext: null,
      titleKeyVersion: null,
      details: {
        bodyCiphertext: cipher('deposit'),
        cipherKeyVersion: 1,
        reopenAt: '2099-01-01T00:00:00.000Z',
      },
    });

    const selected = await repository.resolveExplicitContextSelection({
      ...scopeA,
      recordIds: [conversation.id],
    });
    assert.deepEqual(selected, {
      policy: 'EXPLICIT_SELECTION_ONLY',
      records: [{ id: conversation.id, kind: 'CONVERSATION', version: 1 }],
    });
    assert.equal(JSON.stringify(selected).includes('synthetic:'), false);

    await assert.rejects(
      repository.resolveExplicitContextSelection({ ...scopeB, recordIds: [conversation.id] }),
      NotFoundError,
    );
    await assert.rejects(
      repository.resolveExplicitContextSelection({ ...scopeA, recordIds: [emotion.id] }),
      ConflictError,
    );
    await assert.rejects(
      repository.resolveExplicitContextSelection({ ...scopeA, recordIds: [deposit.id] }),
      ConflictError,
    );

    const confirmation = await repository.issueClearConfirmation({
      ...scopeA,
      recordId: conversation.id,
      requestId: randomUUID(),
      expectedVersion: conversation.version,
    });
    await repository.clear({
      ...scopeA,
      recordId: conversation.id,
      requestId: randomUUID(),
      expectedVersion: conversation.version,
      confirmationId: confirmation.confirmationId,
      confirmed: true,
    });
    await assert.rejects(
      repository.resolveExplicitContextSelection({ ...scopeA, recordIds: [conversation.id] }),
      NotFoundError,
    );
  } finally {
    await database.close();
  }
});
