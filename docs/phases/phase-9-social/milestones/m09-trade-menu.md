# M9: Trade, Menu and Transaction

Part of [Phase 9](../phase-9-social.md). Decisions: [context.md](context.md#trading) D21-D23. References: `trade.c`, `cable_club.c` seats.

## Resume Here

Not started. Needs M8. Back up both saves before playing.

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
