# M3 TM/HM Teaching 🚧

Part of [Phase 6](../phase-6-pokemon-party.md). **Needs:** M2's learn flow. Rules: [context.md](context.md), D1, D3, D5.

**Done when:** USE in the TM CASE shows who can learn the move, teaches it, forgets a move if needed, and the catalog has every species' TM and tutor moves.

## Resume Here

All code is written, builds and is committed on `gen4-battles` (not pushed); **nothing is played**. Next, in order:

1. `make audio` (renders the two new sounds; `make text` is already done). The graphics are in folders `make graphics` already copies.
2. `docker compose up -d --build mic-core spa-pokeuniverse`.
3. Put the test TMs in account 2's bag: `giveTestBag` only runs when an account is created (`world/world.go:187`), so with the game closed add rows to `trainer_items` for TM CASE, TM06 x3, TM26 x2, TM13 x2, HM01, HM03 (see [Playing fast](context.md#playing-a-milestone): back up first).
4. Play the **Play It** list, against the original where a scene looks off; fix; then the [regression check](context.md#playing-a-milestone). Restore the save.
5. Cut this file down, mark ✅, update the phase file and the **Now** line, offer the commit of the fixes.

## Tasks

- [x] **Contract:** `SpeciesInfo.machine_moves` (15), `tutor_moves` (16), `uint32` move numbers like `Evolution.move`. `UsePartyItem.move_slot` also says which move a TM replaces (no new message, D1). `make contracts` and `make breaking` pass.
- [x] **Catalog:** `infra/pokemon/learnsets.mjs` ran once; AGENTS.md's exception list has it. TMs carry `effect: {friendship: [1, 1, 0]}`, HMs also `reusable: true` (D2): that's the whole "HM isn't spent" rule.
- [x] **`mic-core`:** `Party.TeachMachineMove` (`pokemon/item.go`), `FIELD_USE_TM_HM` in `usePartyItem` and `item.PokemonEffect`. Test bag has TMs and HMs.
- [x] **Client:** slots show ABLE! / NOT ABLE! / LEARNED; "Teach which POKéMON?"; refusals; forget flow; TM CASE's USE opens the menu; the machine scene.
- [ ] **Play it,** then the regression check.

## Play It

- Slots show ABLE and NOT ABLE correctly for a TM several of the team can learn, and for one only some can.
- Teach with a free slot; with four moves forget one, or give up. TM spent once learned, not on giving up. HM stays.
- Already known: refused. An HM can't be forgotten afterward. The learned move works in battle, with its animation.
- Gen 4 species (387-493) and a species with few TMs (Magikarp: none) answer correctly. Reload keeps it.
- **Scene:** played through, it goes straight back to the TM CASE. B during it (not while forgetting) goes black, then the party menu's "learned" message with fanfare, then the TM CASE. Compare with the original: icon position and scale, wobble, glow, dots, stars.

## How It Works

- **Source of "can learn" (settled against the output):** `3M` or `4M`, tutor `3T` or `4T`; a species' base form. 493 species, 17780 machine and 9227 tutor moves, none dropped. Mew 58/58 of FireRed's machines; Bulbasaur 19, Garchomp 28, Tangrowth 27. No machine moves: Caterpie, Metapod, Weedle, Kakuna, Magikarp, Ditto, Unown, Wobbuffet, Smeargle, Wurmple, Silcoon, Cascoon, Wynaut, Beldum, Kricketot, Burmy, Combee. The script appended lines, so re-running needs the fields removed first.
- **Friendship:** `{1, 1, 0}` through `changeFriendshipByItem`, as `AdjustFriendship(FRIENDSHIP_EVENT_LEARN_TMHM)`; HeartGold applies the same event (`party_menu_items.c:907`).
- **Party menu (`party-menu.ts`):** `machine` getter (the TM or HM in `use` mode), `description()` (slot word; off once `resumed`, as FireRed's PARTY_ACTION_CHOOSE_MON), `teach()`, `teachAndShow()`, `showTaught()`. `askToReplaceMove` and `askToStopLearning` are M2's, with an empty `ItemGrowth`. After the summary with a move picked, the scene starts directly, with no menu in between (the menu is dead there, so `teachAndShow` uses a plain promise).
- **Scene (`use-item-scene.ts`):** `runMachine`, `forgetMove`, `machineDots`, `createStars`. `done(played)`: false when stopped or the art failed. `gba/sound.ts` got `fanfarePlaying`. `world/moves.ts`: `machineAnswer`.
- **Tutor moves are only stored:** tutor NPCs come in Phase 12.

## Differences From FireRed

| Difference | Reason |
|---|---|
| The move is saved before the scene plays, so closing the game mid-scene keeps it | MMO, D3 |
| Species learn from Gen 3 and Gen 4 machine lists | Gen 4 rules with FireRed's TMs, user's rule in this milestone |

## If Something Looks Wrong

FireRed: `pokemon_special_anim.c` `Task_ForgetMove` (277), `Task_UseTM_NoForget` (458), `Task_MachineSet` (501); `pokemon_special_anim_scene.c` `PSA_PrintMessage` (386), `PSA_UseTM_RunZoomOutAnim` (503), star sprites (1190), dots (1267); `party_menu.c` `ItemUseCB_TMHM` (4762), `CB2_UseTMHMAfterForgettingMove`. Read only the one that differs.

## Not Written or Not Looked At

- **Not run at all:** the scene and the menu changes only typecheck and bundle. First suspects: the item's y (no `+4`, copying M1b's `itemOnMon`), `\p` in `say`, the counting text's x and speed.
- **Bug found in M2's area, not fixed:** FireRed shows NO USE in the slots for an evolution stone that won't work (`PARTYBOX_DESC_NO_USE`, `party_menu.c:874`); we don't. `description()` is now where it fits; its string (`sDescriptionStringTable`) still has to be added to `texts.json`.

## Files

Changed: `lib-contracts/proto/pokeuniverse/{species,item}/v1/catalog.proto`, `party/v1/party.proto`, generated code; `infra/pokemon/learnsets.mjs` (new); `mic-core/internal/item/use.go`, `pokemon/item.go`, `world/party.go`, `world/testbag.go`; `spa-pokeuniverse/src/game/world/moves.ts`, `gba/sound.ts`, `firered/{party-menu,use-item-scene,tm-case,manifest}.ts`, `firered/{texts,sounds}.json`; `AGENTS.md`.

Build state: `mic-core` build and vet, SPA typecheck and bundle, `make breaking` all pass; `make text` done; `make audio` not.
