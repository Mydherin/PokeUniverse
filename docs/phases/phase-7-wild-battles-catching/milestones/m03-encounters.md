# M3 Encounters on the Map ✅

Part of [Phase 7](../phase-7-wild-battles-catching.md). **Needs:** M2. Rules: [context.md](context.md) D1, D3, D4, D7, D8; [lead abilities](context.md#gen-4-rules-used-by-several-milestones).

**Done when:** walking in the test grass starts wild battles at FireRed's rate, Repel, the flutes, the Cleanse Tag, Pure Incense and the lead's ability change it as the rules say, Sweet Scent works from the party menu, and the grass rustles under the player. The battle that starts may still use the trainer screen's look (M6 makes it wild).

## Resume Here

**Done** (2026-11-09). Code committed (`be2ebc4`, `8004ea9`); Play It passed with no bugs. Next: [M4](m04-wild-battle-rules.md). The test team was restored from the pre-Play-It backup (account 2's Pokémon and items; `flute = 'none'`, `repel_steps = 0`).

How to drive the game from the built-in browser (pane hidden: JS key events, canvas capture, starting the game when the page doesn't render): the shared notes folder's `m3-playit-helpers.md`.

Play It results:

- ✅ **Rate:** 19 battles in 152 steps in the test grass (13, 4, 6, 12, 4, 10, 6, 6, 11, 10, 10, 12, 6, 6, 6, 9, 7, 6, 8) = 8.0 steps per battle; none in 150 steps on the floor around it. Species and levels from the test table (Caterpie 2-3, Pidgey, Skarmory 20, Snorlax 42…); the battles still use the trainer look ("sent out CATERPIE!", M6).
- ✅ **Rates by the server code** (temporary `go run` over `encounter.State.Step` with the test table, 400 000 steps each, deleted): plain 7.9, Black Flute 16.2, White Flute 4.1, Cleanse Tag 10.7, Pure Incense 10.7, Illuminate lead 3.4 steps per battle; Repel with a Lv50 lead: none (table tops at 42); Repel with a Lv5 lead: lowest level met 5. `cooldown` checked line by line against `HandleWildEncounterCooldown`.
- ✅ **Repel:** `repel_steps = 3` by SQL: 3 steps without battles, then "REPEL's effect wore off…"; REPEL from the bag: "AA used the REPEL." (stays in the bag, ×2 → ×1); a second one: "But the effects of a REPEL lingered…"; 70 steps in the grass under it with the Lv50 lead: no battles; `repel_steps` saved 30 on leaving.
- ✅ **Grass rustle:** blades over the feet of the player and the follower in the grass, none off it; spawned standing in the grass shows it at rest.
- ✅ **Sweet Scent:** in the grass (1F (11,6)): red fade with the player and the grass at their feet unfaded (the follower fades), then a wild battle (Snorlax Lv42). Off the grass ((11,3)): the red fades in and back, then "Looks like there's nothing here…".
- ✅ **Flutes in play:** White Flute 3, 3, 4, 4, 5 steps per battle (~4); Black Flute 12, 19, 18 (~16).
- RUN in a wild battle does nothing yet (refused in `choices.ts`): M4's task, not a bug; the Play It battles were won with FIGHT.
- No bugs found. The fainting lead mid-run was the test's own (no healing between 19 battles).

Client (all in `spa-pokeuniverse/src/game/firered/`):

- `overworld.ts`: `runScript`'s `wildBattle` case shares `trainerBattle`'s, but waits while `avatar.action` is set (the step into the grass ends first); `run()` calls `prepareBattle` for it too. `afterBattle` goes on after `WON` or `RAN` (a wild script ends with `scriptDone`, which clears `p.wild`).
- Sweet Scent: `party-menu.ts` closes on `SWEET_SCENT`; `overworld.ts` `fieldMoveResult` sets `sweetScent` (`phase` menu → red → back), `openScreen`'s back skips the START menu then, `run()` holds the script that follows, `runSweetScent` (called in `frame()` while not `away`, the player locked) plays `se_m_sweet_scent` (added to `NEW_GAME_SOUNDS` in `manifest.ts`), fades `PALETTES_ALL` 0→8 toward `rgb(31,0,0)` with delay 4, waits 64 frames, then runs a `wildBattle` script from the red field or fades back 8→0 first. The player stays out of the fade: `CharacterView.setOverFade` (`world/view.ts`, `scene.ts` depth 5 over the fade rectangle), `PlayerSprite.overFade`; cleared in `showBattle`, and `endScript` fades back if the battle never started. Offline (the script never comes) it fades back with nothing.
- Grass rustle: `tall-grass.ts` (`TallGrass`: `enter(walker, x, y, spawned)`, `forget`, `update`), one blade per step into a `TALL_GRASS` cell, frames 1-4 then 0, 10 frames each; spawned = at rest. A blade goes when its walker left the cell and the one it came from and the animation ended. Drawn over the feet with `CharacterSheet.ahead = 1` (scene's y-sort). `overworld.ts`: the avatar's `move` callback enters the player's destination and the follower's new cell (or spawned when it appears); `regrass()` after `place`, `resume`, `correct`, `followerChanged`. `sheetOf` (`player-sprite.ts`) now also reads frames in a column (the field effect PNGs are 16×80). Art: `fxTallGrass`, `fxGeneral1Pal` in `manifest.ts`; the Makefile's `FIRERED_GFX_FILES` copies `field_effects/pics/tall_grass.png`, `field_effects/palettes/general_1.pal`.
- Messages: nothing new needed (REPEL and flutes in `item-messages.ts`; `common.repel_wore_off`, `common.sweet_scent_nothing` in `WORLD_TEXTS`).

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
- [x] **Sweet Scent** from the party menu (its cut-in of the Pokémon, `CreateFieldEffectShowMon`, is [O11](../../index.md#open-items), Phase 12) (Phase 6 M5 refused it): `SweetScentWildEncounter` (464) on a land or water cell with a table starts a battle with no rate roll and no Repel check; otherwise "Looks like there's nothing here…". The screen's pink fade (`FLDEFF_SWEET_SCENT`, grep `sweet_scent` in `src/`). Update Phase 6 M5's refusal list. M2's `encounter.Generate` needs a Sweet Scent flag: Intimidate / Keen Eye never skip there (HGSS `DoesAbilitySuppressEncounter` 1145); call it with `RepelLevel: 0`.

### Starting the battle (`mic-core/internal/world/battle.go`)

- [x] `startWild`: lock the player (as `startBattle`), build `BattleStart` with `kind: WILD`, side 1 = the wild Pokémon (no AI flags, no trainer), the player's party, the active battle in Redis; mark the species seen at the start (FireRed sets seen when it appears: find the call, grep `FLAG_SET_SEEN` in `src/battle_*.c`).
- [x] Contracts: `BattleStart.terrain` and `BattleView.terrain` (`BattleTerrain` enum with FireRed's 0-9), computed by `mic-core` from the cell and map type as `BattleSetup_GetTerrainId` (466); `BattleView.wild_transition` (FireRed's `GetBattleTransitionTypeByMap` 517 + `GetWildBattleTransition` 612: wild level < first healthy party member's level picks column 0). Needs the map type in `ServerMap` (check it's there).
- [x] The follower during a wild battle as during a trainer battle (Phase 6 M9).

### Client

- [x] Tall grass rustle: `FLDEFF_TALL_GRASS` (grep `FldEff_TallGrass` in `src/field_effect_helpers.c`, its art in `graphics/field_effects/`): drawn over the player's feet when entering a `tall_grass` cell, also for the follower (HeartGold's follower does). `make graphics` copies its sheet.
- [x] The REPEL and flute messages; Sweet Scent's fade and message.

## Play It

- ✅ Walk the test grass: battles come at a plausible rate (count steps over ~20 battles; write them here); none on the floor around it.
- ✅ Repel with a strong lead: no battles from lower-level slots; after its steps the message shows; a second Repel while active refuses.
- ✅ Black Flute fewer battles, White more; Cleanse Tag on the lead fewer; an Illuminate lead more (SQL on the test team, game closed).
- ✅ Sweet Scent in the grass starts a battle; outside it says nothing's there.

## Gotchas

- The step check runs on the server step, after the move is accepted: a correction or a warp step must not roll.
- During Sweet Scent's red the grass over the player's feet is drawn unfaded too (FireRed fades it; the player's sprite is above our fade rectangle, so its grass has to be).
