import {
  depositActionSchema,
  depositPostponeSchema,
  recordClearSchema,
  recordCreateSchema,
  recordIdentitySchema,
  recordListSchema,
} from '../contracts/records.js';
import { ConflictError, InvalidInputError, NotFoundError } from '../domain/errors.js';
import { stableHash } from '../domain/stable-hash.js';
import { withTransaction } from '../db/database.js';
import { claimIdempotencyKey, completeIdempotencyKey } from './idempotency.js';

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
    version: row.version_no,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    idempotent,
  };
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
      if (new Date(details.reopenAt).getTime() <= Date.now()) {
        throw new InvalidInputError('reopenAt must be in the future');
      }
      await transaction.query(
        `
          INSERT INTO worry_deposits (
            saved_record_id,
            body_ciphertext,
            cipher_key_version,
            reopen_at
          )
          VALUES ($1, $2, $3, $4)
        `,
        [recordId, details.bodyCiphertext, details.cipherKeyVersion, details.reopenAt],
      );
      break;
    default:
      throw new InvalidInputError(`Unsupported record kind: ${kind}`);
  }
}

export class RecordRepository {
  constructor(database) {
    this.database = database;
  }

  async create(input) {
    const value = parse(recordCreateSchema, input);
    const payloadHash = stableHash({
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
            SELECT id, record_kind, version_no, created_at, updated_at
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
          RETURNING id, record_kind, version_no, created_at, updated_at
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
    const parameters = [value.accountId, value.entryPointId, value.limit];
    const kindClause = value.kind ? 'AND record_kind = $4' : '';
    if (value.kind) parameters.push(value.kind);

    const result = await this.database.query(
      `
        SELECT id, record_kind, version_no, created_at, updated_at
        FROM saved_records
        WHERE account_id = $1
          AND entry_point_id = $2
          AND deleted_at IS NULL
          ${kindClause}
        ORDER BY created_at DESC, id DESC
        LIMIT $3
      `,
      parameters,
    );
    return result.rows.map((row) => mapRecord(row));
  }

  async get(input) {
    const value = parse(recordIdentitySchema, input);
    const result = await this.database.query(
      `
        SELECT id, record_kind, version_no, created_at, updated_at
        FROM saved_records
        WHERE id = $1
          AND account_id = $2
          AND entry_point_id = $3
          AND deleted_at IS NULL
      `,
      [value.recordId, value.accountId, value.entryPointId],
    );
    if (result.rows.length === 0) throw new NotFoundError();
    return mapRecord(result.rows[0]);
  }

  async clear(input) {
    const value = parse(recordClearSchema, input);
    const payloadHash = stableHash({
      recordId: value.recordId,
      expectedVersion: value.expectedVersion,
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

      const cleared = await transaction.query(
        `
          UPDATE saved_records
          SET deleted_at = now(),
              updated_at = now(),
              version_no = version_no + 1
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
        throw new ConflictError('expectedVersion does not match the current record version');
      }

      const row = cleared.rows[0];
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
      await transaction.query(
        `
          UPDATE worry_deposits d
          SET status = 'AVAILABLE'
          WHERE d.saved_record_id = $1
            AND d.status = 'STORED'
            AND d.reopen_at <= now()
            AND EXISTS (
              SELECT 1
              FROM saved_records r
              WHERE r.id = d.saved_record_id
                AND r.account_id = $2
                AND r.entry_point_id = $3
                AND r.deleted_at IS NULL
            )
        `,
        [value.recordId, value.accountId, value.entryPointId],
      );
      const result = await transaction.query(
        `
          SELECT r.id, r.version_no, d.status, d.reopen_at, d.body_ciphertext
          FROM saved_records r
          JOIN worry_deposits d ON d.saved_record_id = r.id
          WHERE r.id = $1
            AND r.account_id = $2
            AND r.entry_point_id = $3
            AND r.deleted_at IS NULL
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
        bodyCiphertext: row.status === 'RETRIEVED' ? row.body_ciphertext : null,
      };
    });
  }

  async retrieveDeposit(input) {
    const value = parse(depositActionSchema, input);
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
      if (current.state === 'STORED' && new Date(current.reopenAt).getTime() > Date.now()) {
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
    if (new Date(value.reopenAt).getTime() <= Date.now()) {
      throw new InvalidInputError('reopenAt must be in the future');
    }
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

      await transaction.query(
        `
          UPDATE worry_deposits
          SET status = 'STORED',
              reopen_at = $2
          WHERE saved_record_id = $1
        `,
        [value.recordId, value.reopenAt],
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
        SELECT r.id, r.version_no, d.status, d.reopen_at, d.body_ciphertext
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
      storedBodyCiphertext: row.body_ciphertext,
      bodyCiphertext: row.status === 'RETRIEVED' ? row.body_ciphertext : null,
    };
  }
}
