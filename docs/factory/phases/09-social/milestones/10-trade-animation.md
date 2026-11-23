---
id: 10-trade-animation
title: "Trade: animation and after"
status: testing
test: none
depends: [09-trade-menu]
context: [context/social.md, context/references.md]
---

# M10: Trade, Animation and After

Part of [Phase 9](../PHASE.md). Decisions: [context/social.md](../../../context/social.md#trading) D24. References: `trade_scene.c` (`CB2_LinkTrade`, `DoTradeAnim_Wireless`, `CB2_TryLinkTradeEvolution`), `graphics/trade/`.

## Resume Here

**Built (sessions 1-4, 2026-11-23): server, scene, wiring and SUMMARY memo; `tsc --noEmit` + `vite build` green. Next: the Manual Test (another session).**
- **Client, as built:** `firered/trade-scene.ts` (FireRed's `DoTradeAnim_Wireless` state by state; `startTradeScene(flow, {own, received, partnerName}, ended)`; once ended it keeps running and calls `scene.after()` each frame; `scene.print(textId)` = DrawTextOnTradeWindow). Its art in `manifest.ts` `TRADE_GRAPHICS`, sounds in `TRADE_SOUNDS` (+ `se_warp_out` in `sounds.json`), the six scene/save texts in `texts.json`. `PokeBalls.sendOff` ends on `callbackDummy`.
- **`trade-menu.ts`:** `tradeDone` keeps `traded = {scene, slot: ownSlot, evolvesTo}`, fades to black, `afterTrade` runs the scene (`gba.reset` kills the menu's update task, so `afterScene` drains `queue` and runs `step` each frame). No evolution: "Communication standby…", `host.sceneDone()`, wait for CHOOSING (`next`), "SAVING… DON'T TURN OFF THE POWER." 110 frames, fade, `fadeOutBgm(3)` until stopped, `reopen()` (mus_game_corner restarts). Evolution: `host.evolve(slot, species, done)` then on black `sceneDone`, wait CHOOSING, `reopen()`. A link `ended` meanwhile → `close("dropped")`.
- **`overworld.ts` `tradeHost()`:** `sceneDone` → `LinkIntent.tradeSceneDone`; `evolve` → `startFieldEvolution(flow, partyHost(), {...growth, mapMusic: () => {}}, {slot, species}, done)` (phase-6's scene, B stops it, asks `EvolvePokemon`).
- **`summary.ts` `printTrainerMemo`:** OT differs → `gText_PokeSum_MetInATrade` (decision below).
- **Server, as built:** contracts (`social.proto`): `TradeDone.evolves_to`, `LinkIntent.trade_scene_done`(12), `TradeMemberAction.scene_done`(6). `pokemon.Party.TradeEvolution(slot)` (EVERSTONE stops it); `Evolve` spends a TRADE evolution's held item. `world/trade.go`: the swap marks each received Pokémon caught in the Pokédex, sends `TradeDone` with `evolves_to`, holds the menu (`tradeMenu.scene`) until both `TradeSceneDone`, then `backToMenu` sends CHOOSING to both; `tradeReceived` offers the evolution (`p.evolving.offer`). Follower: `showChanges` on the tick.
- **Already there:** 1.5× EXP for traded Pokémon (`battle/team.go` `Traded: p.OT.ID != trainerID`, `mic-battles/src/exp.ts`); OT and met data travel with the row.
- **Gotchas for the test:** the evolution reads the overworld's party at `ownSlot`: it must already hold the received Pokémon (mic-core's party push comes right after the swap, long before the scene ends). Build: `npx -y pnpm@10 install --frozen-lockfile` at the root, then in `spa-pokeuniverse/` `npx tsc --noEmit && npx vite build --outDir /tmp/pu-dist`. `references/pokefirered` may need `git submodule update --init --depth 1 references/pokefirered`.

## Tasks

- [x] **Scene:** FireRed's wireless trade scene with both Pokémon (front pics, Poké Balls, the signal, cries, music and sounds), the "{NAME} sent over {MON}" / "Take good care of {MON}" texts; art from `make graphics`.
- [x] **Evolution:** the server decides the Gen 4 trade evolutions (D24, held item used up, Everstone) with the swap and saves it in the same transaction; the client plays Phase 6's evolution scene after the trade scene (B cancels as FireRed: the evolution doesn't happen and the item isn't used).
- [x] **After:** OT and met data kept, "Met in a trade" in SUMMARY when OT differs; 1.5× EXP flag (Gen 4) used by battle EXP; Pokédex seen and caught; follower updated if the lead changed; both back in the trade menu.

## Decisions

- **B stops the trade evolution** (the task, Gen 4's rule): FireRed's `Task_TradeEvolutionScene` can't be stopped; the stop is Gen 4's, shown with Phase 6's scene (D24), B as in a level evolution. Stopped: nothing is sent, the item stays; the offer is dropped with the next party change.
- **The evolution is decided with the swap, saved when its scene isn't stopped** (the task said "saved in the same transaction"): B must be able to stop it, so the swap's transaction decides it (`TradeDone.evolves_to`, `p.evolving`) and the evolution saves in its own transaction on `EvolvePokemon`, as Phase 6's. A crash between leaves it unevolved, as a stopped one.
- **The menu comes back once both scenes end** (FireRed's `CB2_WaitTradeComplete` / `READY_FINISH_TRADE`): an evolution changes the party the menu shows, so the leader re-reads both after both `TradeSceneDone`.
- **"Met in a trade." for every traded Pokémon** (the task): FireRed prints it only for a Pokémon from another game (`PokeSum_PrintTrainerMemo_Mon_NotHeldByOT`) and "Apparently met in…" for one from the same game; the task asks for "Met in a trade" whenever OT differs. Affects `summary.ts`.
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

- 2026-11-23: session 1 checkpoint: FireRed's wireless scene read and noted in Resume Here; client next.
- 2026-11-23: session 1: server (contracts, trade evolution, Pokédex in the swap, menu held until both scenes end); Go build + vet green.
- 2026-11-23: session 2 checkpoint: client art, tables, callbacks, after-scene flow and SUMMARY memo looked up and noted in Resume Here; no code yet.
- 2026-11-23: session 3 checkpoint: `trade-scene.ts`, its art, sounds and texts written (tsc green); trade-menu wiring half done (tsc red until the overworld host methods); next in Resume Here.
- Recovery needed (builder, step cbf208b9-663f-423c-8cb3-be926e1c16f1): The provider's usage limits ran out; Mooi stopped the session and saved its work. *State* may be stale; see the last `chore(factory): checkpoint` commit.
- 2026-11-23: session 4: trade menu wired to the scene, the evolution and the save; overworld host `sceneDone`/`evolve`; SUMMARY "Met in a trade."; tsc + vite build green; `status: testing`.
