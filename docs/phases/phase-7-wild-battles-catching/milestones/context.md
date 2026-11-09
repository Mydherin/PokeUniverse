# Wild Battles and Catching: Shared Context

Part of [Phase 7](../phase-7-wild-battles-catching.md). Open only the section a step needs. Commands, the client engine and Phase 5's decisions (D1-D27) are in [Phase 5's context](../../phase-5-battle-system/milestones/context.md); how to play and back up a save is in [Phase 6's context](../../phase-6-pokemon-party/milestones/context.md#playing-a-milestone). Open them by section, don't repeat them here.

## Playing a Milestone

Same steps as Phase 6 (build, play the milestone's **Play it** list, regression check, fix, cut the file down). The regression check adds, from M3 on:

- Walk through the test grass until a wild battle starts; RUN from it (M4 on); throw a POKé BALL (M5 on).
- The room trainer's battle still works, and RUN and balls are still refused there.

## Decisions

| # | Decision |
|---|---|
| D1 | **Encounters are decided by `mic-core`** on the step it already validates (server-authoritative movement). The client never rolls; it plays the grass rustle and the battle the server starts. Randomness is the server's own (no FireRed encounter RNG seed). |
| D2 | **Encounter tables live in the text maps** (`lib-maps/maps/<id>.yaml`, an `encounters:` section with `land`, `water`, `rock_smash`, `fishing: {old, good, super}`, each with its rate and slots) and compile into `ServerMap`. The cell's `encounter` type already comes from the tile catalog ([maps.md](../../../maps.md#tile-catalog)). Update maps.md when M1 builds it. |
| D3 | **FireRed's encounter frame, Gen 4 lead abilities** (user, 2026-11-08): rate, cooldown, buff, Repel, flutes and slots as FireRed; the lead's abilities as Gen 4 (rate changes and the Pokémon made), from `pokeheartgold`. Cleanse Tag stays FireRed's 2/3; Pure Incense (Gen 4) does the same. |
| D4 | **All four encounter kinds in the server, only land played** (user, 2026-11-08): water, Rock Smash and rods get their tables, choice and entry points now; Surf on the map, Rock Smash on the map and the rods' use come in Phase 12. |
| D5 | **Wild held items and Pickup are in** (user, 2026-11-08). Both are Pokémon rules, so Gen 4: Pickup's chance and level tables from `pokeheartgold`; shown as FireRed would (no message, the item appears held). Wild held items are Gen 4's table for 1-493, converted once from `pokeheartgold`'s `personal.json` (user, 2026-11-09: FireRed's are Gen 3's, the expansion's later gens'); chances FireRed's `SetWildMonHeldItem` (50% / 5%, always when both match). |
| D6 | **Catching and escaping are ours, in `mic-battles`:** Showdown has no wild battles. Showdown still runs the turn; our wrapper resolves RUN and ball throws before Showdown's turn, as FireRed does (`HandleAction_Run`, `HandleAction_UseItem` come before moves), and ends the battle itself. Trapping is read from Showdown's request (`trapped`, `maybeTrapped`). |
| D7 | **Test content:** the grass patch and its table on 1F of the player's house, marked as test content and removed in Phase 10 with the test trainer and team. |
| D8 | **MMO:** a wild battle locks the player like a trainer battle; each player has their own encounters; no wild Pokémon is shared or visible to others. Encounter state (steps since the last, buff, previous behavior) is per player, in memory; Repel steps are saved. |
| D9 | **The caught Pokémon keeps its battle state** (Gen 4): HP, status, PP, held item. Heal Ball restores it. Experience is not given for a catch (Gen 4). |
| D10 | **Nickname after the save:** the MMO saves the catch with the battle's outcome; FireRed's question and naming screen come after, as a `NameCaughtPokemon` intent allowed only for the Pokémon just caught (held in the player's active battle record until answered or the battle closes). A restart at the question asks it again. |
| D11 | **Whiteout respawn** stays as Phase 6 left it (same zone, `Start`'s tile) until Phase 10 brings the Pokémon Center. |

## Gen 4 Rules Used by Several Milestones

Look each up once in `references/pokeheartgold/` (grep the names in quotes) and write the exact function and file into the milestone that builds it.

- **Catch** (M5): `a = ((3·maxHP − 2·HP) · catchRate · ball) / (3·maxHP) · status`; status ×2 asleep or frozen, ×1.5 paralyzed, poisoned or burned. `a ≥ 255` catches; else `b = 1048560 / √√(16711680 / a)` and four checks `rand16 < b`; the shakes shown are the checks passed (max 3). Master Ball always catches.
- **Balls** (M5): Ultra ×2, Great ×1.5, Poké, Premier, Luxury, Heal ×1; Safari ×1.5 (Phase 12); Net ×3 on Water or Bug; Dive ×3.5 on water encounters (Surf, rods); Nest `(40 − level) / 10`, at least 1; Repeat ×3 if the species is already caught; Timer `(turns + 10) / 10`, at most 4; Quick ×4 on the first turn; Dusk ×3.5 at night or in a cave.
- **Escape** (M4): FireRed's `TryRunFromBattle` is the same rule (faster or equal escapes; else `speed·128/foeSpeed + 30·tries > rand8`). Smoke Ball and Run Away always escape; trapping abilities and moves block, except the Gen 4 differences Showdown's request already applies.
- **Lead abilities** (M2, M3): rate ×½ Stench, White Smoke, Quick Feet, Sand Veil in sandstorm, Snow Cloak in hail; ×2 Illuminate, Arena Trap, No Guard. Pokémon made: Synchronize 50% same nature; Cute Charm 2/3 opposite gender; Compound Eyes item chances 60% / 20%; Hustle, Pressure, Vital Spirit 50% max level of the slot; Intimidate, Keen Eye 50% skip foes 5+ levels below the lead; Static, Magnet Pull 50% an Electric / Steel slot. Sticky Hold, Suction Cups (rods' bite) wait for Phase 12.
- **Pickup** (M4): after a won battle (Gen 4 `BattleWin`), each party Pokémon with Pickup and no held item has 10% to get an item from Gen 4's table for its level band.

## FireRed Reference Map

| What | Where in `references/pokefirered/` |
|---|---|
| Encounter check, slots, levels, Repel, flutes, Cleanse Tag, cooldown | `src/wild_encounter.c`: `TryStandardWildEncounter` 757, `HandleWildEncounterCooldown` 707, `StandardWildEncounter` 355, `DoWildEncounterRateTest` 309, `ChooseWildMonIndex_*` 71-117, `ChooseWildMonLevel` 155, `TryGenerateWildMon` 269, `GenerateWildMon` 226, `RockSmashWildEncounter` 446, `SweetScentWildEncounter` 464, `FishingWildEncounter` 519, `UpdateRepelCounter` 576, `IsWildLevelAllowedByRepel` 601 |
| Tables | `src/data/wild_encounters.json` (slot chances in its `fields`) |
| Battle start, terrain, transition | `src/battle_setup.c`: `StartWildBattle` 237, `DoStandardWildBattle` 247, `CB2_EndWildBattle` 422, `BattleSetup_GetTerrainId` 466, `GetBattleTransitionTypeByMap` 517, `GetWildBattleTransition` 612, `sBattleTransitionTable_Wild` 87 |
| Intro | `src/battle_intro.c`: `HandleIntroSlide` 95, `BattleIntroSlide1` 135, `BattleIntroSlide2` 214, `BattleIntroSlide3` 315 (built in Phase 5) |
| RUN | `src/battle_main.c`: `IsRunningFromBattleImpossible` 3002, `TryRunFromBattle` 4229, `HandleAction_Run`; `data/battle_scripts_1.s`: `BattleScript_SmokeBallEscape` 3003, `RanAwayUsingMonAbility` 3009, `GotAwaySafely` 3014, `WildMonFled` 3019 |
| Ball throw and catch | `src/battle_script_commands.c`: `Cmd_handleballthrow` 9463, `Cmd_givecaughtmon` 9617, `Cmd_trysetcaughtmondexflags` 9646, `Cmd_displaydexinfo` 9662, `Cmd_trygivecaughtmonnick` 9789; `data/battle_scripts_2.s`: `BattleScript_ThrowBall`, `SuccessBallThrow` 73, `ShakeBallThrow` 105, `TrainerBallBlock` 116 |
| Ball animation | `data/battle_anim_scripts.s`: `Special_BallThrow` 11055, `Special_BallThrowWithTrainer` 11089 (already in our `anims/firered.json`); `src/battle_anim_special.c`: `AnimTask_ThrowBall` 734, `AnimTask_IsBallBlockedByTrainerOrDodged` 684, `ItemIdToBallId` 702, `LaunchBallFadeMonTask` 1865, `SpriteCB_BallCaptureSuccessStar` 1298 |
| End of battle | `data/battle_scripts_1.s`: `BattleScript_PayDayMoneyAndPickUpItems` 2920, `LocalBattleLostPrintWhiteOut` 2930; `Cmd_pickup` 9261, `Cmd_givepaydaymoney` 7064, `Cmd_getmoneyreward` 5320 |
| Sounds | `MUS_VS_WILD`, `MUS_VICTORY_WILD`, `MUS_CAUGHT_INTRO`, `MUS_CAUGHT`; `SE_BALL_THROW`, `SE_BALL_OPEN`, `SE_BALL`, `SE_BALL_BOUNCE_1`-`4`, `SE_BALL_CLICK`, `SE_SHINY`, `SE_FLEE` (`include/constants/songs.h`) |

## Already Built (don't rebuild)

- Contracts: `BATTLE_KIND_WILD`, `BATTLE_RESULT_RAN`, `PartyMember` ball; item catalog's balls (`BATTLE_USE_BALL`), Repel steps (`param`), flutes, Poké Doll, Fluffy Tail, Cleanse Tag, Smoke Ball, Pure Incense.
- `mic-battles`: wild side 1 picks a random move (`ai/index.ts` `isAiSide`, `ai/random.ts`); wild battles give exp (`exp.ts`); RUN throws `InvalidChoice` (`engine/choices.ts` ~71, the hook for M4).
- `mic-core`: `pokemon.AddCaught` (party, else the PC box, else `full`: `pokemon/box.go` 106); `pokedex.Catch` / `See` and `PokedexChanged`; `battle.WhiteOutLoss`; the active battle in Redis and the outcome transaction (`world/battle.go`); `usableInBattle` (the trainer's ball block hook, ~246).
- Client: the battle screen, Phase 5's intro slides, the BAG in battle (`BattleUse.BALL` asks no target, `battle/screen.ts` ~473), `pokedex-pages.ts`, `naming-screen.ts`, `pokeball.ts` (send-out), the converted `Special_BallThrow` scripts (their tasks aren't written yet).
