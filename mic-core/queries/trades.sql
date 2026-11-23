-- name: InsertTrade :execrows
-- The swap's record, in its transaction: 0 rows when this trade ID was applied already (phase-9 D23).
INSERT INTO trades (id, leader, member, leader_slot, member_slot)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (id) DO NOTHING;
