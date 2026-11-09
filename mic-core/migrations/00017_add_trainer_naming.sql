-- +goose Up
-- The Pokémon just caught whose nickname is still asked (phase-7 D10): box 0 = the party, 1-14 a
-- box; NULL when none. Saved with the catch, cleared by the answer; a restart asks again.
ALTER TABLE trainers
    ADD COLUMN naming_box smallint CHECK (naming_box BETWEEN 0 AND 14),
    ADD COLUMN naming_slot smallint CHECK (naming_slot >= 0),
    ADD CONSTRAINT trainers_naming_check CHECK ((naming_box IS NULL) = (naming_slot IS NULL));

-- +goose Down
ALTER TABLE trainers DROP CONSTRAINT trainers_naming_check, DROP COLUMN naming_slot, DROP COLUMN naming_box;
