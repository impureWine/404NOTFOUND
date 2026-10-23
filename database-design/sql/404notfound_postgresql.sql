-- 404NOTFOUND database design baseline v0.2
-- PostgreSQL 16-compatible baseline migration.
-- gen_random_uuid() is built into supported PostgreSQL versions, so this
-- migration does not require superuser access to install pgcrypto.
-- Execution in the local validation engine is not evidence of deployment.

CREATE TYPE account_status AS ENUM ('ACTIVE', 'LOCKED');
CREATE TYPE consent_purpose AS ENUM ('SAVE', 'AI_PROCESS', 'SEARCH_PROCESS', 'ANALYZE', 'CROSS_ENTRY');
CREATE TYPE saved_record_kind AS ENUM ('CONVERSATION', 'EMOTION', 'WORRY_OBJECT', 'REHEARSAL_DRAFT', 'DEPOSIT', 'QUERY');
CREATE TYPE message_role AS ENUM ('USER', 'ASSISTANT');
CREATE TYPE worry_deposit_status AS ENUM ('STORED', 'AVAILABLE', 'RETRIEVED');
CREATE TYPE saved_query_status AS ENUM ('SUCCESS', 'PARTIAL_SUCCESS', 'CONFLICTED', 'STALE_SOURCE');
CREATE TYPE source_quality AS ENUM ('CURRENT', 'STALE', 'UNKNOWN');
CREATE TYPE deletion_status AS ENUM ('PENDING', 'RUNNING', 'PARTIAL_FAILURE', 'COMPLETED', 'CANCELLED');

CREATE TABLE entry_points (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code varchar(32) NOT NULL UNIQUE,
    capability_state jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_entry_points_capability_object CHECK (jsonb_typeof(capability_state) = 'object')
);

CREATE TABLE user_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    login_identifier varchar(64) NOT NULL,
    login_identifier_normalized varchar(64) NOT NULL UNIQUE,
    status account_status NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_user_accounts_login_format CHECK (
        login_identifier_normalized ~ '^[a-z0-9_]{3,64}$'
    )
);

CREATE TABLE password_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL UNIQUE REFERENCES user_accounts(id) ON DELETE CASCADE,
    password_digest varchar(255) NOT NULL,
    algorithm varchar(16) NOT NULL DEFAULT 'ARGON2ID',
    parameters jsonb NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_password_credentials_digest_nonempty CHECK (length(password_digest) > 0),
    CONSTRAINT ck_password_credentials_algorithm CHECK (algorithm = 'ARGON2ID'),
    CONSTRAINT ck_password_credentials_parameters_object CHECK (jsonb_typeof(parameters) = 'object')
);

CREATE TABLE user_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL UNIQUE REFERENCES user_accounts(id) ON DELETE CASCADE,
    nickname varchar(32) NOT NULL,
    avatar_key varchar(64) NOT NULL,
    bio_ciphertext bytea,
    cipher_key_version integer,
    timezone_name varchar(64) NOT NULL DEFAULT 'Asia/Shanghai',
    version_no integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_user_profiles_nickname_nonempty CHECK (length(trim(nickname)) > 0),
    CONSTRAINT ck_user_profiles_key_version CHECK (bio_ciphertext IS NULL OR cipher_key_version IS NOT NULL),
    CONSTRAINT ck_user_profiles_version CHECK (version_no > 0)
);

CREATE TABLE account_preferences (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL UNIQUE REFERENCES user_accounts(id) ON DELETE CASCADE,
    preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
    version_no integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_account_preferences_object CHECK (jsonb_typeof(preferences) = 'object'),
    CONSTRAINT ck_account_preferences_version CHECK (version_no > 0)
);

CREATE TABLE login_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
    entry_point_id uuid NOT NULL REFERENCES entry_points(id),
    device_id varchar(128),
    token_digest bytea NOT NULL UNIQUE,
    issued_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    CONSTRAINT ck_login_sessions_token_digest CHECK (octet_length(token_digest) = 32),
    CONSTRAINT ck_login_sessions_expiry CHECK (expires_at > issued_at),
    CONSTRAINT ck_login_sessions_last_seen CHECK (last_seen_at >= issued_at),
    CONSTRAINT ck_login_sessions_revoked CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);
CREATE INDEX ix_login_sessions_account_entry_expiry
    ON login_sessions (account_id, entry_point_id, expires_at);
