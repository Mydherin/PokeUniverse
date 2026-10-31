-- name: GetTrainer :one
SELECT name, gender, play_time_seconds
FROM trainers
WHERE account_id = $1;

-- name: PutTrainer :one
-- New Game: the account's trainer, replaced if it already has one.
INSERT INTO trainers (account_id, name, gender, rival_name)
VALUES ($1, $2, $3, $4)
ON CONFLICT (account_id) DO UPDATE
SET name = EXCLUDED.name,
    gender = EXCLUDED.gender,
    rival_name = EXCLUDED.rival_name,
    play_time_seconds = 0,
    created_at = now()
RETURNING name, gender, play_time_seconds;
