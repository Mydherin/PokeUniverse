-- name: ListTrainerPokemon :many
-- The party, in order.
SELECT slot, species, nickname, level, exp, personality, ivs, evs, ability_slot, held_item,
       moves, pp, pp_ups, hp, status, friendship, ball, ot_name, ot_id, ot_gender, met_level, met_map
FROM trainer_pokemon
WHERE account_id = $1
ORDER BY slot;

-- name: DeleteTrainerPokemon :exec
-- The party emptied: before it's written again, and by New Game.
DELETE FROM trainer_pokemon
WHERE account_id = $1;

-- name: InsertTrainerPokemon :exec
INSERT INTO trainer_pokemon (account_id, slot, species, nickname, level, exp, personality, ivs, evs, ability_slot, held_item,
                             moves, pp, pp_ups, hp, status, friendship, ball, ot_name, ot_id, ot_gender, met_level, met_map)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23);
