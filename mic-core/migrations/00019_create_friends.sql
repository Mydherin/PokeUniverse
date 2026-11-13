-- +goose Up
-- Friends (phase-9 D3): a pending request from one trainer to another, and a friendship, one row
-- per pair (a < b). Accounts, not trainers: a New Game keeps its friends.
CREATE TABLE friend_requests (
    from_id    bigint      NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    to_id      bigint      NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (from_id, to_id),
    CHECK (from_id <> to_id)
);
CREATE INDEX friend_requests_to ON friend_requests (to_id, created_at);

CREATE TABLE friendships (
    a     bigint      NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    b     bigint      NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    since timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (a, b),
    CHECK (a < b)
);
CREATE INDEX friendships_b ON friendships (b);

-- The face shown in the social panel (phase-9 D6): 0 = the trainer's default face by gender.
-- last_seen_at: when the trainer last went offline (phase-9 D7).
ALTER TABLE trainers ADD COLUMN face bigint NOT NULL DEFAULT 0 CHECK (face >= 0 AND face <= 4294967295),
                     ADD COLUMN last_seen_at timestamptz;

-- +goose Down
ALTER TABLE trainers DROP COLUMN last_seen_at, DROP COLUMN face;
DROP TABLE friendships;
DROP TABLE friend_requests;
