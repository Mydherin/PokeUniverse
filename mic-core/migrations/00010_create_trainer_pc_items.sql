-- +goose Up
-- The items stored in the player's PC (Phase 4): in the player's order, one slot per item (by
-- FireRed's item ID), 30 at most.
CREATE TABLE trainer_pc_items (
    account_id bigint   NOT NULL REFERENCES trainers (account_id) ON DELETE CASCADE,
    slot       smallint NOT NULL CHECK (slot BETWEEN 0 AND 29),
    item       smallint NOT NULL CHECK (item > 0),
    quantity   smallint NOT NULL CHECK (quantity BETWEEN 1 AND 999),
    PRIMARY KEY (account_id, slot),
    UNIQUE (account_id, item)
);

-- Every trainer so far gets the PC a New Game starts with (item.StartingPC): one POTION (13).
INSERT INTO trainer_pc_items (account_id, slot, item, quantity)
SELECT account_id, 0, 13, 1 FROM trainers;

-- +goose Down
DROP TABLE trainer_pc_items;
