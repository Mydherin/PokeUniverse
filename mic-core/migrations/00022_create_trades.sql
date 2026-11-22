-- +goose Up
-- Trades (phase-9 D23): one row per swap, written in the swap's transaction, so a trade ID
-- retried or replayed applies once. The slots are the party slots swapped.
CREATE TABLE trades (
    id          text        PRIMARY KEY,
    leader      bigint      NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    member      bigint      NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    leader_slot smallint    NOT NULL CHECK (leader_slot BETWEEN 0 AND 5),
    member_slot smallint    NOT NULL CHECK (member_slot BETWEEN 0 AND 5),
    traded_at   timestamptz NOT NULL DEFAULT now(),
    CHECK (leader <> member)
);

-- +goose Down
DROP TABLE trades;
