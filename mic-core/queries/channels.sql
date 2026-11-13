-- Private channels (phase-9 D16).

-- name: CreateChannelConversation :one
INSERT INTO conversations (kind) VALUES ('channel') RETURNING id;

-- name: InsertChannel :exec
INSERT INTO channels (conversation, name, owner) VALUES ($1, $2, $3);

-- name: LockChannel :one
-- The channel row, locked for one change (members, owner, invites stay exact).
SELECT conversation, name, owner FROM channels WHERE conversation = $1 FOR UPDATE;

-- name: GetChannel :one
SELECT ch.conversation, ch.name, ch.owner,
       (SELECT count(*) FROM conversation_members m WHERE m.conversation = ch.conversation)::int AS members
FROM channels ch WHERE ch.conversation = $1;

-- name: RenameChannel :exec
UPDATE channels SET name = $2 WHERE conversation = $1;

-- name: SetChannelOwner :exec
UPDATE channels SET owner = $2 WHERE conversation = $1;

-- name: DeleteConversation :exec
DELETE FROM conversations WHERE id = $1;

-- name: CountOwnedChannels :one
SELECT count(*) FROM channels WHERE owner = $1;

-- name: CountJoinedChannels :one
SELECT count(*) FROM conversation_members m JOIN conversations c ON c.id = m.conversation
WHERE m.player = $1 AND c.kind = 'channel';

-- name: CountConversationMembers :one
SELECT count(*) FROM conversation_members WHERE conversation = $1;

-- name: CountChannelInvites :one
SELECT count(*) FROM channel_invites WHERE channel = $1;

-- name: JoinConversation :exec
-- A member from now: reads start at the newest message (history before joining is visible too).
INSERT INTO conversation_members (conversation, player, last_read_seq)
SELECT c.id, sqlc.arg(player)::bigint, c.last_seq FROM conversations c WHERE c.id = sqlc.arg(conversation)::bigint
ON CONFLICT DO NOTHING;

-- name: RemoveConversationMember :execrows
DELETE FROM conversation_members WHERE conversation = $1 AND player = $2;

-- name: OldestConversationMember :one
SELECT player FROM conversation_members WHERE conversation = $1 ORDER BY joined_at, player LIMIT 1;

-- name: ListChannelMembers :many
SELECT m.player, m.joined_at FROM conversation_members m WHERE m.conversation = $1 ORDER BY m.joined_at, m.player;

-- name: InsertChannelInvite :execrows
INSERT INTO channel_invites (channel, player, invited_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING;

-- name: DeleteChannelInvite :execrows
DELETE FROM channel_invites WHERE channel = $1 AND player = $2;

-- name: ListChannelInvitees :many
SELECT player FROM channel_invites WHERE channel = $1 ORDER BY sent_at;

-- name: ListMyChannelInvites :many
SELECT i.channel, i.invited_by, i.sent_at, ch.name, ch.owner,
       (SELECT count(*) FROM conversation_members m WHERE m.conversation = ch.conversation)::int AS members
FROM channel_invites i JOIN channels ch ON ch.conversation = i.channel
WHERE i.player = $1 ORDER BY i.sent_at;
