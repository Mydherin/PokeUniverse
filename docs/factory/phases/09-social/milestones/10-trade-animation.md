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

**Built (sessions 1-4, 2026-11-23): server, scene, wiring and SUMMARY memo; `tsc --noEmit` + `vite build` green. Manual Test in progress: cases 1-6 and 8 pass (tester sessions 1-2); next: the "Next" list of the top *Tests* entry (SAVING… flow seen once, case 7 EXP, phone check).**
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
| 1 | Scene | Trade two Pokémon | FireRed's scene, texts, sounds (compare the emulator once) | ✅ 2026-11-23 BOT1 KADABRA ↔ BOT2 ONIX, scene and texts recorded frame by frame (sounds and emulator not checked) |
| 2 | Trade evolution | Trade a Kadabra | Evolves into Alakazam for the receiver | ✅ 2026-11-23 KADABRA → ALAKAZAM (BOT2), MACHOKE → MACHAMP (BOT1), saved |
| 3 | Item evolution | Onix holding Metal Coat | Steelix, item gone | ✅ 2026-11-23 BOT1 ONIX+METAL COAT → STEELIX (208), held_item 0 |
| 4 | Everstone | Kadabra holding Everstone | No evolution | ✅ 2026-11-23 BOT2 KADABRA+EVERSTONE stays KADABRA, item kept |
| 5 | Cancel evolution | B during the evolution | Stays; item kept | ✅ 2026-11-23 BOT2 B during ONIX's evolution: ONIX (95), METAL COAT (199) kept |
| 6 | Summary, Pokédex | Check the received one | "Met in a trade", OT the other; Pokédex caught | ✅ 2026-11-23 KADABRA on BOT2: OT BOT1, IDNo 44291, "Met in a trade."; caught bits 64 / 95, 208 |
| 7 | EXP | Battle with it | 1.5× EXP | ⬜ |
| 8 | Follower | Trade the lead | Follower changes | ✅ 2026-11-23 after the lead trade: BOT1 STEELIX, BOT2 KADABRA, in the room and after relogin |

## Tests

### 2026-11-23: attempt 1, in progress (tester session 2 checkpointed)

