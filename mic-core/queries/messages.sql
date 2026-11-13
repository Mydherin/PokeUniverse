-- Direct messages (phase-9 D8-D11) and, from M6, channel messages.

-- name: EnsureDirectConversation :one
-- The pair's conversation, created on the first message (the pair is unique).
WITH made AS (
    INSERT INTO conversations (kind, pair_a, pair_b) VALUES ('direct', sqlc.arg(a)::bigint, sqlc.arg(b)::bigint)
    ON CONFLICT (pair_a, pair_b) DO NOTHING
    RETURNING id
)
SELECT id FROM made
UNION ALL
SELECT id FROM conversations WHERE pair_a = sqlc.arg(a)::bigint AND pair_b = sqlc.arg(b)::bigint
LIMIT 1;

-- name: AddConversationMember :exec
INSERT INTO conversation_members (conversation, player) VALUES ($1, $2) ON CONFLICT DO NOTHING;

-- name: GetConversation :one
SELECT id, kind, pair_a, pair_b, last_seq FROM conversations WHERE id = $1;

-- name: IsConversationMember :one
SELECT EXISTS (SELECT 1 FROM conversation_members WHERE conversation = $1 AND player = $2);

-- name: ListConversationMembers :many
SELECT player FROM conversation_members WHERE conversation = $1;

-- name: InsertMessage :one
-- The next seq and the message in one statement (D8).
WITH s AS (
    UPDATE conversations SET last_seq = last_seq + 1, last_at = now()
    WHERE id = sqlc.arg(conversation_id)::bigint
    RETURNING last_seq
)
INSERT INTO messages (conversation_id, seq, sender, text, client_id)
SELECT sqlc.arg(conversation_id)::bigint, s.last_seq, sqlc.arg(sender)::bigint, sqlc.arg(text)::text, sqlc.arg(client_id)::text FROM s
RETURNING seq, sent_at;

-- name: GetMessageByClientID :one
SELECT seq, text, sent_at FROM messages WHERE conversation_id = $1 AND sender = $2 AND client_id = $3;

-- name: ListMessagesBefore :many
-- A page of history, newest first (D10).
SELECT m.seq, m.sender, m.text, m.sent_at, COALESCE(t.name, '')::text AS sender_name FROM messages m
LEFT JOIN trainers t ON t.account_id = m.sender
WHERE m.conversation_id = sqlc.arg(conversation_id)::bigint AND m.seq < sqlc.arg(before)::bigint
ORDER BY m.seq DESC LIMIT sqlc.arg(n)::int;

-- name: ListMessagesAfter :many
-- What came after seq (a reconnect's refetch), oldest first.
SELECT m.seq, m.sender, m.text, m.sent_at, COALESCE(t.name, '')::text AS sender_name FROM messages m
LEFT JOIN trainers t ON t.account_id = m.sender
WHERE m.conversation_id = sqlc.arg(conversation_id)::bigint AND m.seq > sqlc.arg(after)::bigint
ORDER BY m.seq LIMIT sqlc.arg(n)::int;

-- name: MarkRead :exec
UPDATE conversation_members SET last_read_seq = GREATEST(last_read_seq, LEAST(sqlc.arg(seq)::bigint, c.last_seq))
FROM conversations c
WHERE c.id = conversation_members.conversation AND conversation = sqlc.arg(conversation)::bigint AND player = sqlc.arg(player)::bigint;

-- name: ListConversations :many
-- The player's conversations with unread counts and the last line (D10).
SELECT c.id, c.kind, c.pair_a, c.pair_b, c.last_seq, c.last_at, m.last_read_seq,
       COALESCE(l.sender, 0)::bigint AS last_sender, COALESCE(l.text, '')::text AS last_text,
       COALESCE(lt.name, '')::text AS last_sender_name,
       COALESCE(ch.name, '')::text AS channel_name, COALESCE(ch.owner, 0)::bigint AS channel_owner,
       (SELECT count(*) FROM conversation_members cm WHERE cm.conversation = c.id)::int AS members
FROM conversation_members m
JOIN conversations c ON c.id = m.conversation
LEFT JOIN channels ch ON ch.conversation = c.id
LEFT JOIN messages l ON l.conversation_id = c.id AND l.seq = c.last_seq
LEFT JOIN trainers lt ON lt.account_id = l.sender
WHERE m.player = $1
ORDER BY c.last_at DESC;

-- name: PruneMessages :execrows
-- Keeps the newest 1,000 per conversation (D10).
DELETE FROM messages m USING conversations c
WHERE m.conversation_id = c.id AND m.seq <= c.last_seq - 1000;
