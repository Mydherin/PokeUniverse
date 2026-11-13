-- +goose Up
-- Conversations (phase-9 D8): direct (one per friend pair, created on the first message) and,
-- from M6, channels. last_seq is the newest message's seq, so unread = last_seq - last_read_seq
-- (D10). A direct conversation keeps its pair (a < b) to be found again; channels have none.
CREATE TABLE conversations (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind       text        NOT NULL CHECK (kind IN ('direct', 'channel')),
    pair_a     bigint      REFERENCES accounts (id) ON DELETE CASCADE,
    pair_b     bigint      REFERENCES accounts (id) ON DELETE CASCADE,
    last_seq   bigint      NOT NULL DEFAULT 0,
    last_at    timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (pair_a, pair_b),
    CHECK ((kind = 'direct') = (pair_a IS NOT NULL AND pair_b IS NOT NULL AND pair_a < pair_b))
);

CREATE TABLE conversation_members (
    conversation  bigint NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    player        bigint NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    last_read_seq bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (conversation, player)
);
CREATE INDEX conversation_members_player ON conversation_members (player);

-- A message is saved before anyone is sent it (D8). client_id dedupes a sender's retries.
CREATE TABLE messages (
    conversation_id bigint      NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    seq             bigint      NOT NULL,
    sender          bigint      NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    text            text        NOT NULL,
    client_id       text        NOT NULL,
    sent_at         timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (conversation_id, seq),
    UNIQUE (conversation_id, sender, client_id)
);

-- +goose Down
DROP TABLE messages;
DROP TABLE conversation_members;
DROP TABLE conversations;
