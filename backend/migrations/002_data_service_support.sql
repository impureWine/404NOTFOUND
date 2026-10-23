CREATE TABLE idempotency_keys (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
    entry_point_id uuid NOT NULL REFERENCES entry_points(id),
    operation varchar(64) NOT NULL,
    request_id varchar(128) NOT NULL,
    payload_hash bytea NOT NULL,
    result_resource_id uuid REFERENCES saved_records(id) ON DELETE SET NULL,
    result_version integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
    CONSTRAINT uq_idempotency_scope UNIQUE (
        account_id,
        entry_point_id,
        operation,
        request_id
    ),
    CONSTRAINT ck_idempotency_operation_nonempty CHECK (length(trim(operation)) > 0),
    CONSTRAINT ck_idempotency_request_nonempty CHECK (length(trim(request_id)) > 0),
    CONSTRAINT ck_idempotency_payload_hash CHECK (octet_length(payload_hash) = 32),
    CONSTRAINT ck_idempotency_result_version CHECK (
        result_version IS NULL OR result_version > 0
    ),
    CONSTRAINT ck_idempotency_expiry CHECK (expires_at > created_at)
);

CREATE INDEX ix_idempotency_expiry ON idempotency_keys (expires_at);

CREATE INDEX ix_saved_records_scope_version
    ON saved_records (id, account_id, entry_point_id, version_no)
    WHERE deleted_at IS NULL;
