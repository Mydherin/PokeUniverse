-- +goose Up
-- Steps toward the next walking friendship (Gen 4 keeps them in the save).
ALTER TABLE trainers
    ADD COLUMN friendship_steps smallint NOT NULL DEFAULT 0 CHECK (friendship_steps >= 0);

-- +goose Down
ALTER TABLE trainers DROP COLUMN friendship_steps;
