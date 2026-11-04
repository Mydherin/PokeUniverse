# M1b FireRed's Item-Use Scene 🚧

Part of [Phase 6](../phase-6-pokemon-party.md). **Needs:** M1. Found while building M1: not in the first plan. Rules: [context.md](context.md).

**Done when:** using an item on a Pokémon outside battle plays FireRed's scene first (the Pokémon's picture, the item, its sparkles), then the party menu shows the effect.

## Resume Here

The scene is played and fine; only the end of the regression check is left. **Next step:** the unchecked items under [Play It](#play-it), in that order, then close: mark ✅ here and in the phase file, point **Now** in `AGENTS.md` at M2, cut this file down. No code needs reading first. Fix only what fails.

**State:** everything is committed and the containers run it. Account 2's save is back as it was before playing: team healthy at level 50, bag as in the backup. The player stands at (9,5), under the trainer.

**The fast way through what's left:**

1. Game closed (on `/`, 3 s): back up the save ([context.md](context.md#playing-a-milestone)), then give the team enough to win (the pouch already has Leppa and Oran to toss):
   `update trainer_pokemon set level=90, exp=911250 where account_id=2 and slot=0` (Garchomp); `exp=729000` for slot 1 (Pikachu); `exp=762160` for slots 2 and 3 (Charizard, Lucario). Two at level 90 lost at the third foe.
2. **Battle:** Up, A, A, A (YES), A, A, A; about 25 s to the menu. In it: BAG, Right to KEY ITEMS, BERRY POUCH, OPEN, a berry, TOSS, A, A, A. B, B back to the battle.
3. **Win:** Garchomp's Earthquake does nothing to Gengar (Levitate): pick Dragon Claw (A, Right, A; the cursor stays on it after). Then one call per turn: `KeyZ`, `KeyZ`, about 10 × `KeyX` 1.5 s apart. B moves messages on and answers NO to "Will AA change POKéMON?". If a Pokémon faints: A, Right or Down to the next, A, A.
4. **After the win:** the tossed berry is one fewer in `trainer_items` (saved with the outcome), `friendship` of the team changed by the battle's rule, exp and money saved. Then the rest of the list, and restore the levels.

**Playing:** `/play` now takes about 55 s, then A presses until the map (screenshot between them, the count varies). Hold a walking key 200 ms per step (280 ms took two). A hidden pane cuts a call at 45 s: keep each under 35 s.

## Play It

- [x] Potion, closeness 0 and 3: background, picture, item, sparkles, message, zoom back, A, the menu with HP rising, its message, one fewer in the bag. The console's "An unknown error occurred when fetching the script" is the browser pane refusing the service worker: `/sw.js` answers 200 as JavaScript, and registering it by hand fails the same way there. Not ours.
- [x] Cure, Revive, Ether, vitamin: scene, then the effect and its message.
- [x] A or B before the message: black at once, the menu, the effect all the same.
- [x] No effect: no scene. Sacred Ash: none, every fainted Pokémon restored in turn.
- [x] A Gen 4 species' item position with the fallback (Garchomp on the Potion, item centered).
- [x] **M1's battle BAG fixes:** USE / CANCEL, OPEN / CANCEL, only CANCEL for Light Ball; "Use on which POKéMON?"; B in the party back to the BAG, or the BERRY POUCH for a berry; a berry with no battle use gets OAK's words; POKé FLUTE with nobody asleep (catchy tune) and with a sleeper (wakes, SLP gone); Dire Hit's second use says "It won't have any effect."; TOSS in the battle pouch.
- [x] **Regression, passed:** POKéMON (SWITCH, GIVE, TAKE, SUMMARY with move SWITCH); BAG (USE, TOSS, not for now); in battle a Potion (+20) and exp on a knockout; `docker compose restart mic-core` resumes it, with the toss still gone; leaving drops it with Razz Berry, Potion and Dire Hit back in the bag.
- [ ] **Regression, left:** a whole win (toss saved, exp, friendship); PC WITHDRAW and DEPOSIT; walk, stairs, SAVE, and a reload shows the same state.
- [ ] A look at the Potion against the original (`make emulator`), once.

**Can't be checked here:** the browser pane plays no sound we can hear, so the scene's sounds, the flute's fanfare and the cry at closeness 3 are unheard.

## Found While Playing

- **`mic-battles` was running an old image** (built 14:41, the BAG fixes committed 15:57): a Dire Hit with no effect made the choice bounce silently. Nothing wrong in the code; all three services rebuilt. See [Playing a Milestone](context.md#playing-a-milestone), step 1.
- **TOSS in the battle pouch did nothing:** `mic-core` refused every item action during a battle. `tossInBattle` (`world/items.go`) now allows it, berries only. Built, played; the save at the outcome isn't checked yet.

## Differences

- **Effect saved before the scene,** not after as in FireRed: the MMO saves first, so a refusal plays nothing and a reload can't lose it. The player sees FireRed's order.
- **Cancelling** stops the scene at once instead of letting its tasks run under the black screen: nothing to see differs.
- **A berry tossed in battle comes back if the player leaves it:** saving the pocket then would also save what the battle has spent, and leaving must roll that back ([Phase 5 D22](../../phase-5-battle-system/milestones/context.md#decisions)).

## Files

`spa-pokeuniverse/src/game/firered/use-item-scene.ts` (new), `party-menu.ts`, `manifest.ts`, `sounds.json`, `texts.json`; `infra/pokemon/build.mjs`, `sources.mjs`; `lib-contracts/proto/pokeuniverse/item/v1/bag.proto` (a comment, generated code); `mic-core/internal/pokemon/item.go`, `world/party.go`, `world/items.go`, `world/battle.go`.

**Build state:** `mic-core` build + vet pass with the toss fix; the Docker images are up to date. Typecheck, contracts and `make breaking` passed before it and nothing they cover changed.
