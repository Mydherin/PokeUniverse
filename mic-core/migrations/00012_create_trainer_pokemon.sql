-- +goose Up
-- The party (plans/battles M2): up to six Pokémon in the player's order, saved in one
-- transaction per change. Numbers are lib-contracts' enums (species, items, moves, status);
-- stats, gender, nature, shiny and the ability come from the species and the personality.
-- IVs and EVs in FireRed's stat order (HP, ATTACK, DEFENSE, SPEED, SP. ATK, SP. DEF); moves with
-- their PP and PP UPs in parallel arrays. New Game empties it in its transaction.
CREATE TABLE trainer_pokemon (
    account_id   bigint     NOT NULL REFERENCES trainers (account_id) ON DELETE CASCADE,
    slot         smallint   NOT NULL CHECK (slot BETWEEN 0 AND 5),
    species      smallint   NOT NULL CHECK (species > 0),
    nickname     text       NOT NULL DEFAULT '',
    level        smallint   NOT NULL CHECK (level BETWEEN 1 AND 100),
    exp          integer    NOT NULL CHECK (exp >= 0),
    personality  bigint     NOT NULL CHECK (personality BETWEEN 0 AND 4294967295),
    ivs          smallint[] NOT NULL CHECK (cardinality(ivs) = 6),
    evs          smallint[] NOT NULL CHECK (cardinality(evs) = 6),
    ability_slot smallint   NOT NULL CHECK (ability_slot IN (0, 1)),
    held_item    smallint   NOT NULL DEFAULT 0,
    moves        smallint[] NOT NULL CHECK (cardinality(moves) BETWEEN 1 AND 4),
    pp           smallint[] NOT NULL CHECK (cardinality(pp) = cardinality(moves)),
    pp_ups       smallint[] NOT NULL CHECK (cardinality(pp_ups) = cardinality(moves)),
    hp           smallint   NOT NULL CHECK (hp >= 0),
    status       smallint   NOT NULL DEFAULT 0,
    friendship   smallint   NOT NULL CHECK (friendship BETWEEN 0 AND 255),
    ball         smallint   NOT NULL,
    ot_name      text       NOT NULL,
    ot_id        bigint     NOT NULL CHECK (ot_id BETWEEN 0 AND 4294967295),
    ot_gender    text       NOT NULL CHECK (ot_gender IN ('boy', 'girl')),
    met_level    smallint   NOT NULL CHECK (met_level BETWEEN 0 AND 100),
    -- A lib-maps map; empty: a fateful encounter.
    met_map      text       NOT NULL DEFAULT '',
    PRIMARY KEY (account_id, slot)
);

-- +goose Down
DROP TABLE trainer_pokemon;
