-- +goose Up
-- The way the trainer faces (Phase 4), saved with the location. New Game faces north, as FireRed
-- turns the player north on first entering the room.
ALTER TABLE trainers
    ADD COLUMN facing text NOT NULL DEFAULT 'north' CHECK (facing IN ('north', 'south', 'west', 'east'));
ALTER TABLE trainers ALTER COLUMN facing DROP DEFAULT;

-- +goose Down
ALTER TABLE trainers DROP COLUMN facing;
