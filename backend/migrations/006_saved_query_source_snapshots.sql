-- Freeze source metadata per saved query. Existing rows can only be backfilled
-- from today's shared catalog; they are explicitly labelled, not historical truth.
ALTER TABLE saved_queries ADD COLUMN snapshot_origin varchar(20) NOT NULL DEFAULT 'SAVED';
ALTER TABLE saved_queries ADD CONSTRAINT ck_query_snapshot_origin
    CHECK (snapshot_origin IN ('SAVED', 'LEGACY_BACKFILL'));
UPDATE saved_queries SET snapshot_origin = 'LEGACY_BACKFILL';

CREATE TABLE saved_query_sources (
    saved_query_id uuid NOT NULL REFERENCES saved_queries(saved_record_id) ON DELETE CASCADE,
    source_id uuid NOT NULL REFERENCES sources(id),
    sequence_no integer NOT NULL CHECK (sequence_no > 0),
    canonical_url varchar(2048) NOT NULL,
    title varchar(512) NOT NULL,
    publisher varchar(256),
    source_tier varchar(2) NOT NULL CHECK (source_tier IN ('S1', 'S2', 'S3', 'S4', 'SX')),
    quality source_quality NOT NULL,
    published_at timestamptz,
    retrieved_at timestamptz NOT NULL,
    verification_state varchar(16) NOT NULL
        CHECK (verification_state IN ('VERIFIED', 'PARTIAL', 'UNAVAILABLE')),
    PRIMARY KEY (saved_query_id, source_id),
    UNIQUE (saved_query_id, sequence_no),
    UNIQUE (saved_query_id, canonical_url)
);

INSERT INTO saved_query_sources (
    saved_query_id, source_id, sequence_no, canonical_url, title, publisher,
    source_tier, quality, published_at, retrieved_at, verification_state
)
SELECT saved_query_id, id,
       row_number() OVER (PARTITION BY saved_query_id ORDER BY id),
       canonical_url, title, publisher, source_tier, quality,
       published_at, retrieved_at, verification_state
FROM (
    SELECT DISTINCT c.saved_query_id, s.*
    FROM claims c
    JOIN evidence_links e ON e.claim_id = c.id
    JOIN sources s ON s.id = e.source_id
) AS legacy_sources;
