# M3 Encounters on the Map ⬜

Part of [Phase 7](../phase-7-wild-battles-catching.md). **Needs:** M2. Rules: [context.md](context.md) D1, D3, D4, D7, D8; [lead abilities](context.md#gen-4-rules-used-by-several-milestones).

**Done when:** walking in the test grass starts wild battles at FireRed's rate, Repel, the flutes, the Cleanse Tag, Pure Incense and the lead's ability change it as the rules say, Sweet Scent works from the party menu, and the grass rustles under the player. The battle that starts may still use the trainer screen's look (M6 makes it wild).

## Resume Here

**Not started.** First step: find where `mic-core` finishes a step (grep `func (z \*zone) step` or the movement handler in `world/`), and hook `encounter.Check` there.

## Tasks

### Step check (`mic-core/internal/encounter/`, called from the step)

- [ ] Per player state in memory (D8): `stepsSinceLast`, `rateBuff`, `prevBehavior`; reset on a battle and on `SeedWildEncounterRng`'s callers (map change: check `ResetEncounterRateModifiers` 701 callers).
- [ ] `TryStandardWildEncounter` (757) → `HandleWildEncounterCooldown` (707): minimum steps from the map's rate (`GetMapBaseEncounterCooldown` 673: 0 at rate ≥ 80, 8 below 10, else `8 − rate/10`), 5% per extra step, both scaled by flutes, Cleanse Tag and the rate abilities (FireRed's `GetAbilityEncounterRateModType` has Stench and Illuminate; Gen 4's list replaces it, D3).
- [ ] `StandardWildEncounter` (355): land or water cell with a table; a new behavior than last step passes only 60% (`DoGlobalWildEncounterDiceRoll`); `DoWildEncounterRateTest` (309): `rate·16`, ×0.8 on a bike (no bike yet: keep the branch), `+ buff·16/200`, flutes (White ×1.5, Black ×½), Cleanse Tag / Pure Incense ×2/3 on the lead's held item, abilities, capped at 2880 (`MAX_ENCOUNTER_RATE`: check), then the roll. Misses add the rate to the buff (`AddToWildEncounterRateBuff` 778: reset to 0 while a Repel is active).
- [ ] Roamers: skipped (Phase 12), keep the order of checks so they slot in.
- [ ] Repel's level test and Intimidate / Keen Eye's skip both mean no battle and a buff step, as FireRed.

### Field items and moves

- [ ] **Repel** (`FIELD_USE_REPEL`, Super / Max Repel): steps saved on the trainer (new column, migration; D8), `UpdateRepelCounter` (576) on every step; at 0 the field message "REPEL's effect wore off…" (`EventScript_RepelWoreOff`: grep it in `data/scripts/`; FireRed asks nothing more). Using one while active: FireRed's `ItemUseOutOfBattle_Repel` text ("But the effects of a REPEL lingered from earlier."); find both strings in `data/text/` for `make text`.
- [ ] **White / Black Flute** (`FIELD_USE_BLACK_WHITE_FLUTE`): `ItemUseOutOfBattle_BlackWhiteFlute` sets `FLAG_SYS_WHITE_FLUTE_ACTIVE` / `BLACK`; grep where FireRed clears them (map change?) and copy that lifetime; its messages and sound.
- [ ] **Sweet Scent** from the party menu (Phase 6 M5 refused it): `SweetScentWildEncounter` (464) on a land or water cell with a table starts a battle with no rate roll and no Repel check; otherwise "Looks like there's nothing here…". The screen's pink fade (`FLDEFF_SWEET_SCENT`, grep `sweet_scent` in `src/`). Update Phase 6 M5's refusal list. M2's `encounter.Generate` needs a Sweet Scent flag: Intimidate / Keen Eye never skip there (HGSS `DoesAbilitySuppressEncounter` 1145); call it with `RepelLevel: 0`.

### Starting the battle (`mic-core/internal/world/battle.go`)

- [ ] `startWild`: lock the player (as `startBattle`), build `BattleStart` with `kind: WILD`, side 1 = the wild Pokémon (no AI flags, no trainer), the player's party, the active battle in Redis; mark the species seen at the start (FireRed sets seen when it appears: find the call, grep `FLAG_SET_SEEN` in `src/battle_*.c`).
- [ ] Contracts: `BattleStart.terrain` and `BattleView.terrain` (`BattleTerrain` enum with FireRed's 0-9), computed by `mic-core` from the cell and map type as `BattleSetup_GetTerrainId` (466); `BattleView.wild_transition` (FireRed's `GetBattleTransitionTypeByMap` 517 + `GetWildBattleTransition` 612: wild level < first healthy party member's level picks column 0). Needs the map type in `ServerMap` (check it's there).
- [ ] The follower during a wild battle as during a trainer battle (Phase 6 M9).

### Client

- [ ] Tall grass rustle: `FLDEFF_TALL_GRASS` (grep `FldEff_TallGrass` in `src/field_effect_helpers.c`, its art in `graphics/field_effects/`): drawn over the player's feet when entering a `tall_grass` cell, also for the follower (HeartGold's follower does). `make graphics` copies its sheet.
- [ ] The REPEL and flute messages; Sweet Scent's fade and message.

## Play It

- Walk the test grass: battles come at a plausible rate (count steps over ~20 battles; write them here); none on the floor around it.
- Repel with a strong lead: no battles from lower-level slots; after its steps the message shows; a second Repel while active refuses.
- Black Flute fewer battles, White more; Cleanse Tag on the lead fewer; an Illuminate lead more (SQL on the test team, game closed).
- Sweet Scent in the grass starts a battle; outside it says nothing's there.

## Gotchas

- The step check runs on the server step, after the move is accepted: a correction or a warp step must not roll.
