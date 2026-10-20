-- 404NOTFOUND database design baseline
-- PostgreSQL 16-compatible draft. Design verification attachment only:
-- not executed and not evidence of a deployed database.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE account_status AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');
CREATE TYPE consent_purpose AS ENUM ('CROSS_ENTRY_READ', 'MODEL_EXTERNAL_SEND', 'SEARCH_EXTERNAL_SEND');
CREATE TYPE conversation_mode AS ENUM ('COMPANION', 'TRAINING', 'REHEARSAL');
CREATE TYPE stored_concern_status AS ENUM ('STORED', 'READY', 'DELETED');
CREATE TYPE saved_query_status AS ENUM ('SUCCESS', 'PARTIAL_SUCCESS', 'EMPTY_RESULT', 'TIMEOUT', 'CONFLICTED', 'STALE_SOURCE', 'DELETED');
CREATE TYPE deletion_status AS ENUM ('PENDING', 'RUNNING', 'PARTIAL_FAILURE', 'COMPLETED', 'CANCELLED');

CREATE TABLE user_account (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    login_identifier varchar(160) NOT NULL,
    login_identifier_normalized varchar(160) NOT NULL,
    password_hash varchar(255) NOT NULL,
    status account_status NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_login_identifier_normalized_nonempty CHECK (length(login_identifier_normalized) > 0),
    CONSTRAINT ck_password_hash_not_empty CHECK (length(password_hash) > 0)
);
CREATE UNIQUE INDEX uq_user_account_login_identifier ON user_account (login_identifier_normalized);

CREATE TABLE user_profile (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE REFERENCES user_account(id),
    nickname varchar(64) NOT NULL,
    avatar_ref varchar(512),
    bio_ciphertext bytea,
    cipher_key_version integer,
    timezone_name varchar(64) NOT NULL DEFAULT 'Asia/Shanghai',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_profile_nickname_nonempty CHECK (length(trim(nickname)) > 0),
    CONSTRAINT ck_profile_key_version CHECK (bio_ciphertext IS NULL OR cipher_key_version IS NOT NULL)
);