Preview restarted (it was stopped; fresh DB, build and healthchecks green, `previewUrl` `/preview/xkch2euew75qmxrt2tqjf46jsup4tu6y/`). Open it at `https://mooi.skypea.dev` + previewUrl: `http://127.0.0.1:8000` gets WS 403 (origin check). Desktop 1280×720. BOT2 leader, BOT1 member.
- **Setup (fresh DB):** bots spawned in `pokemon_center_2f`, parties inserted (L10, IVs 31, ball 4): BOT1 KADABRA+EVERSTONE, PIDGEY; BOT2 ONIX+METAL COAT, RATTATA; National Dex for both; bot-1 moved to (5,6). Later (games closed) BOT1 slot 2 ONIX+METAL COAT and both set to `pokemon_center_2f` (10,4) `facing='north'` (values north/south/west/east). Trainer ids: BOT1 2890837251 (IDNo 44291), BOT2 4030209877.
- **Trade 1** BOT1 KADABRA+EVERSTONE ↔ BOT2 ONIX+METAL COAT: cases 3, 4, 6 and 8 pass (table). B pressed on BOT1 that time came too late (tool-call delay): ONIX evolved, which gave case 3.
- **Trade 2** BOT1 ONIX+METAL COAT ↔ BOT2 RATTATA: B pressed every 400 ms from 22 s after the A on BOT2, inside the same call: "What? ONIX is evolving!", cycle, back to the menu with ONIX holding the item → case 5 passes ("stopped evolving" text skipped by the repeated B presses, not seen).
- **Not watched:** the no-evolution side's "Communication standby…"/"SAVING…" flow (its tab was hidden both times; the DB and menu were right afterwards).
- **Minor (M09 trade menu, not this milestone):** at "Is this trade okay?" the SUMMARY/TRADE action box is left behind the YES/NO box.
- **Party state now:** BOT1 STEELIX(OT BOT2), PIDGEY, RATTATA(OT BOT2). BOT2 KADABRA+EVERSTONE(OT BOT1), ONIX+METAL COAT(OT BOT1). Both in the Trade Center at the trade menu (games open in tabs 0 = BOT1, 1 = BOT2).
- **Next (in order):** 1) watch the non-evolving side's "SAVING…" flow once (e.g. BOT2 ONIX ↔ BOT1 PIDGEY with BOT1's tab in front, BOT2 lets ONIX evolve or not as needed); 2) case 7: close both tabs (`about:blank`), set BOT2 to `pallet_town_players_house_1f` (11,7) facing north in PG (grass at (10-12,5-6), land table rattata 2-3, pidgey 3-5, caterpie 2-3…), KADABRA lead (traded, OT BOT1, L10 obeys with 0 badges), walk in the grass, win a battle, compare the EXP shown/`exp` column with `floor(floor(baseExp·L/7)·1.5)` (`mic-battles/src/exp.ts:159,197`; Gen 4 base EXP Rattata 57, Pidgey 55, Caterpie 53); 3) one phone viewport check (e.g. 390×844) of the trade scene or SUMMARY; 4) write the result, front matter, Log.
- **How it was played:** see session 1's notes below. Tokens: `POST {preview}/api/dev/bots` `{"count":2,"refreshOnly":true}` with `X-Bots-Secret` (secret saved by the session in `/tmp/pu/secret`, else `MOOI_DEVELOPMENT_BOTS_SECRET`). Login: goto `/play?bot=<token>`, click, Enter ×4, `z` (CONTINUE). Direct Corner: the attendant tile is one right of where (10,4) spawns you; ~11 `z` (3.5 s apart) reach "Please decide…"; then one `z` shows "The other player must then choose JOIN GROUP" **with** the menu: Down+`z` = BECOME LEADER (a plain `z` there joins). Member: `z` JOIN, `z` on the leader; leader `z` accepts. Trade Center: leader up 2, left 1, up 1; member up 2, right 1, up 1, left 1. Trade menu: grid 2 columns, A → SUMMARY/TRADE; cancel = CANCEL button + YES on both sides. Scene + evolution start ≈ 35 s after both A.

### 2026-11-23: attempt 1, in progress (tester session 1 checkpointed)

