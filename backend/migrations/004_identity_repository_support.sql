CREATE TABLE registration_requests (
    request_id uuid PRIMARY KEY,
    payload_hash bytea NOT NULL,
    result_account_id uuid UNIQUE REFERENCES user_accounts(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
    CONSTRAINT ck_registration_requests_nonzero CHECK (
        request_id <> '00000000-0000-0000-0000-000000000000'::uuid
    ),
    CONSTRAINT ck_registration_requests_payload_hash CHECK (
        octet_length(payload_hash) = 32
    ),
    CONSTRAINT ck_registration_requests_expiry CHECK (expires_at > created_at)
);

CREATE INDEX ix_registration_requests_expiry
    ON registration_requests (expires_at);
