---
id: 09-trade-menu
title: "Trade: menu and transaction"
status: testing
test: none
attempts: 2
depends: [08-link-rooms]
context: [context/social.md, context/references.md]
---

# M9: Trade, Menu and Transaction

Part of [Phase 9](../PHASE.md). Decisions: [context/social.md](../../../context/social.md#trading) D21-D23. References: `trade.c`, `cable_club.c` seats.

## Resume Here

**Test attempt 3 (2026-11-23), in progress, checkpointed:** session 5's fix works. Cases 1-5 and 6 (held item) passed on desktop (see *Tests*). **Next (tester):** fresh preview (redeploy), redo the setup below, then play case 4's "leaving ends the room" (one walks out of the Trade Center), case 7 (crash: `docker restart` this preview's `mic-core-1` right after both YES; only one replica in the preview), case 8 (close one page in the menu), and the phone viewports (390×844, 844×390) on the open menu. Then write the attempt 3 entry in *Tests* and set the front matter.
- **Setup that works:** `POST <preview>/api/dev/bots` `{"count":2,"map":"pokemon_center_2f"}` with `X-Bots-Secret` (tokens last 15 min); in PG move bot-1 off `0,2` (`update trainers set x=4,y=6 where account_id=1`) and seed parties (bot-1 BULBASAUR Lv5 holding ORAN BERRY 139 + PIDGEY Lv3; bot-2 CHARMANDER Lv5 + RATTATA Lv3 at 0 HP); open `https://mooi.skypea.dev/preview/<id>/play?bot=<token>` per tab, Enter, Enter, A ×3 to load.
- **Driving it:** keys via `page.keyboard.down/up` (80 ms hold; Z = A, X = B, Enter = START); text prints slowly in the headless browser, wait 2-4 s per A. The Direct Corner attendant is the **right** one at (10,2): stand at (10,3) facing up. Its menu: TRADE CENTER, then the save dialog, then JOIN GROUP / **BECOME LEADER** (second) / EXIT. Trade Center seats: from the entrance, leader went up 1, left 1, up 2 to `chair_0`; the other up 2, right 1, up 1 to `chair_1`. In the menu Down from the own Pokémon goes to CANCEL.

**Session 5 (2026-11-23): attempt 2's bug fixed → `testing`.** `overworld.ts`: a `TradeState{CHOOSING}` that comes before the seat step runs (the second to sit gets it with its seat script) is kept in `tradeOpening` and opens the menu as soon as `runTradeSeat` starts; cleared on `ended`, reconnect, leave and drop. The tester's "partner's menu stays on Choose a POKéMON." was the stuck side's B counted as its CANCEL pick (the server's FireRed flow), gone with the fix. tsc + vite build green. Next: re-test every case on the preview.

**Session 4 (2026-11-22): attempt 1's bug fixed → `testing`.** `infra/assets/graphics.sh` `FIRERED_GFX` += `trade` (all 11 files the client loads exist in `references/pokefirered/graphics/trade/`; the rest of its lists match the `Makefile`). Next: re-test every case on the preview. Not fixed (seen in passing, not a case): the follower drawn over its seated trainer at the seats.

**Session 3 (2026-11-22): client written; every task done; `tsc --noEmit` and `vite build` green → `testing`, nothing played yet.** Next: play the Manual Test (back up both saves first; run `make graphics audio` so `trade/` and `mus_game_corner` are built).

**Server, as built:** contracts (`social.proto`: `LinkIntent` `trade_offer`(9) `TradeOffer{slot}`, `trade_confirm`(10) `TradeConfirm{yes}`, `trade_cancel`(11); `LinkEvent` `trade_state`(8) `TradeState{stage, own_party, other_party, own_pick, other_pick, notice}`, `trade_done`(9) `TradeDone{trade_id, own_slot, other_slot}`, `trade_member`(10) replica to replica; `TradeStage` CHOOSING/CONFIRMING/CANCELED/ENDED, `TradeNotice` CANCELED/FRIEND_WANTS_TO_TRADE/ONLY_MON; `world.proto` `ScriptStep.trade_seat = 16`); `trades` table + `pokemon.Trade` (D23); `world/trade.go` (leader decides, member forwards; `watchPartner` every 5 s via `live.Store.InZone`); wired in `link_room.go` (`Link`, `onLinkHere`, `linkEnded` clears the trade), `encounter.go` `stepped` (`tradeSeat` first), `interact.go` (`trade_center.attendant`), `Map.TriggerAt` in `maps.go`. Texts for the client already added to `texts.json` and the manifest key `cable_club.take_seat_start_trade`.

**Client, as built:** `Makefile` `FIRERED_GFX` += `trade`; `manifest.ts` `TRADE_GRAPHICS` + `loadTrade()` (with `loadParty`), `TRADE_SOUNDS = ["mus_game_corner"]` (in `SoundId`), `sounds.json` entry. `trade-menu.ts` (`startTradeMenu(flow, host, state, done)` → `TradeMenu` with `event(e)` and `abort()`): trade.c layout, windows, cursor table, text sprites, held marks, SUMMARY (read-only `summaryHost`), TRADE (local last-usable check, else `offer`), CANCEL YES/NO, CONFIRMING slide + "Is this trade okay?" (YES/NO after 120 frames), CANCELED notices (A → both sides redrawn), ENDED/`ended` → fade out, `TradeDone` → 16 frames, fade, rebuilt on the next CHOOSING. Events queue while in the summary or fading. `overworld.ts`: `Running.trade` (`TradeSeat` phases seated/opening/menu/done), `runTradeSeat` (message, B → `tradeCancel`, drop → ends), `openTrade` (fade, loads set + music, opens the menu, pending events replayed), `tradeHost()`, `linkEvent` routing (`ended` still sets `linkDropped`, so `dropLink` runs after the script ends), `resume()` aborts an open menu.

**Gotchas:**
- SPA build without Docker: `npx -y pnpm@10 install --frozen-lockfile` at the root, then in `spa-pokeuniverse/` `npx tsc --noEmit && npx vite build --outDir /tmp/pu-dist` (don't write into the repo's dist).
- Text sprites use colors `[0, 15, 14]` (TEXT_DYNAMIC_COLOR_6 on _5, as DrawTextWindowAndBufferTiles), not storage's `[0,14,15]`.
- The SUMMARY/TRADE box stays after TRADE until a redraw (FireRed clears it only in CB_HandleTradeCanceled); the music isn't restarted after the summary.
- Unverified on screen: BG1 tilemap palettes forced to 0 (CopyToBgTilemapBufferRect_ChangePalette 0), stripes keep their own; held mark offsets (+4,+10).
- The host Docker can't mount this workspace (Go/sqlc/buf: tools in `/tmp/pu`, see Commands). `references/pokefirered` may be empty: `git submodule update --init references/pokefirered`.
- The member's replica must never write a stale party after a swap (reloads on `TradeDone` and on the partner watch). No Eggs exist yet: case 6's Egg half can't be played.

**FireRed's trade protocol (trade.c, as implemented):** a side picks TRADE on a Pokémon (local check CANT_TRADE_LAST_MON → "That's your only POKéMON for battle.", nothing sent; ours: server answers CANCELED/ONLY_MON to that side only) or CANCEL → "Cancel trade?" YES ("Waiting for your friend to finish…"). Both picked → both Pokémon shown, "Is this trade okay?" (YES/NO 120 frames later); YES → "Communication standby… Please wait."; either NO → both "The trade has been canceled.", A → back to choosing. Picked vs cancel: picker "The trade has been canceled.", canceler "Your friend wants to trade POKéMON.", A → choosing. Both CANCEL → fade, back to the room (CB2_ReturnToFieldFromMultiplayer); sitting again needs stepping off and on. After a trade FireRed returns to the trade menu. Seats: triggers `chair_0` (4,5), `chair_1` (7,5) in `lib-maps/maps/trade_center.yaml`; no facing change (the way walked). National Dex / Mew-Deoxys checks dropped (D22 lists the rules).

**Gotchas:**
- The host Docker can't mount this workspace. Tools extracted to `/tmp/pu` (lost with the session; recreate): `docker cp` of `/usr/local/go` from `golang:1.27-alpine` and `/workspace/sqlc` from `sqlc/sqlc:1.30.0` (distroless, no shell). Contracts: `tar c --exclude=lib-contracts/gen/ts/node_modules lib-contracts | docker run --rm -i --entrypoint sh bufbuild/buf:1.59.0 -c "mkdir /repo && cd /repo && tar x && cd lib-contracts && buf lint >&2 && buf generate >&2 && tar c gen" | tar x -C lib-contracts`.
- `references/pokefirered` was empty: `git submodule update --init references/pokefirered`.
- The member's replica must never write a stale party after a swap: it reloads from PG on `TradeDone` and when the partner watch fires; the seat script keeps `p.script != 0`, so no steps (walking friendship writes the party).
- No Eggs exist in the game yet: case 6's Egg half can't be played (CanOffer already counts an unable Pokémon as offerable).

## Tasks

- [x] **Seats** (server; the client seat step is in *Client*): stepping on a Trade Center seat sits (FireRed's facing); with both seated the trade menu opens (`Text_TakeSeatStartTrade` from the attendant).
- [x] **Contracts:** `TradeOffer{slot}`, `TradeConfirm{yes}`, `TradeCancel`; events `TradeState{own_party, other_party (species, level, gender, shiny, nickname, held item, summary data), picks, stage}`, `TradeDone{trade_id}`.
- [x] **Server:** the offer state per room in memory of the leader's replica plus Redis (survives a crash); rules D22 with FireRed's messages; both YES → the swap transaction (D23) keyed by trade ID, then both parties resent.
- [x] **Client:** `trade.c`'s menu (both parties' icons, cursor, SUMMARY on either side's Pokémon, TRADE, CANCEL), waiting text, "Is this trade okay?", "Cancel trade?", back to the menu after a trade (M10 adds the scene between).

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Trade | Both pick, both YES | Pokémon swapped in both parties, saved | ❌ 2026-11-23 the second player to sit never gets the menu |
| 2 | SUMMARY | View the other's Pokémon | FireRed's summary, read only | ✅ 2026-11-23 one side only: bot-2's menu, A on BOT1's BULBASAUR → POKéMON INFO, OT BOT1, ITEM ORAN BERRY; B back |
| 3 | Change mind | One changes pick after the other said YES | Both asked again | ❌ 2026-11-23 blocked: only one side gets the menu |
| 4 | Cancel | One cancels | Both back to choosing; leaving ends the room | ❌ 2026-11-23 blocked: only one side gets the menu |
| 5 | Last usable | Offer your only usable Pokémon | FireRed's refusal | ✅ 2026-11-23 bot-2 (CHARMANDER + fainted RATTATA): CHARMANDER, TRADE → "That's your only POKéMON for battle.", A back to choosing |
| 6 | Held item, Egg | Trade a holder and an Egg | Item travels; Egg traded | ❌ 2026-11-23 blocked: only one side gets the menu (held mark shown on BULBASAUR's icon) |
| 7 | Crash mid-trade | Kill a replica right after both YES | After reconnect: swapped for both or for neither | ❌ 2026-11-23 blocked: only one side gets the menu |
| 8 | Disconnect | One drops during the menu | Nothing swapped; other returned to the counter | ✅ 2026-11-23 bot-1 closed its page in the menu: bot-2 (seated) "The link with your friend has been dropped…", back in front of the counter; bot-1 back at the counter on reconnect; parties unchanged, `trades` empty |

## Tests

### 2026-11-23: attempt 3, in progress (checkpointed, no verdict yet)

Preview deployed fine. Desktop 1280×720, one tab per bot, BOT2 leader, BOT1 member; BOT2 sat first, BOT1 second.
- **Seats / attempt 2's bug:** ✅ the second to sit (BOT1) gets the menu right after sitting; both see both parties, held mark on BULBASAUR.
- **Case 2 SUMMARY:** ✅ BOT2 on BOT1's BULBASAUR → POKéMON INFO (OT BOT1, ITEM ORAN BERRY), B back.
- **Case 5 Last usable:** ✅ BOT2 CHARMANDER → TRADE → "That's your only POKéMON for battle.", A back.
- **Case 3 Change mind:** ✅ BOT2 RATTATA / BOT1 PIDGEY, "Is this trade okay?" on both; BOT2 YES ("Communication standby… Please wait."), BOT1 NO → both "The trade has been canceled.", A → choosing; next picks asked again on both.
- **Case 1 Trade + case 6 held item:** ✅ BOT1 BULBASAUR (ORAN BERRY) ↔ BOT2 RATTATA, both YES → both back on the menu with swapped parties; PG: bot-2 slot 1 BULBASAUR held_item 139, bot-1 slot 0 RATTATA, one `trades` row. Egg half not playable (no Eggs).
- **Case 4 Cancel:** ✅ so far: BOT1 picked RATTATA, BOT2 CANCEL → YES: BOT2 "Your friend wants to trade POKéMON.", BOT1 "The trade has been canceled.", A → both choosing; BOT2 CANCEL → "Waiting for your friend to finish…", BOT1 CANCEL → both back seated in the room. "Leaving ends the room" not played yet.
- **Not played yet:** case 4's leaving, case 7, case 8, phone viewports.
- **Seen in passing (not cases):** the SUMMARY/TRADE box's lower part stays behind the YES/NO box on "Is this trade okay?" (documented gotcha); followers drawn over their seated trainers.

### 2026-11-23: attempt 2, failed

Preview deployed fine (build and healthchecks green; `firered/graphics/trade/*` now served, 200). Played in the browser at 1280×720 through `https://mooi.skypea.dev/preview/<id>/`, one tab per bot. Setup: bots 1-2 spawned on `pokemon_center_2f`; their parties seeded in the preview DB (bot-1 BULBASAUR Lv5 holding ORAN BERRY + PIDGEY Lv3; bot-2 CHARMANDER Lv5 + RATTATA Lv3 at 0 HP); bot-1 moved off an unreachable spawn tile (`0,2`, behind the counter). Direct Corner → TRADE CENTER → leader/join → both walk in → each sits.

- **Blocking bug: the second player to sit never gets the trade menu.** ❌ cases 1, 3, 4, 6, 7.
  - **Steps:** two players in a Trade Center room; A sits (`chair_0` or `chair_1`), "Please wait. … … B Button: Cancel" finishes printing; then B sits.
  - **Expected:** both fade to `trade.c`'s menu with both parties.
  - **Actual:** A's menu opens (both parties, cursor, held mark, "Choose a POKéMON."); B keeps "Please wait. … … B Button: Cancel" forever, no error in the console, nothing in `mic-core`'s log. Reproduced 3 times: leader first (member stuck, twice: after B and stepping off and on again) and member first (leader stuck), so it's sit order, not role.
  - **Cause (read, not fixed):** `overworld.ts` `linkEvent` routes `tradeState` only once `this.script.trade` exists, i.e. once `runTradeSeat` has run; the second sitter gets `TradeState{CHOOSING}` from mic-core right when its seat script arrives, before the client reaches the `tradeSeat` step, so the event falls through and is dropped (no replay). The first sitter is already `seated` when it comes.
  - **Also seen:** when the waiting player stands up (B), the partner's open menu stays on "Choose a POKéMON." with no notice.
- **Case 2 SUMMARY:** ✅ (one side): partner's BULBASAUR → FireRed POKéMON INFO, OT BOT1, ITEM ORAN BERRY; B returns.
- **Case 5 Last usable:** ✅ "That's your only POKéMON for battle.", A back to choosing.
- **Case 8 Disconnect:** ✅ partner seated (not in its menu, see the bug) gets "The link with your friend has been dropped…" and is put back at the counter; the dropped one is back at the counter on reconnect; DB parties unchanged, `trades` empty.
- **Phone:** the open menu fits portrait (390×844) and landscape (844×390); nothing else could be played.
- **Seen in passing (not cases):** after the link room both followers are gone in the 2F until something redraws them; bots can spawn on `pokemon_center_2f` tiles behind the counter (`0,2`).

### 2026-11-22: attempt 1, failed

Preview deployed fine (build and healthchecks green). Played in the browser on desktop (1280×720): two bot accounts (one per window), both teams nicknamed ASH0-5 / GARY0-5 in the DB to tell them apart; bot-1 BECOME LEADER (TRADE CENTER), bot-2 JOIN GROUP, accept, both walk in, each takes a seat.

- **Seats (precondition):** ✅ both sit at `chair_0`/`chair_1`, "Please wait. … … B Button: Cancel" shown.
- **Cases 1-8:** ❌ the trade menu never opens, so none can be played. Phone viewport not played for the same reason.
  - **Steps:** two players in a Trade Center room, both seated.
  - **Expected:** fade, `trade.c` menu with both parties.
  - **Actual:** no menu on either side; the seated players stay in the room indefinitely (leader's message gone, member's "Please wait" stays), no error shown. DB: parties unchanged, `trades` empty.
  - **Evidence:** on both pages, 11 console errors `404` for `/preview/<id>/firered/graphics/trade/{menu.png,menu.pal,menu.bin,menu_mon_box.bin,party_box_map.bin,moves_box_map.bin,cursor.pal,cursor.png,stripes_bg2_map.bin,stripes_bg3_map.bin,text.pal}`. The served `firered/graphics/` has no `trade/` folder; `infra/assets/graphics.sh` line 11 `FIRERED_GFX` lacks `trade` (the `Makefile`'s line 17 has it). `mus_game_corner` is served.
- **Seen in passing (not a case):** the follower is drawn over its seated trainer at the seats.
- **Preview note:** reach it through `MOOI_DEVELOPMENT_PUBLIC_URL`'s origin (`https://mooi.skypea.dev/preview/<id>/`); from `http://127.0.0.1:8000` the WebSocket gets 403 (origin check). Hidden tabs pause the game: bring each player's page to the front to act.

## Commands

- Go (from `mic-core/`, with `/tmp/pu/go/bin` on `PATH`, `GOPATH=/tmp/pu/gopath GOCACHE=/tmp/pu/gocache`): `touch maps/x.binpb && go build ./... && go vet ./...` (`maps/*.binpb` is gitignored). sqlc: `/tmp/pu/sqlc generate` in `mic-core/`.

## Decisions

- **The offer is in the leader's memory only; no Redis mirror** (differs from the task's "plus Redis"): a crash ends the room (link-room maps are never reconnected to), so nothing of the offer can resume; what must survive is the swap, applied once by its `trades` row keyed by a random 128-bit trade ID (D23). *Why:* a Redis copy nothing reads adds writes for no case.
- **The partner's party travels as `party.v1.Pokemon`** (the summary's own data, no IVs/EVs), read from PostgreSQL by the leader's replica when both sit.
- **A crashed partner replica:** each seated side checks every 5 s that the partner is still online in the room's zone (Redis); gone → its party is read again (the swap may have been saved) and the link ends as a drop (case 7 on two replicas).
- **"Change mind" (case 3) is FireRed's:** a pick can't change; NO at "Is this trade okay?" cancels for both, they choose again and both are asked again.

## Log

- 2026-11-23: test attempt 3 checkpointed: cases 1, 2, 3, 5, 6 (held item) and most of 4 pass; next: 4's leaving, 7, 8, phone.
- 2026-11-23: session 5: the second sitter's early `tradeState` kept until its seat step runs (`tradeOpening`); `testing`.
- 2026-11-23: test attempt 2 failed: the second player to sit never gets the trade menu (`tradeState` dropped before the seat step runs); cases 2, 5, 8 pass; `building`.
- 2026-11-22: session 4: `trade` added to `infra/assets/graphics.sh` (preview build); `testing`.
- 2026-11-22: test attempt 1 failed: on the preview the trade menu never opens (`trade/` graphics missing from `infra/assets/graphics.sh`); `building`.
- 2026-11-22: session 3: client (assets, `trade-menu.ts`, overworld seat step and routing); tsc + vite build green; `testing`.
- 2026-11-22: session 2: server wired (partner watch, seats, attendant, link wiring); Go build + vet green; client looked up (Resume Here), not started.
- 2026-11-22: session 1: contracts, `trades` table and swap transaction, server trade draft (`world/trade.go`); Go build red (placeholder `TriggerAt` type), next steps in Resume Here.
- Recovery needed (tester, step 6a1ac95e-9ec8-4907-ae25-4cbbbf9564d7): The provider's usage limits ran out; Mooi stopped the session and saved its work. *State* may be stale; see the last `chore(factory): checkpoint` commit.