CREATE TABLE entry_point (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code varchar(32) NOT NULL UNIQUE,
    capability_state jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_session (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES user_account(id),
    entry_point_id uuid NOT NULL REFERENCES entry_point(id),
    token_hash bytea NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz,
    CONSTRAINT ck_session_expiry CHECK (expires_at > created_at),
    CONSTRAINT ck_session_revoked_after_create CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
CREATE INDEX ix_auth_session_owner_entry_expiry ON auth_session (user_id, entry_point_id, expires_at);
CREATE UNIQUE INDEX uq_auth_session_token_hash ON auth_session (token_hash);

CREATE TABLE consent_record (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES user_account(id),
    source_entry_point_id uuid NOT NULL REFERENCES entry_point(id),
    target_entry_point_id uuid NOT NULL REFERENCES entry_point(id),
    purpose consent_purpose NOT NULL,
    scope jsonb NOT NULL,
    granted_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,
    revoked_at timestamptz,
    CONSTRAINT ck_consent_scope_object CHECK (jsonb_typeof(scope) = 'object'),
    CONSTRAINT ck_consent_expiry CHECK (expires_at IS NULL OR expires_at > granted_at),
    CONSTRAINT ck_consent_revoked_after_grant CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);
CREATE INDEX ix_consent_lookup ON consent_record (user_id, source_entry_point_id, target_entry_point_id, purpose);

CREATE TABLE conversation (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id uuid NOT NULL REFERENCES user_account(id),
    entry_point_id uuid NOT NULL REFERENCES entry_point(id),
    mode conversation_mode NOT NULL,
    content_ciphertext bytea NOT NULL,
    cipher_key_version integer NOT NULL,
    version_no integer NOT NULL DEFAULT 1,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_conversation_version CHECK (version_no > 0)
);
CREATE INDEX ix_conversation_owner_entry ON conversation (owner_user_id, entry_point_id, created_at) WHERE deleted_at IS NULL;

CREATE TABLE accepted_expression (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES conversation(id),
    owner_user_id uuid NOT NULL REFERENCES user_account(id),
    entry_point_id uuid NOT NULL REFERENCES entry_point(id),
    expression_ciphertext bytea NOT NULL,
    cipher_key_version integer NOT NULL,
    version_no integer NOT NULL DEFAULT 1,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_expression_version CHECK (version_no > 0)
);
CREATE INDEX ix_expression_owner_entry ON accepted_expression (owner_user_id, entry_point_id, created_at) WHERE deleted_at IS NULL;

CREATE TABLE emotion_record (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id uuid NOT NULL REFERENCES user_account(id),
    entry_point_id uuid NOT NULL REFERENCES entry_point(id),
    record_date date NOT NULL,
    emotion_code varchar(32) NOT NULL,
    intensity smallint NOT NULL,
    event_ciphertext bytea,
    cipher_key_version integer,
    version_no integer NOT NULL DEFAULT 1,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_emotion_intensity CHECK (intensity BETWEEN 1 AND 5),
    CONSTRAINT ck_emotion_key_version CHECK (event_ciphertext IS NULL OR cipher_key_version IS NOT NULL),
    CONSTRAINT ck_emotion_version CHECK (version_no > 0)
);
CREATE INDEX ix_emotion_calendar ON emotion_record (owner_user_id, entry_point_id, record_date) WHERE deleted_at IS NULL;

CREATE TABLE worry_object (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id uuid NOT NULL REFERENCES user_account(id),
    entry_point_id uuid NOT NULL REFERENCES entry_point(id),
    shape_code varchar(32) NOT NULL,
    title_ciphertext bytea,
    body_ciphertext bytea,
    cipher_key_version integer,
    version_no integer NOT NULL DEFAULT 1,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_worry_key_version CHECK ((title_ciphertext IS NULL AND body_ciphertext IS NULL) OR cipher_key_version IS NOT NULL),
    CONSTRAINT ck_worry_version CHECK (version_no > 0)
);
CREATE INDEX ix_worry_owner_entry ON worry_object (owner_user_id, entry_point_id, created_at) WHERE deleted_at IS NULL;

CREATE TABLE stored_concern (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id uuid NOT NULL REFERENCES user_account(id),
    entry_point_id uuid NOT NULL REFERENCES entry_point(id),
    title_ciphertext bytea NOT NULL,
    body_ciphertext bytea NOT NULL,
    cipher_key_version integer NOT NULL,
    reopen_at timestamptz NOT NULL,
    status stored_concern_status NOT NULL DEFAULT 'STORED',
    version_no integer NOT NULL DEFAULT 1,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_stored_concern_version CHECK (version_no > 0)
);
CREATE INDEX ix_stored_concern_due ON stored_concern (status, reopen_at) WHERE deleted_at IS NULL;
CREATE INDEX ix_stored_concern_owner_entry ON stored_concern (owner_user_id, entry_point_id) WHERE deleted_at IS NULL;

CREATE TABLE saved_query (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id uuid NOT NULL REFERENCES user_account(id),
    entry_point_id uuid NOT NULL REFERENCES entry_point(id),
    raw_query_ciphertext bytea NOT NULL,
    normalized_query_ciphertext bytea NOT NULL,
    cipher_key_version integer NOT NULL,
    status saved_query_status NOT NULL,
    uncertainty_note varchar(1000),
    trace_id varchar(128) NOT NULL,
    version_no integer NOT NULL DEFAULT 1,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_saved_query_version CHECK (version_no > 0)
);
CREATE INDEX ix_saved_query_owner_entry ON saved_query (owner_user_id, entry_point_id, created_at) WHERE deleted_at IS NULL;

CREATE TABLE source (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_url varchar(2048) NOT NULL UNIQUE,
    title varchar(512) NOT NULL,
    publisher varchar(256),
    source_tier varchar(2) NOT NULL,
    published_at timestamptz,
    retrieved_at timestamptz NOT NULL,
    verification_state varchar(16) NOT NULL,
    content_fingerprint bytea,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_source_tier CHECK (source_tier IN ('S1', 'S2', 'S3', 'S4', 'SX')),
    CONSTRAINT ck_source_verification CHECK (verification_state IN ('VERIFIED', 'PARTIAL', 'UNAVAILABLE'))
);

CREATE TABLE claim (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    saved_query_id uuid NOT NULL REFERENCES saved_query(id),
    claim_text_ciphertext bytea NOT NULL,
    cipher_key_version integer NOT NULL,
    status varchar(16) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_claim_status CHECK (status IN ('SUPPORTED', 'CONFLICTED', 'UNKNOWN'))
);
CREATE INDEX ix_claim_saved_query ON claim (saved_query_id);

CREATE TABLE evidence (
    claim_id uuid NOT NULL REFERENCES claim(id),
    source_id uuid NOT NULL REFERENCES source(id),
    relation varchar(16) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (claim_id, source_id),
    CONSTRAINT ck_evidence_relation CHECK (relation IN ('SUPPORTS', 'CONFLICTS', 'CONTEXT'))
);

CREATE TABLE retention_policy (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    data_class varchar(32) NOT NULL UNIQUE,
    retention_days integer NOT NULL,
    backup_grace_days integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_retention_days_nonnegative CHECK (retention_days >= 0),
    CONSTRAINT ck_backup_grace_days_nonnegative CHECK (backup_grace_days >= 0)
);

CREATE TABLE deletion_job (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id uuid NOT NULL REFERENCES user_account(id),
    requested_by_session_id uuid REFERENCES auth_session(id),
    status deletion_status NOT NULL DEFAULT 'PENDING',
    requested_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    CONSTRAINT ck_deletion_completion CHECK (completed_at IS NULL OR completed_at >= requested_at)
);

CREATE TABLE deletion_target (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    deletion_job_id uuid NOT NULL REFERENCES deletion_job(id),
    target_kind varchar(32) NOT NULL,
    target_ref varchar(256) NOT NULL,
    status deletion_status NOT NULL DEFAULT 'PENDING',
    retry_count integer NOT NULL DEFAULT 0,
    next_retry_at timestamptz,
    last_error varchar(1000),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_deletion_retry_count CHECK (retry_count >= 0)
);
CREATE INDEX ix_deletion_target_retry ON deletion_target (status, next_retry_at);

CREATE TABLE audit_event (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id uuid REFERENCES user_account(id),
    entry_point_id uuid REFERENCES entry_point(id),
    event_code varchar(64) NOT NULL,
    object_kind varchar(64),
    object_id uuid,
    request_id varchar(128),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT ck_audit_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX ix_audit_actor_time ON audit_event (actor_user_id, occurred_at);

-- Explicitly excluded: password recovery/reset tokens, public homepage,
-- anonymous bottle delivery, raw Message table, and REQ15 destruction text.

