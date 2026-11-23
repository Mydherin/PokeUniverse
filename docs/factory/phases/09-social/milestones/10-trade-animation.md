---
id: 10-trade-animation
title: "Trade: animation and after"
status: building
depends: [09-trade-menu]
context: [context/social.md, context/references.md]
---

# M10: Trade, Animation and After

Part of [Phase 9](../PHASE.md). Decisions: [context/social.md](../../../context/social.md#trading) D24. References: `trade_scene.c` (`CB2_LinkTrade`, `DoTradeAnim_Wireless`, `CB2_TryLinkTradeEvolution`), `graphics/trade/`.

## Resume Here

**Session 1 (2026-11-23): server done (Go build + vet green), client not started.** Next: the client scene (`trade-scene.ts`), then the evolution and SUMMARY on the client.
- **Server, as built:** contracts (`social.proto`): `TradeDone.evolves_to` (species, unset none), `LinkIntent.trade_scene_done`(12) `TradeSceneDone{}`, `TradeMemberAction.scene_done`(6). `pokemon.Party.TradeEvolution(slot)` (EVERSTONE stops it); `Evolve` also spends a TRADE evolution's held item. `world/trade.go`: `swap` marks each received Pokémon caught in its trainer's Pokédex in the swap's transaction (`catchReceived`), sends `TradeDone` with `evolves_to`, **no menu**: `tradeMenu.scene` holds it until both sides send `TradeSceneDone` (`backToMenu` re-reads the member's party, sends CHOOSING to both); intents other than `TradeSceneDone` are ignored meanwhile. `tradeReceived` (leader in `swap`, member in `onTradeEvent` after `reloadParty`) sets the Pokédex and `p.evolving.offer(slot, TradeEvolution)`, so the client asks with Phase 6's `EvolvePokemon{slot}` (`zone.evolve`, which also does the National Dex check and the Pokédex). The explicit `syncFollower()` calls in `trade.go` were dropped: `showChanges` on the tick does it and also emits the zone event (the explicit call hid it from the partner).
- **Already there (no work):** 1.5× EXP for traded Pokémon (`battle/team.go` `Traded: p.OT.ID != trainerID`, `mic-battles/src/exp.ts`); OT and met data travel with the row (the swap moves rows).
- **Client plan:** `TradeMenu.handle(tradeDone)` keeps the own given and the received Pokémon (`parties[PLAYER][ownSlot]`, `parties[PARTNER][otherSlot]`) and `evolvesTo`; `afterTrade` (black) runs the scene instead of waiting for CHOOSING, then (if `evolvesTo`) the overworld's `startFieldEvolution(…, {slot, species})` (stoppable, asks `EvolvePokemon`), then `host.sceneDone()` (→ `LinkIntent.tradeSceneDone`), black until CHOOSING, then `open()`. SUMMARY: "Met in a trade" text when OT differs (look up FireRed's `PokeSum_PrintTrainerMemo_Mon` for the traded case; the client uses `gText_PokeSum_ApparentlyMet` now).

## Tasks

- **Scene:** FireRed's wireless trade scene with both Pokémon (front pics, Poké Balls, the signal, cries, music and sounds), the "{NAME} sent over {MON}" / "Take good care of {MON}" texts; art from `make graphics`.
- **Evolution:** the server decides the Gen 4 trade evolutions (D24, held item used up, Everstone) with the swap and saves it in the same transaction; the client plays Phase 6's evolution scene after the trade scene (B cancels as FireRed: the evolution doesn't happen and the item isn't used).
- **After:** OT and met data kept, "Met in a trade" in SUMMARY when OT differs; 1.5× EXP flag (Gen 4) used by battle EXP; Pokédex seen and caught; follower updated if the lead changed; both back in the trade menu.

## Decisions

- **B stops the trade evolution** (the task, Gen 4's rule): FireRed's `Task_TradeEvolutionScene` can't be stopped; the stop is Gen 4's, shown with Phase 6's scene (D24), B as in a level evolution. Stopped: nothing is sent, the item stays; the offer is dropped with the next party change.
- **The evolution is decided with the swap, saved when its scene isn't stopped** (the task said "saved in the same transaction"): B must be able to stop it, so the swap's transaction decides it (`TradeDone.evolves_to`, `p.evolving`) and the evolution saves in its own transaction on `EvolvePokemon`, as Phase 6's. A crash between leaves it unevolved, as a stopped one.
- **The menu comes back once both scenes end** (FireRed's `CB2_WaitTradeComplete` / `READY_FINISH_TRADE`): an evolution changes the party the menu shows, so the leader re-reads both after both `TradeSceneDone`.
- **"Traded" is OT ≠ trainer** (FireRed's and Gen 4's own test), no stored flag.

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Scene | Trade two Pokémon | FireRed's scene, texts, sounds (compare the emulator once) | ⬜ |
| 2 | Trade evolution | Trade a Kadabra | Evolves into Alakazam for the receiver | ⬜ |
| 3 | Item evolution | Onix holding Metal Coat | Steelix, item gone | ⬜ |
| 4 | Everstone | Kadabra holding Everstone | No evolution | ⬜ |
| 5 | Cancel evolution | B during the evolution | Stays; item kept | ⬜ |
| 6 | Summary, Pokédex | Check the received one | "Met in a trade", OT the other; Pokédex caught | ⬜ |
| 7 | EXP | Battle with it | 1.5× EXP | ⬜ |
| 8 | Follower | Trade the lead | Follower changes | ⬜ |

## Log

- 2026-11-23: session 1: server (contracts, trade evolution, Pokédex in the swap, menu held until both scenes end); Go build + vet green.
