-- name: GetTrainer :one
SELECT name, gender, play_time_seconds
FROM trainers
WHERE account_id = $1;
