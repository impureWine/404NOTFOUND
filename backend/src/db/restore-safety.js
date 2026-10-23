import { withTransaction } from './database.js';
import { ConflictError } from '../domain/errors.js';

export async function secureRestoredDatabase(
  database,
  { deletionLogReplayCompleted = false } = {},
) {
  if (!deletionLogReplayCompleted) {
    throw new ConflictError(
      'Restored data cannot be opened before the independent deletion log is replayed',
    );
  }

  return withTransaction(database, async (transaction) => {
    const revoked = await transaction.query(
      `
        UPDATE login_sessions
        SET revoked_at = COALESCE(revoked_at, now())
        WHERE revoked_at IS NULL
        RETURNING id
      `,
    );
    const pendingOutbox = await transaction.query(
      'SELECT count(*)::int AS count FROM deletion_outbox WHERE published_at IS NULL',
    );
    return {
      revokedSessionCount: revoked.rows.length,
      pendingDeletionOutboxCount: pendingOutbox.rows[0].count,
    };
  });
}
