-- name: UpsertGoogleAccount :one
-- Creates the account on first sign-in; refreshes the Google profile on later ones.
INSERT INTO accounts (google_sub, email, display_name, picture_url)
VALUES ($1, $2, $3, $4)
ON CONFLICT (google_sub) DO UPDATE
SET email         = EXCLUDED.email,
    display_name  = EXCLUDED.display_name,
    picture_url   = EXCLUDED.picture_url,
    last_login_at = now()
RETURNING id, email, display_name, picture_url, created_at, (xmax = 0)::boolean AS created;

-- name: GetAccount :one
SELECT id, email, display_name, picture_url, created_at
FROM accounts
WHERE id = $1;

-- name: AssignRole :exec
INSERT INTO account_roles (account_id, role_id)
SELECT $1, id FROM roles WHERE name = $2
ON CONFLICT DO NOTHING;

-- name: ListAccountRoles :many
SELECT r.name
FROM account_roles ar
JOIN roles r ON r.id = ar.role_id
WHERE ar.account_id = $1
ORDER BY r.name;

-- name: AssignRoleByEmail :execrows
-- Gives a role to every existing account whose email is in the list (lowercase).
INSERT INTO account_roles (account_id, role_id)
SELECT a.id, r.id
FROM accounts a
JOIN roles r ON r.name = sqlc.arg(role)::text
WHERE lower(a.email) = ANY(sqlc.arg(emails)::text[])
ON CONFLICT DO NOTHING;
