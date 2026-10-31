-- +goose Up
-- One trainer per account, created by New Game (Phase 3).
CREATE TABLE trainers (
    account_id        bigint      PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
    name              text        NOT NULL,
    gender            text        NOT NULL CHECK (gender IN ('boy', 'girl')),
    play_time_seconds bigint      NOT NULL DEFAULT 0,
    created_at        timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE trainers;
