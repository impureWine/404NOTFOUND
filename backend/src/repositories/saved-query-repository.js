import {
  completedSearchResultSchema,
  savedQueryRequestSchema,
} from '../contracts/search.js';
import { withTransaction } from '../db/database.js';
import { ConflictError, InvalidInputError, NotFoundError } from '../domain/errors.js';
import { stableHash } from '../domain/stable-hash.js';
import {
  claimIdempotencyKey,
  completeIdempotencyKey,
  findCompletedIdempotencyResult,
} from './idempotency.js';

const SOURCE_RELIABILITY_NOTE = (
  'One or more sources are stale, unavailable, or not fully verified; '
  + 'affected claims were downgraded to unknown.'
);

function canonicalizeUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  const usesDefaultPort = (
    (url.protocol === 'https:' && url.port === '443')
    || (url.protocol === 'http:' && url.port === '80')
  );
  if (usesDefaultPort) {
    url.port = '';
  }
  return url.toString();
}

function persistentStatus(value) {
  if (value.hasConflict) return 'CONFLICTED';
  if (value.partial) return 'PARTIAL_SUCCESS';
  if (value.sources.some((source) => source.quality === 'STALE')) return 'STALE_SOURCE';
  if (value.sources.some((source) => (
    source.quality !== 'CURRENT' || source.verificationState !== 'VERIFIED'
  ))) return 'PARTIAL_SUCCESS';
  return 'SUCCESS';
}

function isReliableSource(source) {
  return Boolean(
    source
    && source.quality === 'CURRENT'
    && source.verificationState === 'VERIFIED',
  );
}

function parse(schema, input, message) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new InvalidInputError(message, parsed.error.flatten());
  }
  return parsed.data;
}

export class SavedQueryRepository {
  constructor(database, { resolveCompletedSearch } = {}) {
    this.database = database;
    this.resolveCompletedSearch = resolveCompletedSearch;
  }

  async save(input) {
    const request = parse(
      savedQueryRequestSchema,
      input,
      'Invalid saved query request',
    );
    if (typeof this.resolveCompletedSearch !== 'function') {
      throw new TypeError('resolveCompletedSearch is required to save query results');
    }

    const payloadHash = stableHash({ searchRequestId: request.searchRequestId });
    const idempotencyInput = {
      accountId: request.accountId,
      entryPointId: request.entryPointId,
      operation: 'SAVE_QUERY',
      requestId: request.requestId,
      payloadHash,
    };
    const completedRequest = await findCompletedIdempotencyResult(
      this.database,
      idempotencyInput,
    );
    if (completedRequest) {
      const existing = await this.#getInTransaction(this.database, {
        accountId: request.accountId,
        entryPointId: request.entryPointId,
        recordId: completedRequest.resultResourceId,
      });
      return { ...existing, idempotent: true };
    }

    const resolved = await this.resolveCompletedSearch({
      accountId: request.accountId,
      entryPointId: request.entryPointId,
      searchRequestId: request.searchRequestId,
    });
    if (!resolved) throw new NotFoundError('Completed search result not found');

    const value = parse(
      completedSearchResultSchema,
      resolved,
      'Completed search result violates the persistence contract',
    );
    if (
      value.accountId !== request.accountId
      || value.entryPointId !== request.entryPointId
      || value.searchRequestId !== request.searchRequestId
    ) {
      throw new NotFoundError('Completed search result not found');
    }
    if (
      value.status !== 'completed'
      || value.searchState !== 'SUCCESS'
      || value.sources.length === 0
    ) {
      throw new ConflictError('Only completed successful searches with sources can be saved');
    }

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
      const uniqueEvidenceUrls = new Set(
        claim.evidence.map((link) => link.canonicalUrl),
      );
      if (uniqueEvidenceUrls.size !== claim.evidence.length) {
        throw new InvalidInputError('A claim cannot reference the same source more than once');
      }
    }
    const sourcesByUrl = new Map(
      normalizedSources.map((source) => [source.canonicalUrl, source]),
    );
    let reliabilityDowngraded = false;
    const persistedClaims = normalizedClaims.map((claim) => {
      if (claim.status !== 'SUPPORTED') return claim;
      const hasReliableEvidence = claim.evidence.some((link) => (
        isReliableSource(sourcesByUrl.get(link.canonicalUrl))
      ));
      if (hasReliableEvidence) return claim;
      reliabilityDowngraded = true;
      return { ...claim, status: 'UNKNOWN' };
    });
    const uncertaintyNote = reliabilityDowngraded
      ? (value.uncertaintyNote ?? SOURCE_RELIABILITY_NOTE)
      : value.uncertaintyNote;

    return withTransaction(this.database, async (transaction) => {
      const idempotency = await claimIdempotencyKey(transaction, idempotencyInput);
      if (idempotency.existing) {
        const existing = await this.#getInTransaction(transaction, {
          accountId: request.accountId,
          entryPointId: request.entryPointId,
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
        [request.accountId, request.entryPointId, request.requestId],
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
          uncertaintyNote,
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
            SET title = CASE
                  WHEN EXCLUDED.retrieved_at >= sources.retrieved_at THEN EXCLUDED.title
                  ELSE sources.title
                END,
                publisher = CASE
                  WHEN EXCLUDED.retrieved_at >= sources.retrieved_at THEN EXCLUDED.publisher
                  ELSE sources.publisher
                END,
                source_tier = CASE
                  WHEN EXCLUDED.retrieved_at >= sources.retrieved_at THEN EXCLUDED.source_tier
                  ELSE sources.source_tier
                END,
                quality = CASE
                  WHEN EXCLUDED.retrieved_at >= sources.retrieved_at THEN EXCLUDED.quality
                  ELSE sources.quality
                END,
                published_at = CASE
                  WHEN EXCLUDED.retrieved_at >= sources.retrieved_at THEN EXCLUDED.published_at
                  ELSE sources.published_at
                END,
                retrieved_at = GREATEST(sources.retrieved_at, EXCLUDED.retrieved_at),
                verification_state = CASE
                  WHEN EXCLUDED.retrieved_at >= sources.retrieved_at
                    THEN EXCLUDED.verification_state
                  ELSE sources.verification_state
                END,
                content_fingerprint = CASE
                  WHEN EXCLUDED.retrieved_at >= sources.retrieved_at
                    THEN EXCLUDED.content_fingerprint
                  ELSE sources.content_fingerprint
                END
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

      for (const claim of persistedClaims) {
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
          q.raw_query_ciphertext,
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
          c.claim_text_ciphertext,
          c.cipher_key_version,
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
    const claimsById = new Map();
    for (const item of evidence.rows) {
      if (!claimsById.has(item.claim_id)) {
        claimsById.set(item.claim_id, {
          id: item.claim_id,
          claimTextCiphertext: item.claim_text_ciphertext,
          cipherKeyVersion: item.cipher_key_version,
          status: item.claim_status,
          evidence: [],
        });
      }
      claimsById.get(item.claim_id).evidence.push({
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
      });
    }
    return {
      id: row.id,
      kind: 'QUERY',
      rawQueryCiphertext: row.raw_query_ciphertext,
      status: row.status,
      uncertaintyNote: row.uncertainty_note,
      traceId: row.trace_id,
      version: row.version_no,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      claims: [...claimsById.values()],
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
