import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import {
  depositActionSchema,
  depositPostponeSchema,
  editableRecordDetailsSchemas,
  explicitContextSelectionSchema,
  recordClearConfirmationSchema,
  recordClearSchema,
  recordCreateSchema,
  recordIdentitySchema,
  recordListSchema,
  recordUpdateSchema,
} from '../contracts/records.js';
import { nonZeroUuidSchema } from '../contracts/primitives.js';
import { ConflictError, InvalidInputError, NotFoundError } from '../domain/errors.js';
import { stableHash } from '../domain/stable-hash.js';
import { withTransaction } from '../db/database.js';
import { claimIdempotencyKey, completeIdempotencyKey } from './idempotency.js';

const cursorSecret = randomBytes(32);
const contextRestrictedKinds = Object.freeze({
  EMOTION: 'Calendar records require a purpose-specific action and cannot enter general AI context',
  DEPOSIT: 'Deposits cannot be expanded through the general AI context path',
});

function parse(schema, input) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new InvalidInputError('Invalid record input', parsed.error.flatten());
  }
  return parsed.data;
}

function mapRecord(row, idempotent = false) {
  return {
    id: row.id,
    kind: row.record_kind,
    titleCiphertext: row.title_ciphertext ?? null,
    titleKeyVersion: row.title_key_version ?? null,
    version: row.version_no,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    idempotent,
  };
}

async function getRecordDetails(database, recordId, kind) {
  let result;
  switch (kind) {
    case 'CONVERSATION':
      result = await database.query(
        `
          SELECT role, content_ciphertext, cipher_key_version
          FROM saved_messages
          WHERE saved_record_id = $1
          ORDER BY sequence_no
        `,
        [recordId],
      );
      if (result.rows.length === 0) throw new ConflictError('The record payload is missing');
      return {
        messages: result.rows.map((row) => ({
          role: row.role,
          contentCiphertext: row.content_ciphertext,
          cipherKeyVersion: row.cipher_key_version,
        })),
      };
    case 'EMOTION':
      result = await database.query(
        `
          SELECT to_char(record_date, 'YYYY-MM-DD') AS record_date,
                 emotion_codes, intensity, timezone_name,
                 event_ciphertext, cipher_key_version
          FROM emotion_records
          WHERE saved_record_id = $1
        `,
        [recordId],
      );
      if (result.rows.length === 0) throw new ConflictError('The record payload is missing');
      return {
        recordDate: result.rows[0].record_date,
        emotionCodes: result.rows[0].emotion_codes,
        intensity: result.rows[0].intensity,
        timezoneName: result.rows[0].timezone_name,
        eventCiphertext: result.rows[0].event_ciphertext,
        cipherKeyVersion: result.rows[0].cipher_key_version,
      };
    case 'WORRY_OBJECT':
      result = await database.query(
        `
          SELECT shape_code, body_ciphertext, cipher_key_version
          FROM worry_objects
          WHERE saved_record_id = $1
        `,
        [recordId],
      );
      if (result.rows.length === 0) throw new ConflictError('The record payload is missing');
      return {
        shapeCode: result.rows[0].shape_code,
        bodyCiphertext: result.rows[0].body_ciphertext,
        cipherKeyVersion: result.rows[0].cipher_key_version,
      };
    case 'REHEARSAL_DRAFT':
      result = await database.query(
        `
          SELECT scene_ciphertext, expressions_ciphertext, expression_count,
                 cipher_key_version
          FROM rehearsal_drafts
          WHERE saved_record_id = $1
        `,
        [recordId],
      );
      if (result.rows.length === 0) throw new ConflictError('The record payload is missing');
      return {
        sceneCiphertext: result.rows[0].scene_ciphertext,
        expressionsCiphertext: result.rows[0].expressions_ciphertext,
        expressionCount: result.rows[0].expression_count,
        cipherKeyVersion: result.rows[0].cipher_key_version,
      };
    default:
      return null;
  }
}

