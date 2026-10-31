-- +goose Up
-- Where the trainer is (Phase 4): a map and a tile. Existing trainers start where New Game does.
ALTER TABLE trainers
    ADD COLUMN map_id text    NOT NULL DEFAULT 'pallet_town_players_house_2f',
    ADD COLUMN x      integer NOT NULL DEFAULT 6 CHECK (x >= 0),
    ADD COLUMN y      integer NOT NULL DEFAULT 6 CHECK (y >= 0);
ALTER TABLE trainers
    ALTER COLUMN map_id DROP DEFAULT,
    ALTER COLUMN x DROP DEFAULT,
    ALTER COLUMN y DROP DEFAULT;

-- +goose Down
ALTER TABLE trainers DROP COLUMN map_id, DROP COLUMN x, DROP COLUMN y;
