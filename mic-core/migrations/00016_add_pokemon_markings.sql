-- +goose Up
-- MARK in BILL'S PC: FireRed's four marks (●, ■, ▲, ♥), one bit each from bit 0.
ALTER TABLE trainer_pokemon
    ADD COLUMN markings smallint NOT NULL DEFAULT 0 CHECK (markings BETWEEN 0 AND 15);

-- +goose Down
ALTER TABLE trainer_pokemon DROP COLUMN markings;
