-- name: CreateRefreshToken :exec
INSERT INTO refresh_tokens (account_id, token_hash, expires_at)
VALUES ($1, $2, $3);

-- name: GetRefreshTokenForUpdate :one
SELECT id, account_id, expires_at, revoked_at
FROM refresh_tokens
WHERE token_hash = $1
FOR UPDATE;

-- name: RevokeRefreshToken :exec
UPDATE refresh_tokens SET revoked_at = now()
WHERE id = $1 AND revoked_at IS NULL;

-- name: RevokeRefreshTokenByHash :exec
UPDATE refresh_tokens SET revoked_at = now()
WHERE token_hash = $1 AND revoked_at IS NULL;

-- name: RevokeAccountRefreshTokens :exec
UPDATE refresh_tokens SET revoked_at = now()
WHERE account_id = $1 AND revoked_at IS NULL;

-- name: DeleteExpiredRefreshTokens :execrows
DELETE FROM refresh_tokens
WHERE expires_at < now();
