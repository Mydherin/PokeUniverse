-- +goose Up
-- Only the SHA-256 hash of each refresh token is stored.
-- Revoked rows are kept until they expire, so a reused token can be detected.
CREATE TABLE refresh_tokens (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id bigint      NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    token_hash bytea       NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz
);

CREATE INDEX refresh_tokens_active_account_idx ON refresh_tokens (account_id) WHERE revoked_at IS NULL;
CREATE INDEX refresh_tokens_expires_at_idx ON refresh_tokens (expires_at);

-- +goose Down
DROP TABLE refresh_tokens;
