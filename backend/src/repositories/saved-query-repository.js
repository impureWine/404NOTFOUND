import { savedQuerySchema } from '../contracts/search.js';
import { withTransaction } from '../db/database.js';
import { ConflictError, InvalidInputError, NotFoundError } from '../domain/errors.js';
import { stableHash } from '../domain/stable-hash.js';
import { claimIdempotencyKey, completeIdempotencyKey } from './idempotency.js';

function canonicalizeUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
    url.port = '';
  }
  return url.toString();
}

function persistentStatus(value) {
  if (value.hasConflict) return 'CONFLICTED';
  if (value.partial) return 'PARTIAL_SUCCESS';
  if (value.sources.some((source) => source.quality === 'STALE')) return 'STALE_SOURCE';
  return 'SUCCESS';
}

function parse(input) {
  const parsed = savedQuerySchema.safeParse(input);
  if (!parsed.success) {
    throw new InvalidInputError('Invalid saved query input', parsed.error.flatten());
  }
  return parsed.data;
}

export class SavedQueryRepository {
  constructor(database) {
    this.database = database;
  }

  async save(input) {
    const value = parse(input);
    const normalizedSources = value.sources.map((source) => ({
      ...source,
      canonicalUrl: canonicalizeUrl(source.url),
    }));
    const sourceUrls = new Set(normalizedSources.map((source) => source.canonicalUrl));
    if (sourceUrls.size !== normalizedSources.length) {
      throw new InvalidInputError('sources contain duplicate canonical URLs');
    }

    const normalizedClaims = value.claims.map((claim) => ({
      ...claim,
      evidence: claim.evidence.map((link) => ({
        ...link,
        canonicalUrl: canonicalizeUrl(link.sourceUrl),
      })),
    }));
    for (const claim of normalizedClaims) {
      if (claim.evidence.some((link) => !sourceUrls.has(link.canonicalUrl))) {
        throw new InvalidInputError('Every evidence link must reference a supplied source');
      }
    }

    const payloadHash = stableHash({
      searchRequestId: value.searchRequestId,
      rawQueryCiphertext: value.rawQueryCiphertext,
      normalizedQueryCiphertext: value.normalizedQueryCiphertext,
      cipherKeyVersion: value.cipherKeyVersion,
      partial: value.partial,
      hasConflict: value.hasConflict,
      uncertaintyNote: value.uncertaintyNote,
      sources: normalizedSources,
      claims: normalizedClaims,
    });

    return withTransaction(this.database, async (transaction) => {
      const idempotency = await claimIdempotencyKey(transaction, {
        accountId: value.accountId,
        entryPointId: value.entryPointId,
        operation: 'SAVE_QUERY',
        requestId: value.requestId,
        payloadHash,
      });
      if (idempotency.existing) {
        const existing = await this.#getInTransaction(transaction, {
          accountId: value.accountId,
          entryPointId: value.entryPointId,
          recordId: idempotency.resultResourceId,
        });
        return { ...existing, idempotent: true };
      }

      const record = await transaction.query(
        `
          INSERT INTO saved_records (
            account_id,
            entry_point_id,
            record_kind,
            request_id
          )
          VALUES ($1, $2, 'QUERY', $3)
          RETURNING id, version_no, created_at, updated_at
        `,
        [value.accountId, value.entryPointId, value.requestId],
      );
      const row = record.rows[0];
      const status = persistentStatus({ ...value, sources: normalizedSources });
      await transaction.query(
        `
          INSERT INTO saved_queries (
            saved_record_id,
            raw_query_ciphertext,
            normalized_query_ciphertext,
            cipher_key_version,
            status,
            uncertainty_note,
            trace_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          row.id,
          value.rawQueryCiphertext,
          value.normalizedQueryCiphertext,
          value.cipherKeyVersion,
          status,
          value.uncertaintyNote,
          value.searchRequestId,
        ],
      );

      const sourceIdByUrl = new Map();
      for (const source of normalizedSources) {
        const savedSource = await transaction.query(
          `
            INSERT INTO sources (
              canonical_url,
              title,
              publisher,
              source_tier,
              quality,
              published_at,
              retrieved_at,
              verification_state,
              content_fingerprint
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (canonical_url) DO UPDATE
            SET title = EXCLUDED.title,
                publisher = EXCLUDED.publisher,
                source_tier = EXCLUDED.source_tier,
                quality = EXCLUDED.quality,
                published_at = EXCLUDED.published_at,
                retrieved_at = GREATEST(sources.retrieved_at, EXCLUDED.retrieved_at),
                verification_state = EXCLUDED.verification_state,
                content_fingerprint = EXCLUDED.content_fingerprint
            RETURNING id
          `,
          [
            source.canonicalUrl,
            source.title,
            source.publisher,
            source.sourceTier,
            source.quality,
            source.publishedAt,
            source.retrievedAt,
            source.verificationState,
            source.contentFingerprint,
          ],
        );
        sourceIdByUrl.set(source.canonicalUrl, savedSource.rows[0].id);
      }

      for (const claim of normalizedClaims) {
        const savedClaim = await transaction.query(
          `
            INSERT INTO claims (
              saved_query_id,
              claim_text_ciphertext,
              cipher_key_version,
              status
            )
            VALUES ($1, $2, $3, $4)
            RETURNING id
          `,
          [row.id, claim.claimTextCiphertext, claim.cipherKeyVersion, claim.status],
        );
        for (const evidence of claim.evidence) {
          await transaction.query(
            `
              INSERT INTO evidence_links (claim_id, source_id, relation)
              VALUES ($1, $2, $3)
            `,
            [savedClaim.rows[0].id, sourceIdByUrl.get(evidence.canonicalUrl), evidence.relation],
          );
        }
      }

      await completeIdempotencyKey(transaction, {
        keyId: idempotency.id,
        resourceId: row.id,
        version: row.version_no,
      });

      return {
        id: row.id,
        kind: 'QUERY',
        status,
        version: row.version_no,
        sourceCount: normalizedSources.length,
        claimCount: normalizedClaims.length,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
        idempotent: false,
      };
    });
  }

  async get({ accountId, entryPointId, recordId }) {
    return this.#getInTransaction(this.database, { accountId, entryPointId, recordId });
  }

  async #getInTransaction(database, { accountId, entryPointId, recordId }) {
    const query = await database.query(
      `
        SELECT
          r.id,
          r.version_no,
          r.created_at,
          r.updated_at,
          q.status,
          q.uncertainty_note,
          q.trace_id
        FROM saved_records r
        JOIN saved_queries q ON q.saved_record_id = r.id
        WHERE r.id = $1
          AND r.account_id = $2
          AND r.entry_point_id = $3
          AND r.deleted_at IS NULL
      `,
      [recordId, accountId, entryPointId],
    );
    if (query.rows.length === 0) throw new NotFoundError();

    const evidence = await database.query(
      `
        SELECT
          c.id AS claim_id,
          c.status AS claim_status,
          e.relation,
          s.id AS source_id,
          s.canonical_url,
          s.title,
          s.publisher,
          s.quality,
          s.published_at,
          s.retrieved_at,
          s.verification_state
        FROM claims c
        JOIN evidence_links e ON e.claim_id = c.id
        JOIN sources s ON s.id = e.source_id
        WHERE c.saved_query_id = $1
        ORDER BY c.id, s.id
      `,
      [recordId],
    );

    const row = query.rows[0];
    return {
      id: row.id,
      kind: 'QUERY',
      status: row.status,
      uncertaintyNote: row.uncertainty_note,
      traceId: row.trace_id,
      version: row.version_no,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      evidence: evidence.rows.map((item) => ({
        claimId: item.claim_id,
        claimStatus: item.claim_status,
        relation: item.relation,
        source: {
          id: item.source_id,
          url: item.canonical_url,
          title: item.title,
          publisher: item.publisher,
          quality: item.quality,
          publishedAt: item.published_at ? new Date(item.published_at).toISOString() : null,
          retrievedAt: new Date(item.retrieved_at).toISOString(),
          verificationState: item.verification_state,
        },
      })),
    };
  }
}

export { canonicalizeUrl, persistentStatus };
