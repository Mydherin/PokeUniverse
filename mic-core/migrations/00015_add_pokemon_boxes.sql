-- +goose Up
-- Phase 6 D6: a party and a box are the same row. Box 0 is the party (slots 0-5, no gaps), 1-14
-- are FireRed's boxes (slots 0-29, gaps allowed). Existing rows become party.
ALTER TABLE trainer_pokemon
    ADD COLUMN box smallint NOT NULL DEFAULT 0,
    DROP CONSTRAINT trainer_pokemon_slot_check,
    DROP CONSTRAINT trainer_pokemon_pkey,
    ADD CONSTRAINT trainer_pokemon_box_slot_check CHECK (
        (box = 0 AND slot BETWEEN 0 AND 5) OR (box BETWEEN 1 AND 14 AND slot BETWEEN 0 AND 29)
    ),
    ADD PRIMARY KEY (account_id, box, slot);
ALTER TABLE trainer_pokemon ALTER COLUMN box DROP DEFAULT;

-- A box's name and wallpaper, only once changed: no row is FireRed's default (BOX1, and the
-- wallpaper the box's number gives). New Game empties it in its transaction.
CREATE TABLE trainer_boxes (
    account_id bigint   NOT NULL REFERENCES trainers (account_id) ON DELETE CASCADE,
    box        smallint NOT NULL CHECK (box BETWEEN 1 AND 14),
    name       text     NOT NULL,
    wallpaper  smallint NOT NULL CHECK (wallpaper BETWEEN 0 AND 15),
    PRIMARY KEY (account_id, box)
);

-- The box the screen opens on, FireRed's StorageGetCurrentBox. A New Game goes back to BOX1.
ALTER TABLE trainers
    ADD COLUMN current_box smallint NOT NULL DEFAULT 1 CHECK (current_box BETWEEN 1 AND 14);

-- +goose Down
ALTER TABLE trainers DROP COLUMN current_box;
DROP TABLE trainer_boxes;
DELETE FROM trainer_pokemon WHERE box <> 0;
ALTER TABLE trainer_pokemon
    DROP CONSTRAINT trainer_pokemon_box_slot_check,
    DROP CONSTRAINT trainer_pokemon_pkey,
    DROP COLUMN box,
    ADD CONSTRAINT trainer_pokemon_slot_check CHECK (slot BETWEEN 0 AND 5),
    ADD PRIMARY KEY (account_id, slot);
