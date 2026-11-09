# M1b FireRed's Item-Use Scene ✅

Part of [Phase 6](../phase-6-pokemon-party.md). **Needs:** M1. Found while building M1: not in the first plan. Rules: [context.md](context.md).

**Done when:** using an item on a Pokémon outside battle plays FireRed's scene first (the Pokémon's picture, the item, its sparkles), then the party menu shows the effect. **Played, closed.**

## Played

- **The scene:** Potion at closeness 0 and 3, cure, Revive, Ether, vitamin; A or B before the message (black at once, the effect all the same); no effect (no scene); Sacred Ash (none, every fainted Pokémon restored in turn); a Gen 4 species' item position with the fallback (Garchomp, item centered).
- **Against the original,** same Pokémon and HP, frame by frame: background, picture, item, sparkle ring, messages, HP 50 → 70 match.
- **M1's battle BAG fixes:** USE / CANCEL, OPEN / CANCEL, only CANCEL for Light Ball; "Use on which POKéMON?"; B back to the BAG or BERRY POUCH; OAK's words; POKé FLUTE; Dire Hit's second use; TOSS in the battle pouch.
- **Regression:** POKéMON (SWITCH, GIVE, TAKE, SUMMARY with move SWITCH); BAG (USE, TOSS, not for now); a Potion in battle; `docker compose restart mic-core` resumes it; leaving rolls it back; a whole win (toss saved at the outcome, exp +13398 for the only Pokémon that fought, money +1800, HP kept; friendship unchanged, right with no level up: it changes on level up and by item); PC WITHDRAW and DEPOSIT; walk, stairs, SAVE on another floor, and a reload shows the same state.

**Not checked:** the browser pane plays no sound we can hear, so the scene's sounds, the flute's fanfare and the cry at closeness 3 are unheard. Friendship rising on a level up wasn't replayed here (Phase 5 M11).

**Not ours:** the console's "An unknown error occurred when fetching the script" is the browser pane refusing the service worker: `/sw.js` answers 200 as JavaScript.

## Differences

- **Effect saved before the scene,** not after as in FireRed: the MMO saves first, so a refusal plays nothing and a reload can't lose it. The player sees FireRed's order.
- **Cancelling** stops the scene at once instead of letting its tasks run under the black screen: nothing to see differs.
- **A berry tossed in battle comes back if the player leaves it:** saving the pocket then would also save what the battle has spent, and leaving must roll that back ([Phase 5 D22](../../phase-5-battle-system/milestones/context.md#decisions)).
- **The black gap before the party menu returns is shorter,** by about 0.3 s: both use the same fades, but FireRed spends 22 load steps rebuilding the menu under the black screen and ours has nothing to load.

## Files

`spa-pokeuniverse/src/game/firered/use-item-scene.ts` (new), `party-menu.ts`, `manifest.ts`, `sounds.json`, `texts.json`; `infra/pokemon/build.mjs`, `sources.mjs`; `lib-contracts/proto/pokeuniverse/item/v1/bag.proto` (a comment, generated code); `mic-core/internal/pokemon/item.go`, `world/party.go`, `world/items.go` (`tossInBattle`), `world/battle.go`.
