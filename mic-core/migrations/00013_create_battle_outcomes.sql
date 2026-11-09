-- +goose Up
-- Battle outcomes applied (plans/battles M6): one row per battle, written in the outcome's
-- transaction, so a retried or resumed outcome is applied once.
CREATE TABLE battle_outcomes (
    battle_id  uuid        PRIMARY KEY,
    account_id bigint      NOT NULL REFERENCES trainers (account_id) ON DELETE CASCADE,
    -- battle.v1.BattleResult for the player's side.
    result     smallint    NOT NULL,
    -- Money won (positive) or lost (negative).
    money      integer     NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE battle_outcomes;
