CREATE TABLE record_clear_confirmations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
    entry_point_id uuid NOT NULL REFERENCES entry_points(id),
    record_id uuid NOT NULL,
    record_version integer NOT NULL,
    request_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 minutes'),
    consumed_at timestamptz,
    CONSTRAINT fk_record_clear_confirmation_scope
        FOREIGN KEY (record_id, account_id, entry_point_id)
        REFERENCES saved_records(id, account_id, entry_point_id) ON DELETE CASCADE,
    CONSTRAINT uq_record_clear_confirmation_request
        UNIQUE (account_id, entry_point_id, request_id),
    CONSTRAINT ck_record_clear_confirmation_version CHECK (record_version > 0),
    CONSTRAINT ck_record_clear_confirmation_expiry CHECK (expires_at > created_at),
    CONSTRAINT ck_record_clear_confirmation_consumed CHECK (
        consumed_at IS NULL OR consumed_at >= created_at
    )
);

CREATE INDEX ix_record_clear_confirmation_lookup
    ON record_clear_confirmations (
        id,
        account_id,
        entry_point_id,
        record_id,
        record_version,
        expires_at
    );
