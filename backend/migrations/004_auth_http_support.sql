ALTER TABLE login_sessions
    ALTER COLUMN account_id DROP NOT NULL,
    ADD COLUMN csrf_token_digest bytea;

ALTER TABLE login_sessions
    ADD CONSTRAINT ck_login_sessions_csrf_digest CHECK (
        csrf_token_digest IS NULL OR octet_length(csrf_token_digest) = 32
    );

CREATE INDEX ix_login_sessions_token_active
    ON login_sessions (token_digest, expires_at)
    WHERE revoked_at IS NULL;
