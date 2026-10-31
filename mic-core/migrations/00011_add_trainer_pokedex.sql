-- +goose Up
-- The trainer's Pokédex (pokedex/v1): whether they have it, the National Pokédex, and the species
-- seen and caught as bitsets (bit n-1 is species n). New Game resets them; Oak gives it (Phase 5).
ALTER TABLE trainers
    ADD COLUMN pokedex_obtained boolean NOT NULL DEFAULT false,
    ADD COLUMN pokedex_national boolean NOT NULL DEFAULT false,
    ADD COLUMN pokedex_seen     bytea   NOT NULL DEFAULT '',
    ADD COLUMN pokedex_caught   bytea   NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE trainers
    DROP COLUMN pokedex_obtained, DROP COLUMN pokedex_national, DROP COLUMN pokedex_seen, DROP COLUMN pokedex_caught;
