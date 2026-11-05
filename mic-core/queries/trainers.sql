-- name: GetTrainer :one
-- created_at identifies the save: a New Game replaces it, so live positions of the old save are ignored.
SELECT name, gender, play_time_seconds, map_id, x, y, facing, trainer_id, money, created_at,
       text_speed, battle_scene, battle_style, sound, button_mode, frame,
       registered_item, repel_steps, flute, coins, berry_powder, friendship_steps,
       pokedex_obtained, pokedex_national, pokedex_seen, pokedex_caught
FROM trainers
WHERE account_id = $1;

-- name: PutTrainer :one
-- New Game: the account's trainer, replaced if it already has one, at the start location, with a
-- new trainer ID, the starting money, the default options, no item effects and no Pokédex (the bag is
-- replaced in the same transaction).
INSERT INTO trainers (account_id, name, gender, rival_name, map_id, x, y, facing, trainer_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (account_id) DO UPDATE
SET name = EXCLUDED.name,
    gender = EXCLUDED.gender,
    rival_name = EXCLUDED.rival_name,
    map_id = EXCLUDED.map_id,
    x = EXCLUDED.x,
    y = EXCLUDED.y,
    facing = EXCLUDED.facing,
    trainer_id = EXCLUDED.trainer_id,
    money = DEFAULT,
    play_time_seconds = 0,
    text_speed = DEFAULT,
    battle_scene = DEFAULT,
    battle_style = DEFAULT,
    sound = DEFAULT,
    button_mode = DEFAULT,
    frame = DEFAULT,
    registered_item = DEFAULT,
    repel_steps = DEFAULT,
    friendship_steps = DEFAULT,
    current_box = DEFAULT,
    flute = DEFAULT,
    coins = DEFAULT,
    berry_powder = DEFAULT,
    pokedex_obtained = DEFAULT,
    pokedex_national = DEFAULT,
    pokedex_seen = DEFAULT,
    pokedex_caught = DEFAULT,
    created_at = now()
RETURNING name, gender, play_time_seconds, map_id, x, y, facing, trainer_id, money, created_at,
          text_speed, battle_scene, battle_style, sound, button_mode, frame,
          registered_item, repel_steps, flute, coins, berry_powder, friendship_steps,
          pokedex_obtained, pokedex_national, pokedex_seen, pokedex_caught;

-- name: UpdateTrainerLive :execrows
-- Copies a live position and play time from Redis; only into the save they belong to.
UPDATE trainers
SET map_id = $2, x = $3, y = $4, facing = $5, play_time_seconds = $6
WHERE account_id = $1 AND created_at = $7;

-- name: UpdateTrainerFriendshipSteps :exec
-- The walking friendship counter, saved on leaving; only into the save it belongs to.
UPDATE trainers SET friendship_steps = $2 WHERE account_id = $1 AND created_at = $3;

-- name: UpdateTrainerOptions :execrows
-- The OPTION menu's choices, saved as the menu closes.
UPDATE trainers
SET text_speed = $2, battle_scene = $3, battle_style = $4, sound = $5, button_mode = $6, frame = $7
WHERE account_id = $1;

-- name: GetTrainerCurrentBox :one
-- The box the storage screen opens on.
SELECT current_box
FROM trainers
WHERE account_id = $1;

-- name: UpdateTrainerCurrentBox :exec
UPDATE trainers
SET current_box = $2
WHERE account_id = $1 AND created_at = $3;

-- name: LockTrainerSave :one
-- Inside a transaction: the trainer's row locked, only while it's still the save `created_at`
-- (no rows: a New Game replaced it). Changes that touch no other trainer column check with it.
SELECT account_id
FROM trainers
WHERE account_id = $1 AND created_at = $2
FOR UPDATE;

-- name: UpdateTrainerMoney :execrows
-- Money after a battle; only into the save it belongs to.
UPDATE trainers
SET money = $2
WHERE account_id = $1 AND created_at = $3;

-- name: UpdateTrainerPokedex :execrows
-- Species seen and caught, after a battle or an evolution; only into the save they belong to.
UPDATE trainers
SET pokedex_seen = $2, pokedex_caught = $3
WHERE account_id = $1 AND created_at = $4;
