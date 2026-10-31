-- +goose Up
-- The rival's name, chosen in Oak's speech (Phase 3).
ALTER TABLE trainers ADD COLUMN rival_name text NOT NULL DEFAULT '';
ALTER TABLE trainers ALTER COLUMN rival_name DROP DEFAULT;

-- +goose Down
ALTER TABLE trainers DROP COLUMN rival_name;
