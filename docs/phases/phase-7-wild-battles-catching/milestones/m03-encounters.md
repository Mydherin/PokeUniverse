# M3 Encounters on the Map 🟡

Part of [Phase 7](../phase-7-wild-battles-catching.md). **Needs:** M2. Rules: [context.md](context.md) D1, D3, D4, D7, D8; [lead abilities](context.md#gen-4-rules-used-by-several-milestones).

**Done when:** walking in the test grass starts wild battles at FireRed's rate, Repel, the flutes, the Cleanse Tag, Pure Incense and the lead's ability change it as the rules say, Sweet Scent works from the party menu, and the grass rustles under the player. The battle that starts may still use the trainer screen's look (M6 makes it wild).

## Resume Here

**Server done, client next** (2026-11-09). `mic-core` builds and vets (Go isn't on the host: `docker run --rm -v "$PWD":/repo -v pokeuniverse-go-mod:/go/pkg/mod -v pokeuniverse-go-build:/root/.cache/go-build -w /repo/mic-core golang:1.27-alpine sh -c 'go build ./... && go vet ./...'` from the repo root); `make contracts` and `make text` ran (678 strings). No client edit yet; nothing played yet.

Next steps, in order (all in `spa-pokeuniverse/src/game/firered/`; the client typechecks with the project's usual TS build):

1. **Wild battle step** in `overworld.ts`: `runScript` (~891) gets a `wildBattle` case copied from `trainerBattle` (~932: `s.battling = true; this.message.hide(); this.flow.link.scriptBattle(s.id)`), sent only once the avatar's current step has ended (check `avatar` for a moving flag). `run()` (~745) also calls `prepareBattle` when a step is `wildBattle`. Win/loss reuse `afterBattle` / `leaveBattle` (~446-460).
2. **Sweet Scent** (`FieldMoveOutcome.SWEET_SCENT`): `party-menu.ts` `useFieldMove` (~1478) closes the menu to the field without the START menu (FireRed: `FieldCallback_PrepareFadeInFromMenu`) instead of `refuseFieldMove`. The menu is opened by `overworld.ts` `openScreen` (~870, `back(withMenu=false)` → `enter(false)`); the answer arrives in `fieldMoveResult` (~393) through `askFieldMove` (~534). In `overworld.ts`, a pending Sweet Scent holds the Script the server sends right after (`run()` would otherwise run it while `away`: `frame()` runs scripts before its `away` check, ~780-788). Once back on the field: `FldEff_SweetScent` (`src/fldeff_sweetscent.c`): `se_m_sweet_scent`, `beginFade` of every palette except the player sprite's, delay 4, 0→8 toward `RGB(31,0,0)`; wait until done, then 64 frames; with a `wildBattle` step run the script (the battle starts from the pink field); else fade 8→0, then run the script (the sign message). `CreateFieldEffectShowMon` (the Pokémon's cut-in) is left for Phase 12 with the HMs' field effects: add it to the phase index as an open item aimed at 12 when closing this step. Check `se_m_sweet_scent` is in `make audio`'s list.
3. **Grass rustle**: `FLDEFF_TALL_GRASS` (`FldEff_TallGrass` in `src/field_effect_helpers.c`, art in `graphics/field_effects/`, `make graphics` copies it), over the player's feet on entering a `tall_grass` cell, also the follower's.
4. **Messages**: REPEL and flute messages already exist (`item-messages.ts`); `common.repel_wore_off` and `common.sweet_scent_nothing` come as sign messages in server scripts (`WORLD_TEXTS` in `manifest.ts`).
5. **Play It** below (`make up`), then mark M3 done: milestone ✅, phase file M3 row and Resume Here → M4, `AGENTS.md` **Now** → M4, `index.md` (Current, 3 / 8, O4 Cleanse Tag / Pure Incense part and O5 Sweet Scent part closed).

Built so far (what the next steps use):

- `mic-core/internal/encounter/step.go`: `State` (`Step`, `Reset`), `Field` (flute, bike, Repel, sandstorm/hail), `FieldMod`, `SweetScent`, `RepelLevel`. `Options.SweetScent` in `encounter.go` skips Intimidate / Keen Eye.
- `mic-core/internal/world/encounter.go`: `stepped` (called at the end of `zone.move`: warp cell → nothing; Repel −1, at 0 saved + sign message `common.repel_wore_off` and no roll; then `encounter.Step`), `sweetScent`, `meetWild` (a script with one `wild_battle` step; `p.wild` holds the Pokémon), `startScript` (server-started script), `clearFlute`, `terrain`, `wildTransition`.
- `world/battle.go`: `ScriptBattle` → `startWild` when `p.wild` is set (seen saved first, `battle.NewWildStart` in `battle/team.go`), shared tail `launch` (resets the encounter state for every battle); `withStart` replaces `withTrainer` (trainer, terrain, wild transition, kind on a resume).
- `world/warp.go` `arrive`: encounter reset, flutes cleared and saved (`ClearTempFieldEventData` on warp and connection loads). `world.go` `Leave`: item state saved (Repel steps). `ScriptDone` clears `p.wild`.
- `party.go` `useFieldMove`: Sweet Scent answers `SWEET_SCENT`, then `z.sweetScent` sends its script (battle or `common.sweet_scent_nothing`).
- Contracts: `ScriptStep.wild_battle` (9), `FieldMoveOutcome.SWEET_SCENT` (8), `BattleTerrain` and `BattleTransition` enums in `battle/v1/view.proto`, `StartBattle.terrain` / `wild_transition` (6, 7), `BattleView.terrain` / `wild_transition` (8, 9).
- Text: `infra/text/extract.mjs` reads `data/scripts/repel.inc` and `field_moves.inc`; `Text_RepelWoreOff`, `Text_LooksLikeNothingHere` in `texts.json` and `manifest.ts` (`common.repel_wore_off`, `common.sweet_scent_nothing`).

Decisions: Repel steps live in memory per step, saved when they wear off and on leaving (not every step, like the friendship counter). `MAX_ENCOUNTER_RATE` is 1600 (checked). Repel use, flute use and their messages were already built (`item/use.go`, `item-messages.ts`). The follower needs nothing (no battle-specific code). Our maps have no long grass, deep water behaviors, ocean/underwater map types: `terrain` covers the rest.

## Tasks

### Step check (`mic-core/internal/encounter/`, called from the step)

- [x] Per player state in memory (D8): `stepsSinceLast`, `rateBuff`, `prevBehavior`; reset on a battle and on `SeedWildEncounterRng`'s callers (map change: check `ResetEncounterRateModifiers` 701 callers).
- [x] `TryStandardWildEncounter` (757) → `HandleWildEncounterCooldown` (707): minimum steps from the map's rate (`GetMapBaseEncounterCooldown` 673: 0 at rate ≥ 80, 8 below 10, else `8 − rate/10`), 5% per extra step, both scaled by flutes, Cleanse Tag and the rate abilities (FireRed's `GetAbilityEncounterRateModType` has Stench and Illuminate; Gen 4's list replaces it, D3).
- [x] `StandardWildEncounter` (355): land or water cell with a table; a new behavior than last step passes only 60% (`DoGlobalWildEncounterDiceRoll`); `DoWildEncounterRateTest` (309): `rate·16`, ×0.8 on a bike (no bike yet: keep the branch), `+ buff·16/200`, flutes (White ×1.5, Black ×½), Cleanse Tag / Pure Incense ×2/3 on the lead's held item, abilities, capped at 1600 (`MAX_ENCOUNTER_RATE`), then the roll. Misses add the rate to the buff (`AddToWildEncounterRateBuff` 778: reset to 0 while a Repel is active).
- [x] Roamers: skipped (Phase 12), keep the order of checks so they slot in.
- [x] Repel's level test and Intimidate / Keen Eye's skip both mean no battle and a buff step, as FireRed.

### Field items and moves

- [x] **Repel** (`FIELD_USE_REPEL`, Super / Max Repel): steps saved on the trainer (`trainers.repel_steps` already existed, Phase 4; D8), `UpdateRepelCounter` (576) on every step; at 0 the field message "REPEL's effect wore off…" (`EventScript_RepelWoreOff`: grep it in `data/scripts/`; FireRed asks nothing more). Using one while active: FireRed's `ItemUseOutOfBattle_Repel` text ("But the effects of a REPEL lingered from earlier."); find both strings in `data/text/` for `make text`.
- [x] **White / Black Flute** (`FIELD_USE_BLACK_WHITE_FLUTE`): `ItemUseOutOfBattle_BlackWhiteFlute` sets `FLAG_SYS_WHITE_FLUTE_ACTIVE` / `BLACK`; grep where FireRed clears them (map change?) and copy that lifetime; its messages and sound.
- [ ] **Sweet Scent** from the party menu (server done; the client's fade left) (Phase 6 M5 refused it): `SweetScentWildEncounter` (464) on a land or water cell with a table starts a battle with no rate roll and no Repel check; otherwise "Looks like there's nothing here…". The screen's pink fade (`FLDEFF_SWEET_SCENT`, grep `sweet_scent` in `src/`). Update Phase 6 M5's refusal list. M2's `encounter.Generate` needs a Sweet Scent flag: Intimidate / Keen Eye never skip there (HGSS `DoesAbilitySuppressEncounter` 1145); call it with `RepelLevel: 0`.

### Starting the battle (`mic-core/internal/world/battle.go`)

- [x] `startWild`: lock the player (as `startBattle`), build `BattleStart` with `kind: WILD`, side 1 = the wild Pokémon (no AI flags, no trainer), the player's party, the active battle in Redis; mark the species seen at the start (FireRed sets seen when it appears: find the call, grep `FLAG_SET_SEEN` in `src/battle_*.c`).
- [x] Contracts: `BattleStart.terrain` and `BattleView.terrain` (`BattleTerrain` enum with FireRed's 0-9), computed by `mic-core` from the cell and map type as `BattleSetup_GetTerrainId` (466); `BattleView.wild_transition` (FireRed's `GetBattleTransitionTypeByMap` 517 + `GetWildBattleTransition` 612: wild level < first healthy party member's level picks column 0). Needs the map type in `ServerMap` (check it's there).
- [x] The follower during a wild battle as during a trainer battle (Phase 6 M9).

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
