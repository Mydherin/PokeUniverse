-- name: InsertBattleOutcome :execrows
-- Marks a battle's outcome applied, inside its transaction; 0 rows: it already was.
INSERT INTO battle_outcomes (battle_id, account_id, result, money)
VALUES ($1, $2, $3, $4)
ON CONFLICT (battle_id) DO NOTHING;

-- name: BattleOutcomeApplied :one
SELECT EXISTS (SELECT 1 FROM battle_outcomes WHERE battle_id = $1);