function encodeCursor(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', cursorSecret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function decodeCursor(token, scope) {
  try {
    const [body, signature, extra] = token.split('.');
    if (!body || !signature || extra) throw new Error('malformed cursor');
    const expected = createHmac('sha256', cursorSecret).update(body).digest();
    const supplied = Buffer.from(signature, 'base64url');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      throw new Error('invalid cursor signature');
    }
    const value = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (
      value.accountId !== scope.accountId
      || value.entryPointId !== scope.entryPointId
      || (value.kind ?? null) !== (scope.kind ?? null)
      || (value.from ?? null) !== (scope.from ?? null)
      || (value.to ?? null) !== (scope.to ?? null)
      || Number.isNaN(Date.parse(value.createdAt))
      || !nonZeroUuidSchema.safeParse(value.id).success
    ) {
      throw new Error('cursor scope mismatch');
    }
    return value;
  } catch {
    throw new InvalidInputError('cursor is invalid for the requested record scope');
  }
}

async function deleteRecordPayload(transaction, recordId) {
  await transaction.query('DELETE FROM room_objects WHERE worry_object_id = $1', [recordId]);
  await transaction.query('DELETE FROM consent_grants WHERE resource_id = $1', [recordId]);
  await transaction.query('DELETE FROM saved_messages WHERE saved_record_id = $1', [recordId]);
  await transaction.query('DELETE FROM emotion_records WHERE saved_record_id = $1', [recordId]);
  await transaction.query('DELETE FROM worry_objects WHERE saved_record_id = $1', [recordId]);
  await transaction.query('DELETE FROM rehearsal_drafts WHERE saved_record_id = $1', [recordId]);
  await transaction.query('DELETE FROM worry_deposits WHERE saved_record_id = $1', [recordId]);
  await transaction.query('DELETE FROM saved_queries WHERE saved_record_id = $1', [recordId]);
}

