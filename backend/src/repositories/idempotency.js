import { timingSafeEqual } from 'node:crypto';

import { ConflictError } from '../domain/errors.js';

function hashesEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function claimIdempotencyKey(
  transaction,
  { accountId, entryPointId, operation, requestId, payloadHash },
) {
  const inserted = await transaction.query(
    `
      INSERT INTO idempotency_keys (
        account_id,
        entry_point_id,
        operation,
        request_id,
        payload_hash
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (account_id, entry_point_id, operation, request_id)
      DO NOTHING
      RETURNING id, result_resource_id, result_version
    `,
    [accountId, entryPointId, operation, requestId, payloadHash],
  );

  if (inserted.rows.length > 0) {
    return { id: inserted.rows[0].id, existing: false };
  }

  const existing = await transaction.query(
    `
      SELECT id, payload_hash, result_resource_id, result_version
      FROM idempotency_keys
      WHERE account_id = $1
        AND entry_point_id = $2
        AND operation = $3
        AND request_id = $4
    `,
    [accountId, entryPointId, operation, requestId],
  );

  const row = existing.rows[0];
  if (!row || !hashesEqual(row.payload_hash, payloadHash)) {
    throw new ConflictError('requestId was already used with a different payload');
  }
  if (!row.result_resource_id || !row.result_version) {
    throw new ConflictError('The matching request is still being finalized');
  }

  return {
    id: row.id,
    existing: true,
    resultResourceId: row.result_resource_id,
    resultVersion: row.result_version,
  };
}

export async function completeIdempotencyKey(
  transaction,
  { keyId, resourceId, version },
) {
  await transaction.query(
    `
      UPDATE idempotency_keys
      SET result_resource_id = $2,
          result_version = $3
      WHERE id = $1
    `,
    [keyId, resourceId, version],
  );
}
