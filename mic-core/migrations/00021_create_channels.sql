-- +goose Up
-- Private channels (phase-9 D16): a channel is a conversation of kind 'channel' with a name and
-- an owner. Its members are conversation_members (joined_at decides the next owner when the owner
-- leaves); the owner's invites wait in channel_invites until accepted or declined.
CREATE TABLE channels (
    conversation bigint PRIMARY KEY REFERENCES conversations (id) ON DELETE CASCADE,
    name         text   NOT NULL,
    owner        bigint NOT NULL REFERENCES accounts (id) ON DELETE CASCADE
);
CREATE INDEX channels_owner ON channels (owner);

ALTER TABLE conversation_members ADD COLUMN joined_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE channel_invites (
    channel    bigint      NOT NULL REFERENCES channels (conversation) ON DELETE CASCADE,
    player     bigint      NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    invited_by bigint      NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    sent_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (channel, player)
);
CREATE INDEX channel_invites_player ON channel_invites (player);

-- +goose Down
DROP TABLE channel_invites;
ALTER TABLE conversation_members DROP COLUMN joined_at;
DROP TABLE channels;
