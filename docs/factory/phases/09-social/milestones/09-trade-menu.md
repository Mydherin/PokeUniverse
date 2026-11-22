---
id: 09-trade-menu
title: "Trade: menu and transaction"
status: building
depends: [08-link-rooms]
context: [context/social.md, context/references.md]
---

# M9: Trade, Menu and Transaction

Part of [Phase 9](../PHASE.md). Decisions: [context/social.md](../../../context/social.md#trading) D21-D23. References: `trade.c`, `cable_club.c` seats.

## Resume Here

**Session 2 (2026-11-22): server done, Go build and vet green; next is the client (below), nothing of it written.** Back up both saves before playing.

**Server, as built:** contracts (`social.proto`: `LinkIntent` `trade_offer`(9) `TradeOffer{slot}`, `trade_confirm`(10) `TradeConfirm{yes}`, `trade_cancel`(11); `LinkEvent` `trade_state`(8) `TradeState{stage, own_party, other_party, own_pick, other_pick, notice}`, `trade_done`(9) `TradeDone{trade_id, own_slot, other_slot}`, `trade_member`(10) replica to replica; `TradeStage` CHOOSING/CONFIRMING/CANCELED/ENDED, `TradeNotice` CANCELED/FRIEND_WANTS_TO_TRADE/ONLY_MON; `world.proto` `ScriptStep.trade_seat = 16`); `trades` table + `pokemon.Trade` (D23); `world/trade.go` (leader decides, member forwards; `watchPartner` every 5 s via `live.Store.InZone`); wired in `link_room.go` (`Link`, `onLinkHere`, `linkEnded` clears the trade), `encounter.go` `stepped` (`tradeSeat` first), `interact.go` (`trade_center.attendant`), `Map.TriggerAt` in `maps.go`. Texts for the client already added to `texts.json` and the manifest key `cable_club.take_seat_start_trade`.

**What the client gets (contract for step 7):** stepping on a seat → a Script with one `trade_seat` step; the script stays open (player locked) through the menu and ends only by the client's `ScriptDone`. B in the seat before the menu → send `trade_cancel`, then `ScriptDone`. Menu opens on `TradeState{CHOOSING, own_party, other_party}` (also sent again after each trade and to choose again is a `CANCELED` notice + A). `CONFIRMING{own_pick, other_pick}` → "Is this trade okay?". `CANCELED{notice}`: ONLY_MON (this side only, stay choosing), CANCELED / FRIEND_WANTS_TO_TRADE (A → choosing). `ENDED` → fade to the field, `ScriptDone`. `TradeDone` → party already resent; back to the menu (the CHOOSING that follows). `Ended` link event anywhere in it → close, `ScriptDone`, then the existing drop flow.

**Next, exactly (client; nothing of it written yet, all looked up in session 2):**
1. **Assets:** `Makefile` `FIRERED_GFX` += `trade`. `manifest.ts`: a `TRADE_GRAPHICS` set + `loadTrade()` (like `loadStorage`: with `loadParty()`, which the summary and `partyHoldIcons` need): `tradeMenu {png trade/menu.png (296×32, 148 tiles), pal trade/menu.pal (3 palettes → BG 0-2), bin trade/menu.bin (32×20 used), bpp4}`, `tradeMonBox {bin menu_mon_box.bin (6×3)}`, `tradePartyBox {bin party_box_map.bin (15×17)}`, `tradeMovesBox {bin moves_box_map.bin (15×17)}`, `tradeStripes2/3 {bin stripes_bg2_map.bin / stripes_bg3_map.bin (32×32 u16)}`, `tradeCursor {png cursor.png 64×64 = 2 frames 64×32, pal cursor.pal}`, `tradeTextPal {pal text.pal}`. `sounds.json` += `"mus_game_corner": { "song": "mus_game_corner" }`. Texts already in `texts.json`.
2. **`trade-menu.ts`** (model: `option-menu.ts` for setup `gba.reset()`, `initBg`, `gba.tasks.create`, `gba.setMain(gba.runFrame)`, `setVBlank(standardVBlank)`): BG0 windows (own tiles; user frame `userFrame(flow.options.frame)` at tile 1 pal 14, `stdWindowFrame` + `textWindowPal3` at tile 0x14 pal 12, `stdMenuPal` at pal 13 and 15); BG1 menu.bin (priority 1), BG2/BG3 stripes (priority 2/3, same tiles as BG1), BG2 x++ and BG3 x-- every frame. Windows (trade.c `sWindowTemplates` 596): 0 message (4,7) 22×4 pal15 0x1e; 1 SUMMARY/TRADE (17,15) 12×4 0x76; 2-13 nicknames 8×2 pal13 (slot i of side s = 2+6s+i; positions in trade.c 615-708); 14 (2,5) 14×2, 15 (3,8) 11×8, 16 (17,5) 14×2, 17 (18,8) 11×8 (selected mon name/moves); YES/NO (21,13) 6×4 0x24e → `new YesNoMenu(flow, bg0, t, FontId.NormalCopy2, 0, 2, 0, 1, 14)`. Coordinates: `sTradeMonSpriteCoords` cols 1,8,16,23 rows 5,10,15 (cancel 23,18); icon at (c*8+14, r*8-12) `new MonIcon(flow, species, x, y, 1, 1)` + `iconAnimForHp(hpBarLevel(hp,max))`; cursor (c*8+32, r*8), on CANCEL (224,160) frame tile 32; level digits on BG1 tile 0x60+tens / 0x70+ones at `sTradeMonLevelCoords`, gender tile 0x84 ♂ / 0x85 ♀ / 0x83 none at (x+1,y-1), after copying the mon box at `sTradeMonBoxCoords` (`PrintLevelAndGender` 2397). Cursor moves: `sCursorMoveDestinations` (trade.c 349-431, copy the table), SE_SELECT on change, key repeat. Nickname: Small font, x=(64-w)/2, y=4, colors [0,1,2]. Text sprites 32×16 (`toTiles(..., [4,2])` as `storage/box-view.ts` `createTitle`, colors [0,14,15], NormalCopy1, palette `text.pal`): player name 3 sprites at ((56-w)/2+48+32i, 9), partner name at ((56-w)/2+168+32i, 9), CANCEL 2 at (215/247,151), bottom row 6 at (24+32i,150) ("Choose a POKéMON." / "Cancel trade?" / "Is this trade okay?"). Held item: `partyHoldIcons` sprite following the icon (+4,+10), MAIL anim 1 (`party-menu.ts` `HELD_ITEM_TEMPLATE`). Plays `mus_game_corner`, fades in.
   Flow (trade.c 1830-2160, 2241-2326): A on own → action window (user frame, `CursorMenu` NormalCopy2, x 8, 16 apart): SUMMARY → fade, `startSummary(flow, host, slot, done)` with a read-only `PartyHost` (`new PartyState(create(PartySchema,{pokemon}))`, `movesLocked: true`, others no-op), back → rebuild the menu with the cursor on the last shown; TRADE → local last-usable check (FireRed CANT_TRADE_LAST_MON: message `gText_Trade_OnlyPkmnForBattle`, A → redraw) else "Communication standby…", cursor hidden, send `tradeOffer{slot}`. A on partner → its summary. A on CANCEL → bottom "Cancel trade?" + YES/NO: YES → "Waiting for your friend to finish…", send `tradeCancel`, restore partner windows 4-5; NO/B → redraw. Events: CONFIRMING → clear message, both selected mons slide over 20 frames to (46 or 166, 28), the side's other icons/names hidden, party box then moves box tilemap at (15s,0), name (Small, (80-w)/2, 4) + 4 moves (NormalCopy1, newline-separated, `assets.moveName`), level/gender at box (4,3)/(19,3); then bottom "Is this trade okay?", YES/NO after 120 frames: YES/NO both → "Communication standby…" + `tradeConfirm{yes}`. CANCELED notice → message (CANCELED/FRIEND_WANTS_TO_TRADE/ONLY_MON), A → `CB_HandleTradeCanceled` (redraw both sides). ENDED → fade out → done("ended"). TradeDone → 16 frames, fade out, rebuild on the CHOOSING that follows (new parties). Messages: `drawStdFrame(win0, 0x14, 12)`, NormalCopy2 at (0,2). Keep incoming events in a queue, handled when not in the summary.
3. **`overworld.ts`:** `runScript` case `tradeSeat`: show `CableClub_Text_PleaseWaitBCancel`; once printed, B → `link.link({intent:{case:"tradeCancel",value:{}}})`, hide, `endScript(true)`; `linkDropped` → hide, `endScript(true)` (the existing `dropLink` then runs). `linkEvent`: `tradeState`/`tradeDone` → the open menu's `event`, or CHOOSING while on the seat step → `message.hide()`, fade to black, `this.fieldOpening = () => { away = true; stop music; loadTrade then startTradeMenu(...) }` (pattern of `useOnField`); `ended` also goes to the menu (it fades out, done("dropped")), then the existing `linkDropped = true`. Menu done → `away = false`, `enter(false)`, map music, `endScript(true)`. Partner name: `this.linked.partner.name` via `flow.encode`.
4. `pnpm` type check/build of `spa-pokeuniverse` (`tsc --noEmit && vite build`; run through the node image like the Makefile, the workspace can't be mounted: tar in/out as for buf), then check *Client*, `status: testing`, `test: none`.

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
- [ ] **Client:** `trade.c`'s menu (both parties' icons, cursor, SUMMARY on either side's Pokémon, TRADE, CANCEL), waiting text, "Is this trade okay?", "Cancel trade?", back to the menu after a trade (M10 adds the scene between).

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Trade | Both pick, both YES | Pokémon swapped in both parties, saved | ⬜ |
| 2 | SUMMARY | View the other's Pokémon | FireRed's summary, read only | ⬜ |
| 3 | Change mind | One changes pick after the other said YES | Both asked again | ⬜ |
| 4 | Cancel | One cancels | Both back to choosing; leaving ends the room | ⬜ |
| 5 | Last usable | Offer your only usable Pokémon | FireRed's refusal | ⬜ |
| 6 | Held item, Egg | Trade a holder and an Egg | Item travels; Egg traded | ⬜ |
| 7 | Crash mid-trade | Kill a replica right after both YES | After reconnect: swapped for both or for neither | ⬜ |
| 8 | Disconnect | One drops during the menu | Nothing swapped; other returned to the counter | ⬜ |

## Commands

- Go (from `mic-core/`, with `/tmp/pu/go/bin` on `PATH`, `GOPATH=/tmp/pu/gopath GOCACHE=/tmp/pu/gocache`): `touch maps/x.binpb && go build ./... && go vet ./...` (`maps/*.binpb` is gitignored). sqlc: `/tmp/pu/sqlc generate` in `mic-core/`.

## Decisions

- **The offer is in the leader's memory only; no Redis mirror** (differs from the task's "plus Redis"): a crash ends the room (link-room maps are never reconnected to), so nothing of the offer can resume; what must survive is the swap, applied once by its `trades` row keyed by a random 128-bit trade ID (D23). *Why:* a Redis copy nothing reads adds writes for no case.
- **The partner's party travels as `party.v1.Pokemon`** (the summary's own data, no IVs/EVs), read from PostgreSQL by the leader's replica when both sit.
- **A crashed partner replica:** each seated side checks every 5 s that the partner is still online in the room's zone (Redis); gone → its party is read again (the swap may have been saved) and the link ends as a drop (case 7 on two replicas).
- **"Change mind" (case 3) is FireRed's:** a pick can't change; NO at "Is this trade okay?" cancels for both, they choose again and both are asked again.

## Log

- 2026-11-22: session 2: server wired (partner watch, seats, attendant, link wiring); Go build + vet green; client looked up (Resume Here), not started.
- 2026-11-22: session 1: contracts, `trades` table and swap transaction, server trade draft (`world/trade.go`); Go build red (placeholder `TriggerAt` type), next steps in Resume Here.
