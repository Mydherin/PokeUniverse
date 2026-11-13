-- Friends (phase-9 D3). Players are accounts; what the social panel shows of them comes from
-- their trainers (an account without one isn't a player).

-- name: LockSocial :exec
-- Serializes the friend changes of one account inside a transaction (limits stay exact).
SELECT pg_advisory_xact_lock(9, sqlc.arg(account_id)::int);

-- name: GetSocialTrainer :one
SELECT account_id, name, gender, face, last_seen_at FROM trainers WHERE account_id = $1;

-- name: ListFriends :many
SELECT t.account_id, t.name, t.gender, t.face, t.last_seen_at
FROM friendships f
JOIN trainers t ON t.account_id = CASE WHEN f.a = sqlc.arg(account_id)::bigint THEN f.b ELSE f.a END
WHERE f.a = sqlc.arg(account_id)::bigint OR f.b = sqlc.arg(account_id)::bigint
ORDER BY f.since;

-- name: ListFriendIDs :many
SELECT (CASE WHEN a = sqlc.arg(account_id)::bigint THEN b ELSE a END)::bigint AS friend_id
FROM friendships
WHERE a = sqlc.arg(account_id)::bigint OR b = sqlc.arg(account_id)::bigint;

-- name: ListIncomingRequests :many
SELECT t.account_id, t.name, t.gender, t.face, r.created_at
FROM friend_requests r JOIN trainers t ON t.account_id = r.from_id
WHERE r.to_id = $1
ORDER BY r.created_at;

-- name: ListOutgoingRequests :many
SELECT t.account_id, t.name, t.gender, t.face, r.created_at
FROM friend_requests r JOIN trainers t ON t.account_id = r.to_id
WHERE r.from_id = $1
ORDER BY r.created_at;

-- name: CountFriends :one
SELECT count(*) FROM friendships WHERE a = sqlc.arg(account_id)::bigint OR b = sqlc.arg(account_id)::bigint;

-- name: CountOutgoingRequests :one
SELECT count(*) FROM friend_requests WHERE from_id = $1;

-- name: AreFriends :one
SELECT EXISTS (SELECT 1 FROM friendships WHERE a = sqlc.arg(a)::bigint AND b = sqlc.arg(b)::bigint);

-- name: RequestExists :one
SELECT EXISTS (SELECT 1 FROM friend_requests WHERE from_id = $1 AND to_id = $2);

-- name: InsertFriendRequest :one
INSERT INTO friend_requests (from_id, to_id) VALUES ($1, $2) RETURNING created_at;

-- name: DeleteFriendRequest :execrows
DELETE FROM friend_requests WHERE from_id = $1 AND to_id = $2;

-- name: DropOldestIncoming :many
-- Keeps a player's newest 50 incoming requests (D3) and returns who sent the dropped ones.
DELETE FROM friend_requests
WHERE to_id = sqlc.arg(to_id)::bigint AND from_id IN (
    SELECT from_id FROM friend_requests WHERE to_id = sqlc.arg(to_id)::bigint
    ORDER BY created_at DESC OFFSET 50)
RETURNING from_id;

-- name: InsertFriendship :exec
INSERT INTO friendships (a, b) VALUES (sqlc.arg(a)::bigint, sqlc.arg(b)::bigint) ON CONFLICT DO NOTHING;

-- name: DeleteFriendship :execrows
DELETE FROM friendships WHERE a = sqlc.arg(a)::bigint AND b = sqlc.arg(b)::bigint;

-- name: SetLastSeen :exec
UPDATE trainers SET last_seen_at = now() WHERE account_id = $1;