Preview deployed fine (build and healthchecks green). Desktop 1280×720, one tab per bot, through `https://mooi.skypea.dev/preview/<id>/` (`MOOI_DEVELOPMENT_PUBLIC_URL`'s origin). BOT2 leader, BOT1 member.
- **Case 1 Scene:** ✅ BOT1 KADABRA ↔ BOT2 ONIX, recorded on BOT1 frame by frame: fade, "KADABRA will be sent to BOT2.", flash, Poké Ball, "Bye-bye, KADABRA!", GBA, signal circle and beam, both pics crossing, ball down, "BOT2 sent over ONIX.", "Take good care of ONIX!". Sounds not checked (no audio in the pane). Not compared with the emulator.
- **Case 2 Trade evolution:** ✅ twice: BOT2 (leader) KADABRA → ALAKAZAM ("Congratulations! Your KADABRA evolved into ALAKAZAM!"); BOT1 (member) MACHOKE → MACHAMP, full Phase 6 scene. PG: species 65 and 68 saved, `trades` 2 rows. After an evolution both menus come back (no "SAVING…" on that path, as built).
- **Case 3 Item evolution, first try:** ONIX + METAL COAT received (on BOT1, then on BOT2): "What? ONIX is evolving!", then "……?" and back to the menu, ONIX unevolved, item kept. **Cause: not a trade bug:** `battle/evolution.ts` `cycle()` returns `locked` (FireRed's rule, `gText_EllipsisQuestionMark`) without the National Pokédex for a species past #151; STEELIX is #208 and the bots had `pokedex_national = false`. Set to true for both bots (game closed) to play case 3 again. **Open question for the planner (not a failure recorded yet):** D24 lists Onix/Scyther/Seadra/Porygon… evolutions into non-Kanto species; with FireRed's lock, a player without the National Dex sees "……?". Gen 4 has no such lock; decide whether it stays.
- **Setup used (fresh preview DB):** `POST /api/dev/bots` `{"count":2,"map":"pokemon_center_2f"}` (secret `MOOI_DEVELOPMENT_BOTS_SECRET`; tokens last 15 min, `refreshOnly` renews), parties inserted into `trainer_pokemon` before first login (IVs 31, ball 4, OT = own `trainer_id`); bot-1 moved off its unreachable spawn (`0,2`) to (5,6). Item ids: Everstone 195, Metal Coat 199. `pokedex_national` set true for both.
- **Party state now (PG):** BOT1: MACHAMP(OT BOT2), KADABRA+EVERSTONE, SCYTHER+METAL COAT, PIDGEY. BOT2: ALAKAZAM(OT BOT1), ONIX+METAL COAT, RATTATA, RATTATA. Both bots reconnected, standing at the 2F Direct Corner (10,4), no room open.
- **Next (in order):** check the followers in the 2F (case 8: BOT1 should show MACHAMP, BOT2 ALAKAZAM; then live in the room after a lead trade); open a room again; trade BOT1 KADABRA+EVERSTONE ↔ BOT2 ONIX+METAL COAT: BOT2 no evolution + "SAVING…" flow (case 4), BOT1 presses B during ONIX's evolution → stays, item kept (case 5); then BOT1 ONIX ↔ BOT2 RATTATA, BOT2 lets it evolve → STEELIX, item gone (case 3); SUMMARY of ALAKAZAM on BOT2: "Met in a trade.", OT BOT1 (case 6; Pokédex caught already seen in PG: bits for 64/65 and 95); battle with the traded one for 1.5× EXP (case 7: move BOT2 to `pallet_town_players_house_1f` grass (10-12,5-6) in PG with the game closed); phone viewport once.
- **How it was played (saves time):** Playwright `browser_run_code_unsafe` on `page.context().pages()[i]`, `bringToFront()` before acting (hidden tabs pause rendering but the game logic still advanced: BOT2's evolution finished while hidden). Keys: `z` A, `x` B, arrows (first press turns, 200 ms hold = one step). Direct Corner: from the 2F spawn walk to (10,4), face up, A; the dialog's first menu: TRADE CENTER; "JOIN GROUP / BECOME LEADER" appears after "Please decide which of you two will become the LEADER." (A by default joins). Trade Center: from the entrance Up 2 to row 6, then chair_0 (4,5) / chair_1 (7,5). Frame sheets: screenshot buffers → base64 → a new page's `setContent` grid → one screenshot (no PIL here). "Is this trade okay?" needs A on **both** sides.

## Log

- 2026-11-23: session 1 checkpoint: FireRed's wireless scene read and noted in Resume Here; client next.
- 2026-11-23: session 1: server (contracts, trade evolution, Pokédex in the swap, menu held until both scenes end); Go build + vet green.
- 2026-11-23: session 2 checkpoint: client art, tables, callbacks, after-scene flow and SUMMARY memo looked up and noted in Resume Here; no code yet.
- 2026-11-23: session 3 checkpoint: `trade-scene.ts`, its art, sounds and texts written (tsc green); trade-menu wiring half done (tsc red until the overworld host methods); next in Resume Here.
- Recovery needed (builder, step cbf208b9-663f-423c-8cb3-be926e1c16f1): The provider's usage limits ran out; Mooi stopped the session and saved its work. *State* may be stale; see the last `chore(factory): checkpoint` commit.
- 2026-11-23: session 4: trade menu wired to the scene, the evolution and the save; overworld host `sceneDone`/`evolve`; SUMMARY "Met in a trade."; tsc + vite build green; `status: testing`.
- 2026-11-23: tester session 1 checkpoint: preview green; cases 1-2 pass; case 3's first "……?" traced to FireRed's National Dex lock (bots given the National Dex, question for the planner); rest of the plan in *Tests*.
- 2026-11-23: tester session 2 checkpoint: preview redeployed (fresh DB, set up again); cases 3, 4, 5, 6, 8 pass; left: SAVING… flow watched once, case 7 EXP, phone check (plan in *Tests*).
