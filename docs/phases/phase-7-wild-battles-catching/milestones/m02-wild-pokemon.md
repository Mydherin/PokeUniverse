# M2 Making a Wild Pokémon ⬜

Part of [Phase 7](../phase-7-wild-battles-catching.md). **Needs:** M1. Rules: [context.md](context.md) D3, D4, D5; [lead abilities](context.md#gen-4-rules-used-by-several-milestones).

**Done when:** `mic-core` turns a map's table and an encounter kind into a wild Pokémon exactly as FireRed's slot and level choice, with Gen 4 lead abilities, random IVs, nature, gender, ability, shiny and held item, ready to start a battle.

## Resume Here

**Not started.** First step: read `pokemon.Create` (`mic-core/internal/pokemon/pokemon.go` ~44) and how personality sets nature, gender, ability and shiny (Phase 5 M2); then write `internal/encounter/`.

## Tasks

### `mic-core/internal/encounter/` (new package)

- [ ] `Kind`: land, water, rock smash, old / good / super rod.
- [ ] `ChooseSlot(kind)`: FireRed's `ChooseWildMonIndex_Land` (71), `_WaterRock` (101), `_Fishing` (117) with M1's chances.
- [ ] `ChooseLevel(slot)`: `ChooseWildMonLevel` (155): min/max swapped if reversed, uniform.
- [ ] `Generate(table, kind, lead, rng) (*pokemon.Pokemon, ok)`: `TryGenerateWildMon` (269) with `WILD_CHECK_REPEL` (Repel's level test comes from M3 as an argument: `IsWildLevelAllowedByRepel` 601 compares with the **first healthy, non-egg** party member, not the lead slot).
- [ ] Gen 4 lead effects (lead = party slot 0, even fainted, as Gen 4; check in `pokeheartgold`, grep `ABILITY_SYNCHRONIZE`, `ABILITY_CUTE_CHARM`, `ABILITY_MAGNET_PULL`, `ABILITY_INTIMIDATE` in `src/`): Synchronize, Cute Charm, Compound Eyes, Hustle / Pressure / Vital Spirit, Intimidate / Keen Eye (skips the encounter: no battle that step), Static / Magnet Pull (re-picks among the slots of that type, only if one exists). Write each one's file and line here once found.

### `mic-core/internal/pokemon/`

- [ ] `CreateWild(species, level, opts)`: personality random (or rerolled for Synchronize's nature and Cute Charm's gender, as Gen 4 does: find whether it rerolls the personality or picks it), IVs random 0-31 each, ability from the personality's bit among the species' abilities, shiny from trainer ID / secret ID and personality (1/8192), EVs 0, friendship = species base, moves = the four latest level moves (`default moves`, already used by `Create`), held item 50% common / 5% rare (60% / 20% with Compound Eyes; a species with both the same item always holds it, check `GenerateWildMon`). Unown's letter: Phase 12 (Tanoby), any letter now.
- [ ] Caught data fields are filled at catch time (M5), not here.

### Rods and Rock Smash (D4)

- [ ] `encounter.Fishing(rod)` and `encounter.RockSmash()` callable from the map code, no caller yet (Phase 12): `FishingWildEncounter` (519) has no Repel check; `RockSmashWildEncounter` (446) ignores abilities in the rate test and checks Repel.

## Check It

No test suites (AGENTS.md). A throwaway `zz_check.go` (deleted before commit) generating 10,000 Pokémon from the test table: slot shares within a point of FireRed's, levels in range, ~1/8192 shiny with a forced personality, held item shares, each lead ability's effect on its share. Write the numbers here.

## Gotchas

- FireRed's own encounter RNG (`WildEncounterRandom`) only rolls the rate; slot and level use `Random()`. Ours is one server RNG (D1).
