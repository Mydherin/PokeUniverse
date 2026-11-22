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

**Session 1 stopped mid-Server (2026-11-22). The Go build is RED until the two fixes below.** Back up both saves before playing.

**Done (committed, not checked yet):**
- Contracts generated (Go + TS): `social.proto` imports `party/v1`; `LinkIntent` + `trade_offer`(9) `TradeOffer{slot}`, `trade_confirm`(10) `TradeConfirm{yes}`, `trade_cancel`(11) `TradeCancel{}`; `LinkEvent` + `trade_state`(8) `TradeState{stage, own_party, other_party, own_pick, other_pick, notice}`, `trade_done`(9) `TradeDone{trade_id, own_slot, other_slot}`, `trade_member`(10) `TradeMemberAction{member, oneof seated(save µs)/offer/confirm/cancel}` (replica to replica); enums `TradeStage` (CHOOSING, CONFIRMING, CANCELED, ENDED), `TradeNotice` (CANCELED, FRIEND_WANTS_TO_TRADE, ONLY_MON). `world.proto` `ScriptStep.trade_seat = 16` (bool).
- `mic-core/migrations/00022_create_trades.sql` (`trades(id text pk, leader, member, leader_slot, member_slot, traded_at)`), `queries/trades.sql` `InsertTrade :execrows` (ON CONFLICT DO NOTHING), sqlc regenerated (`internal/db/trades.sql.go`).
- `internal/pokemon/trade.go`: `Party.CanOffer(slot)` (another Pokémon with HP > 0), `Pokemon.Same`, `TradeSide`, `Trade(ctx, q, id, leader, member)` (locks both saves in account order, re-reads both parties, inserts the trade row (0 rows = applied already → returns parties), checks offer identity + CanOffer, swaps in place, `Write`s both).
- `internal/world/trade.go` (draft): FireRed's Leader_HandleCommunication on the leader's player (`tradeMenu`: seated, memberSave, open, parties, pick (−1 none, −2 cancel), confirm); `tradeSeat` (trigger `chair_0`/`chair_1` → `startScript` with a `trade_seat` step), `openTrade` (loads the member's party from PG), `leaderIntent`, `resolvePicks` (both slots → CONFIRMING; one cancel → CANCELED with CANCELED / FRIEND_WANTS_TO_TRADE; both cancel → ENDED), `cancelOffer`, `swap` (pgx.BeginFunc + `pokemon.Trade`, then `TradeDone` + `sendMenu` to both, leader `p.party` + `syncFollower` + `sendParty`), member side `tradeIntent` → `toLeader`, `onTradeEvent` (reloads party on TradeDone, forwards), `reloadParty`.

**Next, exactly:**
1. Fix `trade.go`: `TriggerAt` returns `*mapv1Trigger` (placeholder): move it to `maps.go` returning `*mapv1.Trigger`. Remove `awaitTrade`/`tradeAnswerTimeout` and replace with a **partner watch** (decided, see Decisions): add `live.Store.InZone(ctx, id, zone)` to `internal/live/linkrooms.go` (Lua: `EXISTS player:<id>:session` and `HGET player:<id>:pos zone == ARGV[1]`; find the pos key helper in `live.go`, near line 86), and in `tradeSeat` start a 5 s `time.AfterFunc` chain (token in `linkState`) that, while the player is seated in the same room, checks the partner `InZone(z.hash)`; gone → `reloadParty(p)` then `linkEnded(p)`.
2. Add to `linkState` (`link_room.go`): `seated, menu bool`, `trade *tradeMenu`, `watch uint32` (replaces `awaiting`).
3. Wire: `Player.Link` switch in `link_room.go` → `LinkIntent_TradeOffer/Confirm/Cancel`: `z.do(func(){ z.tradeIntent(p, in) })`; `onLinkHere` cases `LinkEvent_TradeMember` → `z.onTradeMember(p, e.TradeMember)`, `LinkEvent_TradeState`/`TradeDone` → `z.onTradeEvent(p, ev)`; `linkEnded` should also clear `p.link.trade`, `seated`, `menu`.
4. `encounter.go` `stepped`: first `if z.tradeSeat(p) { return }`.
5. `interact.go` `npcScripts`: `"trade_center.attendant": {message("cable_club.take_seat_start_trade")}`; manifest key `"cable_club.take_seat_start_trade": "Text_TakeSeatStartTrade"` and the label in `texts.json`.
6. Build: `go build ./... && go vet ./...` (see Commands). Then check Tasks *Seats* (server part), *Contracts*, *Server*; commit.
7. Client (next): seat step (`CableClub_Text_PleaseWaitBCancel`, B → `trade_cancel` + continue the script), then the `trade.c` menu screen `spa-pokeuniverse/src/game/firered/trade-menu.ts` opened like the party menu (`away`, fade), SUMMARY on either side through `summary.ts` (read only, partner's party from `TradeState.other_party`), "Is this trade okay?" YES/NO after 120 frames, "Cancel trade?", the notices, ENDED → back to the field, `TradeDone` → back to the menu (M10 adds the scene), `ended` link event while in the menu → close it, then `dropLink`. Read `trade.c` 1302-2650 (layout: `LoadTradeBgGfx`, `DrawSelectedMonScreen`, `PrintPartyNicknames`, `TradeMenuMoveCursor`/`GetNewCursorPosition`, art `graphics/trade/menu*.png|bin`, `cursor.png`, `party_box_map.bin`, `moves_box_map.bin`). Texts to add: `gText_IsThisTradeOkay`, `gText_CancelTrade`, `gText_TradeAction_Summary`, `gText_TradeAction_Trade`, `gTradeText_Cancel`, `gTradeText_ChooseAPokemon`, `gText_Trade_CommunicationStandby`, `gText_TradeHasBeenCanceled`, `gText_Trade_OnlyPkmnForBattle`, `gText_WaitingForFriendToFinish`, `gText_FriendWantsToTrade`, `CableClub_Text_PleaseWaitBCancel`, `Text_TakeSeatStartTrade`.

**FireRed's trade protocol (trade.c, as implemented):** a side picks TRADE on a Pokémon (local check CANT_TRADE_LAST_MON → "That's your only POKéMON for battle.", nothing sent; ours: server answers CANCELED/ONLY_MON to that side only) or CANCEL → "Cancel trade?" YES ("Waiting for your friend to finish…"). Both picked → both Pokémon shown, "Is this trade okay?" (YES/NO 120 frames later); YES → "Communication standby… Please wait."; either NO → both "The trade has been canceled.", A → back to choosing. Picked vs cancel: picker "The trade has been canceled.", canceler "Your friend wants to trade POKéMON.", A → choosing. Both CANCEL → fade, back to the room (CB2_ReturnToFieldFromMultiplayer); sitting again needs stepping off and on. After a trade FireRed returns to the trade menu. Seats: triggers `chair_0` (4,5), `chair_1` (7,5) in `lib-maps/maps/trade_center.yaml`; no facing change (the way walked). National Dex / Mew-Deoxys checks dropped (D22 lists the rules).

**Gotchas:**
- The host Docker can't mount this workspace. Tools extracted to `/tmp/pu` (lost with the session; recreate): `docker cp` of `/usr/local/go` from `golang:1.27-alpine` and `/workspace/sqlc` from `sqlc/sqlc:1.30.0` (distroless, no shell). Contracts: `tar c --exclude=lib-contracts/gen/ts/node_modules lib-contracts | docker run --rm -i --entrypoint sh bufbuild/buf:1.59.0 -c "mkdir /repo && cd /repo && tar x && cd lib-contracts && buf lint >&2 && buf generate >&2 && tar c gen" | tar x -C lib-contracts`.
- `references/pokefirered` was empty: `git submodule update --init references/pokefirered`.
- The member's replica must never write a stale party after a swap: it reloads from PG on `TradeDone` and when the partner watch fires; the seat script keeps `p.script != 0`, so no steps (walking friendship writes the party).
- No Eggs exist in the game yet: case 6's Egg half can't be played (CanOffer already counts an unable Pokémon as offerable).

## Tasks

- **Seats:** stepping on a Trade Center seat sits (FireRed's facing); with both seated the trade menu opens (`Text_TakeSeatStartTrade` from the attendant).
- **Contracts:** `TradeOffer{slot}`, `TradeConfirm{yes}`, `TradeCancel`; events `TradeState{own_party, other_party (species, level, gender, shiny, nickname, held item, summary data), picks, stage}`, `TradeDone{trade_id}`.
- **Server:** the offer state per room in memory of the leader's replica plus Redis (survives a crash); rules D22 with FireRed's messages; both YES → the swap transaction (D23) keyed by trade ID, then both parties resent.
- **Client:** `trade.c`'s menu (both parties' icons, cursor, SUMMARY on either side's Pokémon, TRADE, CANCEL), waiting text, "Is this trade okay?", "Cancel trade?", back to the menu after a trade (M10 adds the scene between).

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

- 2026-11-22: session 1: contracts, `trades` table and swap transaction, server trade draft (`world/trade.go`); Go build red (placeholder `TriggerAt` type), next steps in Resume Here.
