-- name: GetTrainer :one
SELECT name, gender, play_time_seconds, map_id, x, y
FROM trainers
WHERE account_id = $1;

-- name: PutTrainer :one
-- New Game: the account's trainer, replaced if it already has one, at the start location.
INSERT INTO trainers (account_id, name, gender, rival_name, map_id, x, y)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (account_id) DO UPDATE
SET name = EXCLUDED.name,
    gender = EXCLUDED.gender,
    rival_name = EXCLUDED.rival_name,
    map_id = EXCLUDED.map_id,
    x = EXCLUDED.x,
    y = EXCLUDED.y,
    play_time_seconds = 0,
    created_at = now()
RETURNING name, gender, play_time_seconds, map_id, x, y;
