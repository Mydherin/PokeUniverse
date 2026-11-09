# M2 Making a Wild Pokémon ✅

Part of [Phase 7](../phase-7-wild-battles-catching.md). **Needs:** M1. Rules: [context.md](context.md) D3, D4, D5; [lead abilities](context.md#gen-4-rules-used-by-several-milestones).

**Done when:** `mic-core` turns a map's table and an encounter kind into a wild Pokémon exactly as FireRed's slot and level choice, with Gen 4 lead abilities, random IVs, nature, gender, ability, shiny and held item, ready to start a battle.

## Resume Here

**Done 2026-11-09.** Next: [M3](m03-encounters.md). `mic-core` builds (`go build ./...`, `go vet` clean in `golang:1.27-alpine`); no caller yet (M3 calls `encounter.Generate`).

## Tasks

### `mic-core/internal/encounter/` (new package, `encounter.go`)

- [x] `Kind`: `Land`, `Water`, `RockSmashKind`, `OldRod`, `GoodRod`, `SuperRod`; `Kind.Table(w)` is the kind's table (nil when the map has none); a rod uses its part of the fishing table (old 0-1, good 2-4, super 5-9).
- [x] `ChooseSlot(kind, rng)`: FireRed's `ChooseWildMonIndex_*` with the chances of `wild_encounters.json` (land 20/20/10/10/10/10/5/5/4/4/1/1, water and Rock Smash 60/30/5/4/1, rods 70/30, 60/20/20, 40/40/15/4/1; all add to 100).
- [x] `ChooseLevel(slot, leadAbility, rng)`: `ChooseWildMonLevel`, min/max swapped if reversed, uniform; Hustle / Pressure / Vital Spirit 50% the highest.
- [x] `Generate(w, kind, Options{Lead, RepelLevel, Trainer}, rng) (*pokemon.Pokemon, bool)`: `TryGenerateWildMon` with Repel in HeartGold's order (`FieldSystem_GenerateRegularEncounter` 878): lead slot, level, Intimidate / Keen Eye skip, Repel (`level < RepelLevel`, 0 = no Repel; M3 passes the first healthy party member's level while Repel lasts), then `pokemon.CreateWild`.
- [x] Gen 4 lead effects, all in `references/pokeheartgold/src/field/encounter_check.c` (lead = party slot 0 even fainted, `EncounterGenState_Init` 1375; an egg lead has no ability):
  - Synchronize: `getWildMonNature` 734, 50% the lead's nature.
  - Cute Charm: `generateWildNonShinyAndAddToParty` 822, 2/3 the lead's opposite gender, only for a species that can be either; rolled before the nature.
  - Compound Eyes: `addGeneratedMonToBattleSetupParty` 1350 → `pokemon.c` `WildMonSetRandomHeldItem` 3741, odds `sItemOdds` 3736.
  - Hustle / Pressure / Vital Spirit: `EncounterSlot_WildMonLevelRoll` 742 (50% max level). **Difference:** HeartGold's land uses `ApplyAbilityEffectToSlotLevel` 1359 (picks the same species' higher slot, its slots have one level); FireRed's land slots have ranges, so every kind uses the level roll.
  - Intimidate / Keen Eye: `DoesAbilitySuppressEncounter` 1145: lead above level 5, wild ≤ lead − 5, 50% skip (not for Sweet Scent: M3 must not apply it there; `Generate` has no Sweet Scent flag yet, add one in M3).
  - Static / Magnet Pull: `EncounterSlot_AbilityInfluenceOnSlotChoiceCheck` 1112, `chooseAbilityCoercedSlot` 1089: 50%, a random slot of that type, only when some slots have it and some don't.
  - Rate abilities (`ApplyAbilityEffectToEncounterRate` 1119, cap 100) are M3's.

### `mic-core/internal/pokemon/` (`wild.go`)

- [x] `CreateWild(species, level, ot, WildOptions{Synchronize, CuteCharm, CompoundEyes}, rng)`: Gen 4's order (`CreateMonWithNature` 258, `CreateMonWithGenderNatureLetter` 266): gender roll (Cute Charm), nature (random or Synchronize), then a random personality **rerolled** until both match. IVs 0-31, EVs 0, ability from personality bit, shiny from `ot` (the player's trainer + secret ID, 1/8192), friendship and default moves via `Create`. Held item: Gen 4's odds, below 45 none, below 95 common, else rare (Compound Eyes 20 / 80); a species with both the same always holds it. Unown: any letter (Phase 12).
- [x] `pokemon.RNG` (`IntN`, `Uint32`; `*rand.Rand` fits) and `pokemon.ServerRNG` (math/rand/v2's global, D1).
- [x] Caught data (ball, met map, met level) set at catch time (M5); `Create` gives Poké Ball and met level = level for now.

### Rods and Rock Smash (D4)

- [x] `encounter.Fishing(w, rod, opts, rng)`: `FishingWildEncounter` (519), no Repel. Sticky Hold / Suction Cups (bite chance) wait for Phase 12.
- [x] `encounter.RockSmash(w, opts, mod, rng)`: `RockSmashWildEncounter` (446): rate ×16, `RateMod` (flutes, Cleanse Tag, M3 supplies it), cap `MAX_ENCOUNTER_RATE` 1600, no ability, then `Generate` with Repel.

## Check It

Throwaway `mic-core/cmd/zzcheck` (deleted), seeded RNG, test table (`pallet_town_players_house_1f`):

| What | Got | Expected |
|---|---|---|
| Land slots (1M) | 20.03 19.99 10.00 9.98 10.01 10.00 5.00 5.03 3.98 4.01 0.99 0.99 | FireRed's |
| Water, old / good / super rod (1M) | 60.0/29.9/5.0/4.0/1.0; 69.9/30.1; 60.0/20.0/20.0; 40.0/40.0/15.0/4.0/1.0 | FireRed's |
| Levels out of range (10k) / reversed 9-7 | 0 / 7, 8, 9 each ~33% | 0 / uniform |
| Shiny: forced personality / 400k random | true / 1/7843 | 1/8192 |
| Pikachu items; Compound Eyes; Snorlax | 45.7/49.2/5.1; 20.4/60.0/19.6; Leftovers 100% | 45/50/5; 20/60/20; 100% |
| Synchronize same nature | 52.0% (none 3.8%) | 52% |
| Cute Charm (female lead) male, 50/50 species | 83.4% (none 50.9%) | 83% |
| Hustle Rattata 2-3 at 3 | 74.4% (none 50.1%) | 75% |
| Intimidate / Keen Eye lv20 skip; lv5 | 42.4% / 42.4%; 0 | 42.5%; 0 |
| Static Electric; Magnet Pull Steel | 62.2% (none 24.2%); 57.8% (none 14.5%) | 62%; 57.5% |
| Repel at 10 skipped | 75.7%, min level 10 | 75.7% |

## Gotchas

- FireRed's own encounter RNG (`WildEncounterRandom`) only rolls the rate; slot and level use `Random()`. Ours is one server RNG (D1).
- Go isn't on the host: build with `docker run --rm -v "$PWD":/repo -v pokeuniverse-go-mod:/go/pkg/mod -v pokeuniverse-go-build:/root/.cache/go-build -w /repo/mic-core golang:1.27-alpine go build ./...` from the repo root.
- `pokemon.Party.Lead()` is the first healthy member (the follower), not the encounter lead: pass `party.At(0)` as `Options.Lead`.
