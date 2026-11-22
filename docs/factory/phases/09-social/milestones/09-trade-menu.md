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

**Session 2 (2026-11-22): server done, Go build and vet green; next is the client (step 7).** Back up both saves before playing.

**Server, as built:** contracts (`social.proto`: `LinkIntent` `trade_offer`(9) `TradeOffer{slot}`, `trade_confirm`(10) `TradeConfirm{yes}`, `trade_cancel`(11); `LinkEvent` `trade_state`(8) `TradeState{stage, own_party, other_party, own_pick, other_pick, notice}`, `trade_done`(9) `TradeDone{trade_id, own_slot, other_slot}`, `trade_member`(10) replica to replica; `TradeStage` CHOOSING/CONFIRMING/CANCELED/ENDED, `TradeNotice` CANCELED/FRIEND_WANTS_TO_TRADE/ONLY_MON; `world.proto` `ScriptStep.trade_seat = 16`); `trades` table + `pokemon.Trade` (D23); `world/trade.go` (leader decides, member forwards; `watchPartner` every 5 s via `live.Store.InZone`); wired in `link_room.go` (`Link`, `onLinkHere`, `linkEnded` clears the trade), `encounter.go` `stepped` (`tradeSeat` first), `interact.go` (`trade_center.attendant`), `Map.TriggerAt` in `maps.go`. Texts for the client already added to `texts.json` and the manifest key `cable_club.take_seat_start_trade`.

**What the client gets (contract for step 7):** stepping on a seat → a Script with one `trade_seat` step; the script stays open (player locked) through the menu and ends only by the client's `ScriptDone`. B in the seat before the menu → send `trade_cancel`, then `ScriptDone`. Menu opens on `TradeState{CHOOSING, own_party, other_party}` (also sent again after each trade and to choose again is a `CANCELED` notice + A). `CONFIRMING{own_pick, other_pick}` → "Is this trade okay?". `CANCELED{notice}`: ONLY_MON (this side only, stay choosing), CANCELED / FRIEND_WANTS_TO_TRADE (A → choosing). `ENDED` → fade to the field, `ScriptDone`. `TradeDone` → party already resent; back to the menu (the CHOOSING that follows). `Ended` link event anywhere in it → close, `ScriptDone`, then the existing drop flow.

**Next, exactly:**
1. Client: seat step (`CableClub_Text_PleaseWaitBCancel`, B → `trade_cancel` + continue the script), then the `trade.c` menu screen `spa-pokeuniverse/src/game/firered/trade-menu.ts` opened like the party menu (`away`, fade), SUMMARY on either side through `summary.ts` (read only, partner's party from `TradeState.other_party`), "Is this trade okay?" YES/NO after 120 frames, "Cancel trade?", the notices, ENDED → back to the field, `TradeDone` → back to the menu (M10 adds the scene), `ended` link event while in the menu → close it, then `dropLink`. Read `trade.c` 1302-2650 (layout: `LoadTradeBgGfx`, `DrawSelectedMonScreen`, `PrintPartyNicknames`, `TradeMenuMoveCursor`/`GetNewCursorPosition`, art `graphics/trade/menu*.png|bin`, `cursor.png`, `party_box_map.bin`, `moves_box_map.bin`). Texts to add: `gText_IsThisTradeOkay`, `gText_CancelTrade`, `gText_TradeAction_Summary`, `gText_TradeAction_Trade`, `gTradeText_Cancel`, `gTradeText_ChooseAPokemon`, `gText_Trade_CommunicationStandby`, `gText_TradeHasBeenCanceled`, `gText_Trade_OnlyPkmnForBattle`, `gText_WaitingForFriendToFinish`, `gText_FriendWantsToTrade`, `CableClub_Text_PleaseWaitBCancel`, `Text_TakeSeatStartTrade`.

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

- 2026-11-22: session 2: server wired (partner watch, seats, attendant, link wiring); Go build + vet green.
- 2026-11-22: session 1: contracts, `trades` table and swap transaction, server trade draft (`world/trade.go`); Go build red (placeholder `TriggerAt` type), next steps in Resume Here.
