-- name: ListTrainerItems :many
-- The bag: every pocket's items in the player's order.
SELECT pocket, slot, item, quantity
FROM trainer_items
WHERE account_id = $1
ORDER BY pocket, slot;

-- name: DeleteTrainerItems :exec
-- New Game: the bag emptied (FireRed starts with an empty bag).
DELETE FROM trainer_items
WHERE account_id = $1;

-- name: DeleteTrainerPocket :exec
DELETE FROM trainer_items
WHERE account_id = $1 AND pocket = $2;

-- name: InsertTrainerPocket :exec
-- A pocket's items, slot i holding items[i] × quantities[i].
INSERT INTO trainer_items (account_id, pocket, slot, item, quantity)
SELECT @account_id::bigint, @pocket::smallint, (generate_subscripts(@items::smallint[], 1) - 1)::smallint,
       unnest(@items::smallint[]), unnest(@quantities::smallint[]);

-- name: UpdateTrainerItemState :execrows
-- What items keep besides the bag; only into the save it belongs to (created_at).
UPDATE trainers
SET registered_item = $2, repel_steps = $3, flute = $4, coins = $5, berry_powder = $6
WHERE account_id = $1 AND created_at = $7;

-- name: ListTrainerPcItems :many
-- What the PC stores, in the player's order.
SELECT item, quantity
FROM trainer_pc_items
WHERE account_id = $1
ORDER BY slot;

-- name: DeleteTrainerPcItems :exec
DELETE FROM trainer_pc_items
WHERE account_id = $1;

-- name: InsertTrainerPcItems :exec
-- The PC's items, slot i holding items[i] × quantities[i].
INSERT INTO trainer_pc_items (account_id, slot, item, quantity)
SELECT @account_id::bigint, (generate_subscripts(@items::smallint[], 1) - 1)::smallint,
       unnest(@items::smallint[]), unnest(@quantities::smallint[]);
