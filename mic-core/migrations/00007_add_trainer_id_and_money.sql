-- +goose Up
-- The Trainer Card's data (Phase 4). trainer_id is FireRed's 32-bit trainer ID, random per New
-- Game: its low 16 bits are the ID No. shown, the high 16 the secret ID. Money starts at 3000, as
-- in FireRed, up to its 999999 cap. Existing trainers get a random ID and the starting money.
ALTER TABLE trainers
    ADD COLUMN trainer_id bigint  NOT NULL DEFAULT floor(random() * 4294967296)::bigint CHECK (trainer_id BETWEEN 0 AND 4294967295),
    ADD COLUMN money      integer NOT NULL DEFAULT 3000 CHECK (money BETWEEN 0 AND 999999);
ALTER TABLE trainers ALTER COLUMN trainer_id DROP DEFAULT;

-- +goose Down
ALTER TABLE trainers DROP COLUMN trainer_id, DROP COLUMN money;
