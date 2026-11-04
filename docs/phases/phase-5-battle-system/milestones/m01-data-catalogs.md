# M0 Prerequisites + M1 Data Catalogs ✅

Part of [Phase 5](../phase-5-battle-system.md). Finished 2026-11-01. What later milestones can use, without re-reading:

- **Showdown reference:** `references/pokemon-showdown` checked out (read only).
- **Catalogs (committed, D7), edited by hand from now on** (`infra/battle/catalog.mjs` was run once; re-running needs the old species catalog):
  - `move/v1/catalog.proto`: `Move` 1-467 (FireRed's names, e.g. `MOVE_FAINT_ATTACK`), `MoveInfo{type, category, power (0 = varies/none), accuracy (0 = never misses), pp, priority, target, flags (36 `MoveFlag`s), effect_chance, crit_stage}`, option extension 50002.
  - `ability/v1/catalog.proto`: `Ability` 1-123 (official numbers).
  - `pokemon/v1/stats.proto`: `Stat`, `Stats` (FireRed's order HP, ATK, DEF, SPEED, SPATK, SPDEF); `nature.proto`: `Nature` = FireRed's + 1, `NatureInfo{raised, lowered}` option 50003.
  - `species/v1/catalog.proto` `SpeciesInfo` 5-13: base stats, abilities, gender ratio (FireRed's byte), growth rate (FireRed's + 1), catch rate, base exp, EV yield, base friendship, `level_moves[{level, move number}]` (Gen 4 level-up).
  - `item/v1/catalog.proto` `ItemInfo.move` (8): the move a TM/HM teaches.
- **`mic-battles/src/engine/ids.ts`:** `SPECIES`, `MOVES`, `ABILITIES`, `NATURES` (index = our number → Showdown ID), `ITEMS` (our item → Showdown ID; 106 FireRed items, the rest have no battle effect).
- **Text (D8):** `make text` writes `moves.json`, `abilities.json`, `natures.json` (needs the expansion). Client: `Assets.moveName/moveDescription`, `world/moves.ts` (`moveInfo`, `tmMove`).
- **Art:** `make pokemon` writes `<nnn>/back.png`, `<nnn>/shiny.pal` and `coords: [front y, back y, enemy elevation]` in `species.json`.
