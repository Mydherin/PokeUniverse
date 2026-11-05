# M3 TM/HM Teaching 🚧

Part of [Phase 6](../phase-6-pokemon-party.md). **Needs:** M2's learn flow. Rules: [context.md](context.md), D1, D3, D5.

**Done when:** USE in the TM CASE shows who can learn the move, teaches it, forgets a move if needed, and the catalog has every species' TM and tutor moves.

## Resume Here

Played: everything passed except the two items below (2026-11-05). The save is restored and the emulator stopped; `make audio` is done, the images are current. The two fixes in [Played](#played) are in the working tree: commit them if `git status` still shows them. Next, in order:

1. **Add NO USE** (`PARTYBOX_DESC_NO_USE`, `party_menu.c:874`): FireRed shows it in the slots for an evolution stone that won't work; we don't. Add its string from `sDescriptionStringTable` to `texts.json` (`make text`), return it from `description()` in `party-menu.ts` (about line 611) for such a stone. Found in M2's area.
2. **Compare the machine scene with the original, same species.** Pikachu on both: it's in slot 1 of the restored team, and it's the one in the emulator's state. Icon position and scale, wobble, glow, dots, stars. Seen so far in the original: only "Machine set!" with the icon on Pikachu's head. Setup: [Playing fast](context.md#playing-a-milestone), "TMs in the original" and "Test TMs". Fix only what differs; sources in [If Something Looks Wrong](#if-something-looks-wrong). Back up the save first and restore it after.
3. Mark ✅, cut this file down, update the phase file and the **Now** line, offer the commit.

## Tasks

- [x] **Contract, catalog, `mic-core`, client:** written and committed (b0af4b1).
- [x] **Played,** regression check included.
- [ ] **NO USE** in the slots for an evolution stone.
- [ ] **Scene compared** with the original.

## Played

Passed: ABLE / NOT ABLE / LEARNED (CUT, TOXIC, EARTHQUAKE across the team; Magikarp none; Garchomp and Lucario as Gen 4). Free slot; forget; give up with the TM kept; TM spent once learned, HM kept; friendship +1 each. Already known refused; "HM moves can't be forgotten now". TOXIC in battle with its animation; EARTHQUAKE, CUT and the new order in the fight menu and summary. Scene played through goes back to the TM CASE; B during it shows the party menu's "learned" message, then the TM CASE (the black screen and fanfare weren't observed: screenshots only, no sound). Reload keeps it all.

Regression passed: SWITCH, GIVE, TAKE, SUMMARY with move SWITCH; BAG USE, TOSS, "It won't have any effect"; PC WITHDRAW, DEPOSIT; potion in battle, win, exp; `mic-core` restart resumes; reload drops the battle with the potion back; stairs, SAVE.

Fixed while playing:

- **Slots blank in "Teach which POKéMON?":** `displayData` returned before `copyToVram` when drawing a description.
- **TM CASE text ran off the screen:** the original prints the move's description there, not `items.json`'s (seen in the emulator for TM06 and TM26, though the decomp's `PrintDescription` reads the item's). `tm-case.ts` now uses `assets.moveDescription(tmMove(item))`.

## How It Works

- **Source of "can learn" (settled against the output):** `3M` or `4M`, tutor `3T` or `4T`; a species' base form. 493 species, 17780 machine and 9227 tutor moves, none dropped. Mew 58/58 of FireRed's machines; Bulbasaur 19, Garchomp 28, Tangrowth 27. No machine moves: Caterpie, Metapod, Weedle, Kakuna, Magikarp, Ditto, Unown, Wobbuffet, Smeargle, Wurmple, Silcoon, Cascoon, Wynaut, Beldum, Kricketot, Burmy, Combee. The script appended lines, so re-running needs the fields removed first.
- **Friendship:** `{1, 1, 0}` through `changeFriendshipByItem`, as `AdjustFriendship(FRIENDSHIP_EVENT_LEARN_TMHM)`; HeartGold applies the same event (`party_menu_items.c:907`).
- **Party menu (`party-menu.ts`):** `machine` getter (the TM or HM in `use` mode), `description()` (slot word; off once `resumed`, as FireRed's PARTY_ACTION_CHOOSE_MON), `teach()`, `teachAndShow()`, `showTaught()`. `askToReplaceMove` and `askToStopLearning` are M2's, with an empty `ItemGrowth`. After the summary with a move picked, the scene starts directly, with no menu in between (the menu is dead there, so `teachAndShow` uses a plain promise).
- **Scene (`use-item-scene.ts`):** `runMachine`, `forgetMove`, `machineDots`, `createStars`. `done(played)`: false when stopped or the art failed. `gba/sound.ts` got `fanfarePlaying`. `world/moves.ts`: `machineAnswer`. The icon's spot comes per species from `assets.species(...).itemScene` (`placeItem`, about line 449), so compare only the same species.
- **Tutor moves are only stored:** tutor NPCs come in Phase 12.

## Differences From FireRed

| Difference | Reason |
|---|---|
| The move is saved before the scene plays, so closing the game mid-scene keeps it | MMO, D3 |
| Species learn from Gen 3 and Gen 4 machine lists | Gen 4 rules with FireRed's TMs, user's rule in this milestone |

## If Something Looks Wrong

FireRed: `pokemon_special_anim.c` `Task_ForgetMove` (277), `Task_UseTM_NoForget` (458), `Task_MachineSet` (501); `pokemon_special_anim_scene.c` `PSA_PrintMessage` (386), `PSA_UseTM_RunZoomOutAnim` (503), `InitItemIconSpriteState` (1047), star sprites (1190), dots (1267); `party_menu.c` `ItemUseCB_TMHM` (4762), `CB2_UseTMHMAfterForgettingMove`. Read only the one that differs.

## Files

Changed: `lib-contracts/proto/pokeuniverse/{species,item}/v1/catalog.proto`, `party/v1/party.proto`, generated code; `infra/pokemon/learnsets.mjs` (new); `mic-core/internal/item/use.go`, `pokemon/item.go`, `world/party.go`, `world/testbag.go`; `spa-pokeuniverse/src/game/world/moves.ts`, `gba/sound.ts`, `firered/{party-menu,use-item-scene,tm-case,manifest}.ts`, `firered/{texts,sounds}.json`; `AGENTS.md`.
