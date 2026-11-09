# M2 Rare Candy and Evolution Stones ✅

Part of [Phase 6](../phase-6-pokemon-party.md). **Needs:** M1. Rules: [context.md](context.md), D1, D3, D4.

**Done when:** Rare Candy levels up, learns moves and evolves outside battle, and stones evolve, with the same scenes as battles. **Played, closed.**

## Played

- **Rare Candy:** gains and totals windows; learning with a free slot; replacing a move through the summary; NO, B and "did not learn"; nothing spent at Lv 100; a fainted Pokémon comes back with what its maximum rose (0 to 3/107).
- **Rare Candy evolution:** B keeps the species and returns to the bag, candy spent; the next level evolves.
- **Evolving by a replaced move:** Aipom Lv 31 replaces Scratch with Double Hit and becomes Ambipom. Aipom Lv 35 knowing Double Hit, forgetting it for Fling: no evolution, back to the bag.
- **Stones:** B can't stop the scene, Everstone still held, stone spent; wrong species has no effect, nothing spent; Sun Stone on Gloom with National off gives "Huh?" and keeps the stone; National on gives Bellossom and sets its seen and caught bits (492 to 493); spending the last of a stack.
- **Regression:** SWITCH, GIVE, TAKE, summary move SWITCH; bag USE, TOSS, "This isn't the time"; PC WITHDRAW, DEPOSIT; a battle with items, `mic-core` restart resumes it, win, exp, battle level up window, battle evolution with its learned move; reload mid-battle drops it and the Revive used comes back; stairs, SAVE.

**Not checked:** sound, since the pane can't be heard (fanfares, map music back after the scene). No fresh reload right after SAVE. After `LearnMoveResult` was added, a replace after an evolution's scene wasn't replayed: that path ignores the answer. **Seen once, not looked into:** the console's "An unknown error occurred when fetching the script." four times after an SPA image rebuild; the game played normally.

## How It Works

- **Rare Candy:** `usePartyItem` raises the level through `Gain`, spends it and saves in one transaction. The answer carries `learned`, `to_learn` and `evolves_to`. The scene can be stopped; if it isn't, the client sends `EvolvePokemon`, and `to_learn` goes through `LearnMove`, both as after a battle.
- **`LearnMove` answers `PartyChanged`, then `LearnMoveResult`** with `evolves_to`, worked out again from the moves known now (`evolving.offer`): a move can make the evolution possible or take it away. The party menu waits for it and replaces `ItemGrowth.evolves_to`; the battle and stone paths ignore it.
- **Stone:** the server evolves, spends and saves at once (D3), with `evolved_from` in the answer. FireRed's scene can't be stopped, so the client only shows it: `field-evolution.ts` shows the old species until the scene's `evolve`, which resolves locally.
- **Past 151 without the National Pokédex:** a stone answers `CANT_EVOLVE` (`MonCanEvolve`, `StartUseItemAnim_CantEvolve`), nothing spent. A Rare Candy offers the evolution and the scene ends by itself, as after a battle.
- **Learning in the party menu uses FireRed's party texts, not `battle/learn.ts`:** `gText_PkmnNeedsToReplaceMove`, `gText_StopLearningMove2`, `gText_MoveNotLearned`, `gText_WhichMoveToForget`, `gText_12PoofForgotMove`, `gText_PkmnLearnedMove3`. From `level-up.ts` only the window's contents are shared (`levelUpGains`, `levelUpTotals`, with the colors as a parameter); the party window is `sLevelUpStatsWindowTemplate`.
- **`partyChange` clears `p.evolving`:** what waits is by slot, so a SWITCH can't apply it to another Pokémon. A new item use clears it too.
- **`Evolve` fix:** it removed the held item for any evolution with an item, which would have deleted a stone user's held item. Now only level evolutions.

## Differences From FireRed

| Difference | Reason |
|---|---|
| A held Everstone doesn't block a stone (FireRed's `GetEvolutionTargetSpecies` does, on `EVO_MODE_ITEM_USE`) | Gen 4 rule: `pokeheartgold` `pokemon.c:2803`, `context != EVOCTX_ITEM_USE` |
| A stone's gender condition counts (Dawn Stone) | Gen 4 rule |
| An evolution can depend on a move learned or forgotten in the same level up (Aipom) | Gen 4 rule; FireRed has no such case |
| A stone is saved before its scene plays | MMO, D3: a closed game keeps the stone's effect |
| A reload during a Rare Candy's flow loses the offered evolution and moves until the next level | MMO: `Player.evolving` is memory only, as after a battle |

## Files

`lib-contracts/proto/pokeuniverse/item/v1/bag.proto`, `party/v1/party.proto`, `realtime/v1/realtime.proto`; `mic-core/internal/item/use.go`, `pokemon/evolution.go`, `pokemon/item.go`, `world/party.go`, `world/testbag.go`; `spa-pokeuniverse/src/realtime/connection.ts`; `spa-pokeuniverse/src/game/firered/`: `party-menu.ts`, `field-evolution.ts` (new), `overworld.ts`, `use-item-scene.ts`, `texts.json`, `battle/evolution.ts` (`stoppable`), `battle/level-up.ts`, `battle/screen.ts`.
