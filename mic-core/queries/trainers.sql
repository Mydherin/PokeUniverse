-- name: GetTrainer :one
-- created_at identifies the save: a New Game replaces it, so live positions of the old save are ignored.
SELECT name, gender, play_time_seconds, map_id, x, y, facing, created_at
FROM trainers
WHERE account_id = $1;

-- name: PutTrainer :one
-- New Game: the account's trainer, replaced if it already has one, at the start location.
INSERT INTO trainers (account_id, name, gender, rival_name, map_id, x, y, facing)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (account_id) DO UPDATE
SET name = EXCLUDED.name,
    gender = EXCLUDED.gender,
    rival_name = EXCLUDED.rival_name,
    map_id = EXCLUDED.map_id,
    x = EXCLUDED.x,
    y = EXCLUDED.y,
    facing = EXCLUDED.facing,
    play_time_seconds = 0,
    created_at = now()
RETURNING name, gender, play_time_seconds, map_id, x, y, facing, created_at;

-- name: UpdateTrainerLocation :execrows
-- Copies a live position from Redis; only into the save it belongs to.
UPDATE trainers
SET map_id = $2, x = $3, y = $4, facing = $5
WHERE account_id = $1 AND created_at = $6;