CREATE INDEX ix_login_sessions_active
    ON login_sessions (account_id, expires_at)
    WHERE revoked_at IS NULL;

CREATE TABLE consent_grants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
    entry_point_id uuid NOT NULL REFERENCES entry_points(id),
    target_entry_point_id uuid REFERENCES entry_points(id),
    purpose consent_purpose NOT NULL,
    resource_kind saved_record_kind,
    resource_id uuid,
    resource_version integer,
    scope jsonb NOT NULL,
    granted_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,
    revoked_at timestamptz,
    CONSTRAINT ck_consent_grants_target_entry CHECK (
        (purpose = 'CROSS_ENTRY' AND target_entry_point_id IS NOT NULL AND entry_point_id <> target_entry_point_id)
        OR (purpose <> 'CROSS_ENTRY' AND target_entry_point_id IS NULL)
    ),
    CONSTRAINT ck_consent_grants_resource_version CHECK (resource_version IS NULL OR resource_version > 0),
    CONSTRAINT ck_consent_grants_scope_object CHECK (jsonb_typeof(scope) = 'object'),
    CONSTRAINT ck_consent_grants_expiry CHECK (expires_at IS NULL OR expires_at > granted_at),
    CONSTRAINT ck_consent_grants_revoked CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);
CREATE INDEX ix_consent_grants_lookup
    ON consent_grants (account_id, entry_point_id, purpose, target_entry_point_id);
CREATE INDEX ix_consent_grants_resource
    ON consent_grants (account_id, resource_kind, resource_id, resource_version);

CREATE TABLE saved_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
    entry_point_id uuid NOT NULL REFERENCES entry_points(id),
    record_kind saved_record_kind NOT NULL,
    title_ciphertext bytea,
    title_key_version integer,
    request_id varchar(128) NOT NULL,
    version_no integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT uq_saved_records_identity_scope UNIQUE (id, account_id, entry_point_id),
    CONSTRAINT uq_saved_records_account_entry_request UNIQUE (account_id, entry_point_id, request_id),
    CONSTRAINT ck_saved_records_title_key CHECK (
        title_ciphertext IS NULL OR title_key_version IS NOT NULL
    ),
    CONSTRAINT ck_saved_records_request_nonempty CHECK (length(trim(request_id)) > 0),
    CONSTRAINT ck_saved_records_version CHECK (version_no > 0),
    CONSTRAINT ck_saved_records_deleted CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);
CREATE INDEX ix_saved_records_account_entry_kind_created
    ON saved_records (account_id, entry_point_id, record_kind, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE saved_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    saved_record_id uuid NOT NULL REFERENCES saved_records(id) ON DELETE CASCADE,
    sequence_no integer NOT NULL,
    role message_role NOT NULL,
    content_ciphertext bytea NOT NULL,
    cipher_key_version integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_saved_messages_record_sequence UNIQUE (saved_record_id, sequence_no),
    CONSTRAINT ck_saved_messages_sequence CHECK (sequence_no > 0),
    CONSTRAINT ck_saved_messages_key_version CHECK (cipher_key_version > 0)
);

CREATE TABLE emotion_records (
    saved_record_id uuid PRIMARY KEY REFERENCES saved_records(id) ON DELETE CASCADE,
    record_date date NOT NULL,
    emotion_codes varchar(20)[] NOT NULL,
    intensity smallint NOT NULL,
    timezone_name varchar(64) NOT NULL,
    event_ciphertext bytea,
    cipher_key_version integer,
    CONSTRAINT ck_emotion_records_codes_count CHECK (cardinality(emotion_codes) BETWEEN 1 AND 5),
    CONSTRAINT ck_emotion_records_codes_nonnull CHECK (array_position(emotion_codes, NULL) IS NULL),
    CONSTRAINT ck_emotion_records_intensity CHECK (intensity BETWEEN 1 AND 5),
    CONSTRAINT ck_emotion_records_key_version CHECK (
        event_ciphertext IS NULL OR cipher_key_version IS NOT NULL
    )
);
CREATE INDEX ix_emotion_records_date ON emotion_records (record_date);

CREATE TABLE worry_objects (
    saved_record_id uuid PRIMARY KEY REFERENCES saved_records(id) ON DELETE CASCADE,
    shape_code varchar(32) NOT NULL,
    body_ciphertext bytea,
    cipher_key_version integer,
    CONSTRAINT ck_worry_objects_shape CHECK (shape_code IN ('TANGLE', 'STONE', 'NOTE')),
    CONSTRAINT ck_worry_objects_key_version CHECK (
        body_ciphertext IS NULL OR cipher_key_version IS NOT NULL
    )
);