async function insertRecordDetails(transaction, recordId, kind, details) {
  switch (kind) {
    case 'CONVERSATION':
      for (const [index, message] of details.messages.entries()) {
        await transaction.query(
          `
            INSERT INTO saved_messages (
              saved_record_id,
              sequence_no,
              role,
              content_ciphertext,
              cipher_key_version
            )
            VALUES ($1, $2, $3, $4, $5)
          `,
          [
            recordId,
            index + 1,
            message.role,
            message.contentCiphertext,
            message.cipherKeyVersion,
          ],
        );
      }
      break;
    case 'EMOTION':
      await transaction.query(
        `
          INSERT INTO emotion_records (
            saved_record_id,
            record_date,
            emotion_codes,
            intensity,
            timezone_name,
            event_ciphertext,
            cipher_key_version
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          recordId,
          details.recordDate,
          details.emotionCodes,
          details.intensity,
          details.timezoneName,
          details.eventCiphertext,
          details.cipherKeyVersion,
        ],
      );
      break;
    case 'WORRY_OBJECT':
      await transaction.query(
        `
          INSERT INTO worry_objects (
            saved_record_id,
            shape_code,
            body_ciphertext,
            cipher_key_version
          )
          VALUES ($1, $2, $3, $4)
        `,
        [recordId, details.shapeCode, details.bodyCiphertext, details.cipherKeyVersion],
      );
      break;
    case 'REHEARSAL_DRAFT':
      await transaction.query(
        `
          INSERT INTO rehearsal_drafts (
            saved_record_id,
            scene_ciphertext,
            expressions_ciphertext,
            expression_count,
            cipher_key_version
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [
          recordId,
          details.sceneCiphertext,
          details.expressionsCiphertext,
          details.expressionCount,
          details.cipherKeyVersion,
        ],
      );
      break;
    case 'DEPOSIT':
      const deposit = await transaction.query(
        `
          INSERT INTO worry_deposits (
            saved_record_id,
            body_ciphertext,
            cipher_key_version,
            reopen_at
          )
          SELECT $1, $2, $3, $4
          WHERE $4::timestamptz > now()
          RETURNING saved_record_id
        `,
        [recordId, details.bodyCiphertext, details.cipherKeyVersion, details.reopenAt],
      );
      if (deposit.rows.length === 0) {
        throw new InvalidInputError('reopenAt must be in the future');
      }
      break;
    default:
      throw new InvalidInputError(`Unsupported record kind: ${kind}`);
  }
}

async function updateRecordDetails(transaction, recordId, kind, details) {
  let result;
  switch (kind) {
    case 'EMOTION':
      result = await transaction.query(
        `
          UPDATE emotion_records
          SET record_date = $2,
              emotion_codes = $3,
              intensity = $4,
              timezone_name = $5,
              event_ciphertext = $6,
              cipher_key_version = $7
          WHERE saved_record_id = $1
          RETURNING saved_record_id
        `,
        [
          recordId,
          details.recordDate,
          details.emotionCodes,
          details.intensity,
          details.timezoneName,
          details.eventCiphertext,
          details.cipherKeyVersion,
        ],
      );
      break;
    case 'WORRY_OBJECT':
      result = await transaction.query(
        `
          UPDATE worry_objects
          SET shape_code = $2,
              body_ciphertext = $3,
              cipher_key_version = $4
          WHERE saved_record_id = $1
          RETURNING saved_record_id
        `,
        [recordId, details.shapeCode, details.bodyCiphertext, details.cipherKeyVersion],
      );
      break;
    case 'REHEARSAL_DRAFT':
      result = await transaction.query(
        `
          UPDATE rehearsal_drafts
          SET scene_ciphertext = $2,
              expressions_ciphertext = $3,
              expression_count = $4,
              cipher_key_version = $5
          WHERE saved_record_id = $1
          RETURNING saved_record_id
        `,
        [
          recordId,
          details.sceneCiphertext,
          details.expressionsCiphertext,
          details.expressionCount,
          details.cipherKeyVersion,
        ],
      );
      break;
    default:
      throw new ConflictError(`${kind} records are read-only through the general update operation`);
  }
  if (result.rows.length === 0) {
    throw new ConflictError('The record payload is missing');
  }
}

export class RecordRepository {
  constructor(database) {
    this.database = database;
  }

  async create(input, requestPayloadHash = null) {
    const value = parse(recordCreateSchema, input);
    const payloadHash = requestPayloadHash ?? stableHash({
      kind: value.kind,
      titleCiphertext: value.titleCiphertext,
      titleKeyVersion: value.titleKeyVersion,
      details: value.details,
    });

    return withTransaction(this.database, async (transaction) => {
      const idempotency = await claimIdempotencyKey(transaction, {
        accountId: value.accountId,
        entryPointId: value.entryPointId,
        operation: 'CREATE_RECORD',
        requestId: value.requestId,
        payloadHash,
      });

      if (idempotency.existing) {
        const existing = await transaction.query(
          `
            SELECT id, record_kind, title_ciphertext, title_key_version,
                   version_no, created_at, updated_at
            FROM saved_records
            WHERE id = $1
              AND account_id = $2
              AND entry_point_id = $3
              AND deleted_at IS NULL
          `,
          [idempotency.resultResourceId, value.accountId, value.entryPointId],
        );
        if (existing.rows.length === 0) {
          throw new ConflictError('The idempotent result is no longer available');
        }
        return mapRecord(existing.rows[0], true);
      }

      const created = await transaction.query(
        `
          INSERT INTO saved_records (
            account_id,
            entry_point_id,
            record_kind,
            title_ciphertext,
            title_key_version,
            request_id
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, record_kind, title_ciphertext, title_key_version,
                    version_no, created_at, updated_at
        `,
        [
          value.accountId,
          value.entryPointId,
          value.kind,
          value.titleCiphertext,
          value.titleKeyVersion,
          value.requestId,
        ],
      );
      const row = created.rows[0];
      await insertRecordDetails(transaction, row.id, value.kind, value.details);
      await completeIdempotencyKey(transaction, {
        keyId: idempotency.id,
        resourceId: row.id,
        version: row.version_no,
      });
      return mapRecord(row);
    });
  }

  async list(input) {
    const value = parse(recordListSchema, input);
    const cursor = value.cursor ? decodeCursor(value.cursor, value) : null;

    const result = await this.database.query(
      `
        SELECT id, record_kind, title_ciphertext, title_key_version,
               version_no, created_at, updated_at
        FROM saved_records
        WHERE account_id = $1
          AND entry_point_id = $2
          AND deleted_at IS NULL
          AND ($3::text IS NULL OR record_kind::text = $3)
          AND (
            $4::timestamptz IS NULL
            OR created_at < $4
            OR (created_at = $4 AND id < $5::uuid)
          )
          AND ($7::date IS NULL OR EXISTS (
            SELECT 1 FROM emotion_records e WHERE e.saved_record_id = saved_records.id
              AND e.record_date BETWEEN $7::date AND $8::date
          ))
        ORDER BY created_at DESC, id DESC
        LIMIT $6
      `,
      [
        value.accountId,
        value.entryPointId,
        value.kind ?? null,
        cursor?.createdAt ?? null,
        cursor?.id ?? null,
        value.limit + 1,
        value.from ?? null,
        value.to ?? null,
      ],
    );
    const hasMore = result.rows.length > value.limit;
    const rows = hasMore ? result.rows.slice(0, value.limit) : result.rows;
    const items = rows.map((row) => mapRecord(row));
    const last = rows.at(-1);
    return {
      items,
      nextCursor: hasMore ? encodeCursor({
        accountId: value.accountId,
        entryPointId: value.entryPointId,
        kind: value.kind ?? null,
        from: value.from ?? null,
        to: value.to ?? null,
        createdAt: new Date(last.created_at).toISOString(),
        id: last.id,
      }) : null,
    };
  }

  async get(input) {
    const value = parse(recordIdentitySchema, input);
    const result = await this.database.query(
      `
        SELECT id, record_kind, title_ciphertext, title_key_version,
               version_no, created_at, updated_at
        FROM saved_records
        WHERE id = $1
          AND account_id = $2
          AND entry_point_id = $3
          AND deleted_at IS NULL
      `,
      [value.recordId, value.accountId, value.entryPointId],
    );
    if (result.rows.length === 0) throw new NotFoundError();
    const row = result.rows[0];
    const details = await getRecordDetails(this.database, row.id, row.record_kind);
    return { ...mapRecord(row), details };
  }

  async resolveExplicitContextSelection(input) {
    const value = parse(explicitContextSelectionSchema, input);
    const result = await this.database.query(
      `
        SELECT id, record_kind, version_no
        FROM saved_records
        WHERE account_id = $1
          AND entry_point_id = $2
          AND deleted_at IS NULL
          AND id = ANY($3::uuid[])
      `,
      [value.accountId, value.entryPointId, value.recordIds],
    );
    if (result.rows.length !== value.recordIds.length) throw new NotFoundError();

    const recordsById = new Map(result.rows.map((row) => [row.id, row]));
    const records = value.recordIds.map((recordId) => recordsById.get(recordId));
    for (const record of records) {
      const restriction = contextRestrictedKinds[record.record_kind];
      if (restriction) throw new ConflictError(restriction);
    }

    return {
      policy: 'EXPLICIT_SELECTION_ONLY',
      records: records.map((record) => ({
        id: record.id,
        kind: record.record_kind,
        version: record.version_no,
      })),
    };
  }

  async update(input, canonicalPayloadHash = null) {
    const value = parse(recordUpdateSchema, input);
    const payloadHash = canonicalPayloadHash ?? stableHash({
      recordId: value.recordId,
      expectedVersion: value.expectedVersion,
      titleCiphertext: value.titleCiphertext,
      titleKeyVersion: value.titleKeyVersion,
      details: value.details,
    });
    return withTransaction(this.database, async (transaction) => {
      const idempotency = await claimIdempotencyKey(transaction, {
        accountId: value.accountId,
        entryPointId: value.entryPointId,
        operation: 'UPDATE_RECORD',
        requestId: value.requestId,
        payloadHash,
      });
      if (idempotency.existing) {
        const existing = await transaction.query(
          `
            SELECT id, record_kind, title_ciphertext, title_key_version,
                   version_no, created_at, updated_at
            FROM saved_records
            WHERE id = $1
              AND account_id = $2
              AND entry_point_id = $3
              AND deleted_at IS NULL
          `,
          [idempotency.resultResourceId, value.accountId, value.entryPointId],
        );
        if (existing.rows.length === 0) {
          throw new ConflictError('The idempotent record result is no longer available');
        }
        if (existing.rows[0].version_no !== idempotency.resultVersion) {
          throw new ConflictError('The idempotent record result is no longer current');
        }
        return mapRecord(existing.rows[0], true);
      }

      const current = await transaction.query(
        `
          SELECT record_kind, version_no
          FROM saved_records
          WHERE id = $1
            AND account_id = $2
            AND entry_point_id = $3
            AND deleted_at IS NULL
          FOR UPDATE
        `,
        [value.recordId, value.accountId, value.entryPointId],
      );
      if (current.rows.length === 0) throw new NotFoundError();
      const row = current.rows[0];
      if (row.version_no !== value.expectedVersion) {
        throw new ConflictError('expectedVersion does not match the current record version');
      }
      const detailsSchema = editableRecordDetailsSchemas[row.record_kind];
      if (!detailsSchema) {
        throw new ConflictError(`${row.record_kind} records cannot be updated through PATCH`);
      }
      const details = parse(detailsSchema, value.details);
      await updateRecordDetails(transaction, value.recordId, row.record_kind, details);

      const updated = await transaction.query(
        `
          UPDATE saved_records
          SET title_ciphertext = $4,
              title_key_version = $5,
              version_no = version_no + 1,
              updated_at = now()
          WHERE id = $1
            AND account_id = $2
            AND entry_point_id = $3
            AND version_no = $6
            AND deleted_at IS NULL
          RETURNING id, record_kind, title_ciphertext, title_key_version,
                    version_no, created_at, updated_at
        `,
        [
          value.recordId,
          value.accountId,
          value.entryPointId,
          value.titleCiphertext,
          value.titleKeyVersion,
          value.expectedVersion,
        ],
      );
      if (updated.rows.length === 0) {
        throw new ConflictError('expectedVersion does not match the current record version');
      }
      await completeIdempotencyKey(transaction, {
        keyId: idempotency.id,
        resourceId: value.recordId,
        version: updated.rows[0].version_no,
      });
      return mapRecord(updated.rows[0]);
    });
  }

  async issueClearConfirmation(input) {
    const value = parse(recordClearConfirmationSchema, input);
    return withTransaction(this.database, async (transaction) => {
      const existing = await transaction.query(
        `
          SELECT
            c.id,
            c.record_id,
            c.record_version,
            c.expires_at,
            r.record_kind
          FROM record_clear_confirmations c
          JOIN saved_records r
            ON r.id = c.record_id
           AND r.account_id = c.account_id
           AND r.entry_point_id = c.entry_point_id
          WHERE c.account_id = $1
            AND c.entry_point_id = $2
            AND c.request_id = $3
        `,
        [value.accountId, value.entryPointId, value.requestId],
      );
      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        if (row.record_id !== value.recordId || row.record_version !== value.expectedVersion) {
          throw new ConflictError('requestId was already used for another clear confirmation');
        }
        return {
          confirmationId: row.id,
          expiresAt: new Date(row.expires_at).toISOString(),
          recordId: row.record_id,
          version: row.record_version,
          kind: row.record_kind,
          idempotent: true,
        };
      }

      const record = await transaction.query(
        `
          SELECT version_no, record_kind
          FROM saved_records
          WHERE id = $1
            AND account_id = $2
            AND entry_point_id = $3
            AND deleted_at IS NULL
          FOR UPDATE
        `,
        [value.recordId, value.accountId, value.entryPointId],
      );
      if (record.rows.length === 0) throw new NotFoundError();
      if (record.rows[0].version_no !== value.expectedVersion) {
        throw new ConflictError('expectedVersion does not match the current record version');
      }

      const confirmation = await transaction.query(
        `
          INSERT INTO record_clear_confirmations (
            account_id,
            entry_point_id,
            record_id,
            record_version,
            request_id
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, expires_at
        `,
        [
          value.accountId,
          value.entryPointId,
          value.recordId,
          value.expectedVersion,
          value.requestId,
        ],
      );
      return {
        confirmationId: confirmation.rows[0].id,
        expiresAt: new Date(confirmation.rows[0].expires_at).toISOString(),
        recordId: value.recordId,
        version: value.expectedVersion,
        kind: record.rows[0].record_kind,
        idempotent: false,
      };
    });
  }

  async clear(input) {
    const value = parse(recordClearSchema, input);
    const payloadHash = stableHash({
      recordId: value.recordId,
      expectedVersion: value.expectedVersion,
      confirmationId: value.confirmationId,
      confirmed: value.confirmed,
    });

    return withTransaction(this.database, async (transaction) => {
      const idempotency = await claimIdempotencyKey(transaction, {
        accountId: value.accountId,
        entryPointId: value.entryPointId,
        operation: 'CLEAR_RECORD',
        requestId: value.requestId,
        payloadHash,
      });
      if (idempotency.existing) {
        return {
          cleared: true,
          recordId: idempotency.resultResourceId,
          version: idempotency.resultVersion,
          idempotent: true,
        };
      }

      const scoped = await transaction.query(
        `
          SELECT version_no
          FROM saved_records
          WHERE id = $1
            AND account_id = $2
            AND entry_point_id = $3
            AND deleted_at IS NULL
        `,
        [value.recordId, value.accountId, value.entryPointId],
      );
      if (scoped.rows.length === 0) throw new NotFoundError();

      const confirmation = await transaction.query(
        `
          SELECT c.id, r.record_kind
          FROM record_clear_confirmations c
          JOIN saved_records r
            ON r.id = c.record_id
           AND r.account_id = c.account_id
           AND r.entry_point_id = c.entry_point_id
          WHERE c.id = $1
            AND c.account_id = $2
            AND c.entry_point_id = $3
            AND c.record_id = $4
            AND c.record_version = $5
            AND c.consumed_at IS NULL
            AND c.expires_at > now()
            AND r.version_no = c.record_version
            AND r.deleted_at IS NULL
          FOR UPDATE OF c, r
        `,
        [
          value.confirmationId,
          value.accountId,
          value.entryPointId,
          value.recordId,
          value.expectedVersion,
        ],
      );
      if (confirmation.rows.length === 0) {
        throw new ConflictError('Clear confirmation is expired, consumed, or no longer matches');
      }

      await deleteRecordPayload(transaction, value.recordId);
      const cleared = await transaction.query(
        `
          UPDATE saved_records
          SET deleted_at = now(),
              updated_at = now(),
              version_no = version_no + 1,
              title_ciphertext = NULL,
              title_key_version = NULL
          WHERE id = $1
            AND account_id = $2
            AND entry_point_id = $3
            AND version_no = $4
            AND deleted_at IS NULL
          RETURNING id, record_kind, version_no
        `,
        [value.recordId, value.accountId, value.entryPointId, value.expectedVersion],
      );

      if (cleared.rows.length === 0) {
        throw new ConflictError('expectedVersion does not match the current record version');
      }

      const row = cleared.rows[0];
      await transaction.query(
        'UPDATE record_clear_confirmations SET consumed_at = now() WHERE id = $1',
        [value.confirmationId],
      );
      const job = await transaction.query(
        `
          INSERT INTO deletion_jobs (
            account_id,
            entry_point_id,
            request_id,
            status
          )
          VALUES ($1, $2, $3, 'PENDING')
          RETURNING id
        `,
        [value.accountId, value.entryPointId, value.requestId],
      );
      const deletionJobId = job.rows[0].id;
      await transaction.query(
        `
          INSERT INTO deletion_targets (
            deletion_job_id,
            target_kind,
            target_ref
          )
          VALUES ($1, $2, $3)
        `,
        [deletionJobId, row.record_kind, row.id],
      );
      await transaction.query(
        `
          INSERT INTO deletion_outbox (deletion_job_id, payload)
          VALUES ($1, $2::jsonb)
        `,
        [
          deletionJobId,
          JSON.stringify({
            deletionJobId,
            recordId: row.id,
            recordKind: row.record_kind,
            accountId: value.accountId,
            entryPointId: value.entryPointId,
          }),
        ],
      );
      await completeIdempotencyKey(transaction, {
        keyId: idempotency.id,
        resourceId: row.id,
        version: row.version_no,
      });

      return {
        cleared: true,
        recordId: row.id,
        version: row.version_no,
        deletionJobId,
        idempotent: false,
      };
    });
  }

  async getDeposit(input) {
    const value = parse(recordIdentitySchema, input);
    return withTransaction(this.database, async (transaction) => {
      const current = await this.#getDepositInTransaction(transaction, value, true);
      if (
        current.state === 'STORED'
        && new Date(current.reopenAt).getTime() <= new Date(current.databaseNow).getTime()
      ) {
        await transaction.query(
          "UPDATE worry_deposits SET status = 'AVAILABLE' WHERE saved_record_id = $1",
          [value.recordId],
        );
        const record = await transaction.query(
          `
            UPDATE saved_records
            SET version_no = version_no + 1,
                updated_at = now()
            WHERE id = $1
              AND account_id = $2
              AND entry_point_id = $3
              AND version_no = $4
              AND deleted_at IS NULL
            RETURNING version_no
          `,
          [value.recordId, value.accountId, value.entryPointId, current.version],
        );
        if (record.rows.length === 0) {
          throw new ConflictError('Deposit changed while becoming available');
        }
        return {
          id: current.id,
          state: 'AVAILABLE',
          reopenAt: current.reopenAt,
          version: record.rows[0].version_no,
          bodyCiphertext: null,
        };
      }
      return {
        id: current.id,
        state: current.state,
        reopenAt: current.reopenAt,
        version: current.version,
        bodyCiphertext: current.bodyCiphertext,
      };
    });
  }

  async retrieveDeposit(input) {
    const value = parse(depositActionSchema, input);
    await this.getDeposit({
      accountId: value.accountId,
      entryPointId: value.entryPointId,
      recordId: value.recordId,
    });
    const payloadHash = stableHash({
      recordId: value.recordId,
      expectedVersion: value.expectedVersion,
    });
    return withTransaction(this.database, async (transaction) => {
      const idempotency = await claimIdempotencyKey(transaction, {
        accountId: value.accountId,
        entryPointId: value.entryPointId,
        operation: 'RETRIEVE_DEPOSIT',
        requestId: value.requestId,
        payloadHash,
      });
      if (idempotency.existing) {
        const current = await this.#getDepositInTransaction(transaction, value);
        return { ...current, idempotent: true };
      }

      const current = await this.#getDepositInTransaction(transaction, value, true);
      if (current.version !== value.expectedVersion) {
        throw new ConflictError('expectedVersion does not match the current deposit version');
      }
      if (current.state === 'STORED') {
        throw new ConflictError('Deposit is not available yet');
      }
      if (current.state === 'RETRIEVED') {
        throw new ConflictError('Deposit was already retrieved');
      }

      await transaction.query(
        "UPDATE worry_deposits SET status = 'RETRIEVED' WHERE saved_record_id = $1",
        [value.recordId],
      );
      const record = await transaction.query(
        `
          UPDATE saved_records
          SET version_no = version_no + 1,
              updated_at = now()
          WHERE id = $1
            AND account_id = $2
            AND entry_point_id = $3
            AND version_no = $4
            AND deleted_at IS NULL
          RETURNING version_no
        `,
        [value.recordId, value.accountId, value.entryPointId, value.expectedVersion],
      );
      if (record.rows.length === 0) {
        throw new ConflictError('expectedVersion does not match the current deposit version');
      }
      await completeIdempotencyKey(transaction, {
        keyId: idempotency.id,
        resourceId: value.recordId,
        version: record.rows[0].version_no,
      });
      return {
        id: value.recordId,
        state: 'RETRIEVED',
        reopenAt: current.reopenAt,
        version: record.rows[0].version_no,
        bodyCiphertext: current.storedBodyCiphertext,
        idempotent: false,
      };
    });
  }

  async postponeDeposit(input) {
    const value = parse(depositPostponeSchema, input);
    await this.getDeposit({
      accountId: value.accountId,
      entryPointId: value.entryPointId,
      recordId: value.recordId,
    });
    const payloadHash = stableHash({
      recordId: value.recordId,
      expectedVersion: value.expectedVersion,
      reopenAt: value.reopenAt,
    });
    return withTransaction(this.database, async (transaction) => {
      const idempotency = await claimIdempotencyKey(transaction, {
        accountId: value.accountId,
        entryPointId: value.entryPointId,
        operation: 'POSTPONE_DEPOSIT',
        requestId: value.requestId,
        payloadHash,
      });
      if (idempotency.existing) {
        const current = await this.#getDepositInTransaction(transaction, value);
        return { ...current, idempotent: true };
      }

      const current = await this.#getDepositInTransaction(transaction, value, true);
      if (current.version !== value.expectedVersion) {
        throw new ConflictError('expectedVersion does not match the current deposit version');
      }
      if (current.state === 'RETRIEVED') {
        throw new ConflictError('Retrieved deposits cannot be postponed');
      }

      const postponed = await transaction.query(
        `
          UPDATE worry_deposits
          SET status = 'STORED',
              reopen_at = $2
          WHERE saved_record_id = $1
            AND $2::timestamptz > now()
          RETURNING saved_record_id
        `,
        [value.recordId, value.reopenAt],
      );
      if (postponed.rows.length === 0) {
        throw new InvalidInputError('reopenAt must be in the future');
      }
      const record = await transaction.query(
        `
          UPDATE saved_records
          SET version_no = version_no + 1,
              updated_at = now()
          WHERE id = $1
            AND account_id = $2
            AND entry_point_id = $3
            AND version_no = $4
            AND deleted_at IS NULL
          RETURNING version_no
        `,
        [value.recordId, value.accountId, value.entryPointId, value.expectedVersion],
      );
      if (record.rows.length === 0) {
        throw new ConflictError('expectedVersion does not match the current deposit version');
      }
      await completeIdempotencyKey(transaction, {
        keyId: idempotency.id,
        resourceId: value.recordId,
        version: record.rows[0].version_no,
      });
      return {
        id: value.recordId,
        state: 'STORED',
        reopenAt: new Date(value.reopenAt).toISOString(),
        version: record.rows[0].version_no,
        bodyCiphertext: null,
        idempotent: false,
      };
    });
  }

  async #getDepositInTransaction(database, value, lock = false) {
    const result = await database.query(
      `
        SELECT
          r.id,
          r.version_no,
          d.status,
          d.reopen_at,
          d.body_ciphertext,
          now() AS database_now
        FROM saved_records r
        JOIN worry_deposits d ON d.saved_record_id = r.id
        WHERE r.id = $1
          AND r.account_id = $2
          AND r.entry_point_id = $3
          AND r.deleted_at IS NULL
        ${lock ? 'FOR UPDATE OF r, d' : ''}
      `,
      [value.recordId, value.accountId, value.entryPointId],
    );
    if (result.rows.length === 0) throw new NotFoundError();
    const row = result.rows[0];
    return {
      id: row.id,
      state: row.status,
      reopenAt: new Date(row.reopen_at).toISOString(),
      version: row.version_no,
      databaseNow: new Date(row.database_now).toISOString(),
      storedBodyCiphertext: row.body_ciphertext,
      bodyCiphertext: row.status === 'RETRIEVED' ? row.body_ciphertext : null,
    };
  }
}
