-- name: ListTrainerPokemon :many
-- The party, in order.
SELECT slot, species, nickname, level, exp, personality, ivs, evs, ability_slot, held_item,
       moves, pp, pp_ups, hp, status, friendship, ball, ot_name, ot_id, ot_gender, met_level, met_map
FROM trainer_pokemon
WHERE account_id = $1 AND box = 0
ORDER BY slot;

-- name: ListBoxPokemon :many
-- One box, by slot; it can have gaps.
SELECT slot, species, nickname, level, exp, personality, ivs, evs, ability_slot, held_item,
       moves, pp, pp_ups, hp, status, friendship, ball, ot_name, ot_id, ot_gender, met_level, met_map
FROM trainer_pokemon
WHERE account_id = $1 AND box = $2
ORDER BY slot;

-- name: CountBoxPokemon :many
-- How many Pokémon each box holds; an empty box has no row.
SELECT box, count(*) AS count
FROM trainer_pokemon
WHERE account_id = $1 AND box <> 0
GROUP BY box;

-- name: ListBoxSlots :many
-- The taken slots of every box, to find a free one.
SELECT box, slot
FROM trainer_pokemon
WHERE account_id = $1 AND box <> 0
ORDER BY box, slot;

-- name: ListTrainerBoxes :many
-- The boxes whose name or wallpaper changed.
SELECT box, name, wallpaper
FROM trainer_boxes
WHERE account_id = $1;

-- name: DeleteTrainerPokemon :exec
-- The party emptied, before it's written again. The boxes stay.
DELETE FROM trainer_pokemon
WHERE account_id = $1 AND box = 0;

-- name: ResetTrainerPokemon :exec
-- New Game: the party and every box.
DELETE FROM trainer_pokemon
WHERE account_id = $1;

-- name: ResetTrainerBoxes :exec
-- New Game: the boxes' names and wallpapers back to FireRed's.
DELETE FROM trainer_boxes
WHERE account_id = $1;

-- name: InsertTrainerPokemon :exec
INSERT INTO trainer_pokemon (account_id, box, slot, species, nickname, level, exp, personality, ivs, evs, ability_slot, held_item,
                             moves, pp, pp_ups, hp, status, friendship, ball, ot_name, ot_id, ot_gender, met_level, met_map)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24);