CREATE TABLE rooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
    entry_point_id uuid NOT NULL REFERENCES entry_points(id),
    version_no integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_rooms_account_entry UNIQUE (account_id, entry_point_id),
    CONSTRAINT uq_rooms_identity_scope UNIQUE (id, account_id, entry_point_id),
    CONSTRAINT ck_rooms_version CHECK (version_no > 0)
);

CREATE TABLE room_objects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id uuid NOT NULL,
    account_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
    entry_point_id uuid NOT NULL REFERENCES entry_points(id),
    worry_object_id uuid NOT NULL REFERENCES worry_objects(saved_record_id) ON DELETE CASCADE,
    position_x numeric(6,5) NOT NULL,
    position_y numeric(6,5) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fk_room_objects_room_scope FOREIGN KEY (room_id, account_id, entry_point_id)
        REFERENCES rooms(id, account_id, entry_point_id) ON DELETE CASCADE,
    CONSTRAINT fk_room_objects_record_scope FOREIGN KEY (worry_object_id, account_id, entry_point_id)
        REFERENCES saved_records(id, account_id, entry_point_id) ON DELETE CASCADE,
    CONSTRAINT uq_room_objects_room_object UNIQUE (room_id, worry_object_id),
    CONSTRAINT ck_room_objects_position_x CHECK (position_x BETWEEN 0 AND 1),
    CONSTRAINT ck_room_objects_position_y CHECK (position_y BETWEEN 0 AND 1)
);

CREATE TABLE rehearsal_drafts (
    saved_record_id uuid PRIMARY KEY REFERENCES saved_records(id) ON DELETE CASCADE,
    scene_ciphertext bytea NOT NULL,
    expressions_ciphertext bytea NOT NULL,
    expression_count smallint NOT NULL,
    cipher_key_version integer NOT NULL,
    CONSTRAINT ck_rehearsal_drafts_key_version CHECK (cipher_key_version > 0),
    CONSTRAINT ck_rehearsal_drafts_count CHECK (expression_count BETWEEN 1 AND 20)
);

CREATE TABLE worry_deposits (
    saved_record_id uuid PRIMARY KEY REFERENCES saved_records(id) ON DELETE CASCADE,
    body_ciphertext bytea NOT NULL,
    cipher_key_version integer NOT NULL,
    reopen_at timestamptz NOT NULL,
    status worry_deposit_status NOT NULL DEFAULT 'STORED',
    CONSTRAINT ck_worry_deposits_key_version CHECK (cipher_key_version > 0)
);
CREATE INDEX ix_worry_deposits_due ON worry_deposits (status, reopen_at);

CREATE TABLE saved_queries (
    saved_record_id uuid PRIMARY KEY REFERENCES saved_records(id) ON DELETE CASCADE,
    raw_query_ciphertext bytea NOT NULL,
    normalized_query_ciphertext bytea NOT NULL,
    cipher_key_version integer NOT NULL,
    status saved_query_status NOT NULL,
    uncertainty_note varchar(1000),
    trace_id varchar(128) NOT NULL,
    CONSTRAINT ck_saved_queries_key_version CHECK (cipher_key_version > 0),
    CONSTRAINT ck_saved_queries_trace_nonempty CHECK (length(trim(trace_id)) > 0)
);
CREATE INDEX ix_saved_queries_trace_id ON saved_queries (trace_id);

CREATE TABLE sources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_url varchar(2048) NOT NULL UNIQUE,
    title varchar(512) NOT NULL,
    publisher varchar(256),
    source_tier varchar(2) NOT NULL,
    quality source_quality NOT NULL,
    published_at timestamptz,
    retrieved_at timestamptz NOT NULL,
    verification_state varchar(16) NOT NULL,
    content_fingerprint bytea,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_sources_tier CHECK (source_tier IN ('S1', 'S2', 'S3', 'S4', 'SX')),
    CONSTRAINT ck_sources_verification CHECK (verification_state IN ('VERIFIED', 'PARTIAL', 'UNAVAILABLE'))
);

CREATE TABLE claims (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    saved_query_id uuid NOT NULL REFERENCES saved_queries(saved_record_id) ON DELETE CASCADE,
    claim_text_ciphertext bytea NOT NULL,
    cipher_key_version integer NOT NULL,
    status varchar(16) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_claims_key_version CHECK (cipher_key_version > 0),
    CONSTRAINT ck_claims_status CHECK (status IN ('SUPPORTED', 'CONFLICTED', 'UNKNOWN'))
);
CREATE INDEX ix_claims_saved_query ON claims (saved_query_id);

CREATE TABLE evidence_links (
    claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    source_id uuid NOT NULL REFERENCES sources(id),
    relation varchar(16) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (claim_id, source_id),
    CONSTRAINT ck_evidence_links_relation CHECK (relation IN ('SUPPORTS', 'CONFLICTS', 'CONTEXT'))
);

CREATE TABLE retention_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    data_class varchar(32) NOT NULL UNIQUE,
    retention_days integer NOT NULL,
    backup_grace_days integer NOT NULL DEFAULT 7,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_retention_policies_days CHECK (retention_days >= 0),
    CONSTRAINT ck_retention_policies_backup_grace CHECK (backup_grace_days = 7)
);

CREATE TABLE deletion_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
    entry_point_id uuid NOT NULL REFERENCES entry_points(id),
    requested_by_session_id uuid REFERENCES login_sessions(id) ON DELETE SET NULL,
    request_id varchar(128) NOT NULL,
    status deletion_status NOT NULL DEFAULT 'PENDING',
    requested_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    CONSTRAINT uq_deletion_jobs_account_entry_request UNIQUE (account_id, entry_point_id, request_id),
    CONSTRAINT ck_deletion_jobs_request_nonempty CHECK (length(trim(request_id)) > 0),
    CONSTRAINT ck_deletion_jobs_completion CHECK (completed_at IS NULL OR completed_at >= requested_at)
);
CREATE INDEX ix_deletion_jobs_account_status ON deletion_jobs (account_id, status, requested_at);

CREATE TABLE deletion_targets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    deletion_job_id uuid NOT NULL REFERENCES deletion_jobs(id) ON DELETE CASCADE,
    target_kind varchar(32) NOT NULL,
    target_ref varchar(256) NOT NULL,
    status deletion_status NOT NULL DEFAULT 'PENDING',
    retry_count integer NOT NULL DEFAULT 0,
    next_retry_at timestamptz,
    last_error varchar(1000),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_deletion_targets_job_target UNIQUE (deletion_job_id, target_kind, target_ref),
    CONSTRAINT ck_deletion_targets_retry_count CHECK (retry_count >= 0)
);
CREATE INDEX ix_deletion_targets_retry ON deletion_targets (status, next_retry_at);

CREATE TABLE deletion_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    deletion_job_id uuid NOT NULL UNIQUE REFERENCES deletion_jobs(id) ON DELETE CASCADE,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz,
    CONSTRAINT ck_deletion_outbox_payload_object CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT ck_deletion_outbox_published CHECK (published_at IS NULL OR published_at >= created_at)
);
CREATE INDEX ix_deletion_outbox_unpublished
    ON deletion_outbox (created_at)
    WHERE published_at IS NULL;

CREATE TABLE deletion_log_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    deletion_job_id uuid NOT NULL,
    account_id uuid NOT NULL,
    object_kind varchar(64) NOT NULL,
    object_ref varchar(256) NOT NULL,
    deleted_at timestamptz NOT NULL,
    retain_until timestamptz NOT NULL,
    checksum bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_deletion_log_entries_object UNIQUE (deletion_job_id, object_kind, object_ref),
    CONSTRAINT ck_deletion_log_entries_retention CHECK (retain_until >= deleted_at + interval '8 days')
);
CREATE INDEX ix_deletion_log_entries_retention ON deletion_log_entries (retain_until);

CREATE TABLE audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_account_id uuid REFERENCES user_accounts(id) ON DELETE SET NULL,
    entry_point_id uuid REFERENCES entry_points(id) ON DELETE SET NULL,
    event_code varchar(64) NOT NULL,
    object_kind varchar(64),
    object_id uuid,
    request_id varchar(128),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT ck_audit_events_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX ix_audit_events_actor_time ON audit_events (actor_account_id, occurred_at DESC);

-- Device-only display and sound settings remain local and are not stored here.
-- Explicitly excluded: password recovery/reset tokens, public homepage,
-- bottle delivery, unsaved messages, and all REQ14 text-destruction content.
