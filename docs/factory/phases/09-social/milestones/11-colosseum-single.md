---
id: 11-colosseum-single
title: "Colosseum: single battles"
status: building
depends: [08-link-rooms]
context: [context/social.md, context/references.md]
---

# M11: Colosseum, Single Battles

Part of [Phase 9](../PHASE.md). Decisions: [context/social.md](../../../context/social.md#pvp) D25-D28. References: `battle_controller_link_opponent.c`, `cable_club.c`, `battle_message.c` link strings.

## Resume Here

**Building.** Design below decided (M11-D1..D8); work through *Tasks* in order. References: `git submodule update --init --depth 1 references/pokefirered` if empty.

### Design (decided 2026-11-23)

| # | Decision |
|---|---|
| M11-D1 | **`BATTLE_KIND_LINK`** (view.proto). mic-battles needs nothing else: no AI (no flags, not WILD), no EXP/Pay Day/Pickup (side 0 + TRAINER/WILD only), balls blocked. `BattleView.trainer` carries the opponent: class "", name, pic `red`/`leaf` by gender (FireRed's link opponent pic). Shift style off (FireRed forces SET in link battles). |
| M11-D2 | **The leader's replica starts it** once both sit (as the trade menu): member's party from PostgreSQL, both healed clones (nothing saved, D26), side 0 leader, side 1 member; it saves both players' `battle.Active` (new `Side`, `Link{Room, Partner, PartnerName, PartnerGender, Leader, Activity, Seat}`), calls `battles.start`, sends the member's replica `ColosseumAction.started` (it reads its Active from Redis). |
| M11-D3 | **Choices collected in Redis** `pvp:<battle>` (`battle/pvp.go`, Lua): `step`, `need` (sides whose request isn't WAIT), `c0`/`c1`, `deadline`. A choice is HSETNX'd; the call that completes `need` plays `battles.turn` with all of them (any replica; a duplicate is mic-battles' safe retry), advances the record (only forward), and sends the partner's replica the `BattleUpdate` (`ColosseumAction.update` + deadline) on its inbox. Each replica shows its own side, deduped by request step. *Why:* no host to rebuild after a replica crash. |
| M11-D4 | **Timer per player on its own replica** from the record's deadline (60 s): `BattleTurn`/`BattleStarted.seconds_left`; the client counts down the last 10 s in a window. At 0 the replica picks (first move with PP not disabled, else Struggle slot 0; forced switch: first able bench slot) and re-submits every 5 s while the step stays (heals a crash after completion). |
| M11-D5 | **Disconnect (D28):** Leave keeps a link battle (no rollback; nothing to roll back) and still sends PartnerLeft; the partner's replica, in a link battle, counts a drop instead of ending the link (also from the 5 s partner watch); 30 s later still away, or a second drop → `battles.forfeit` for the absent side, its Active cleared, then the link ends. A rejoin (take-over too) with a link Active resumes: placed on its seat in `battle_colosseum_2p` in the room's phase, link state rebuilt from Active.Link, `ColosseumAction.back` to the partner. |
| M11-D6 | **RUN → forfeit:** client asks `PU_Text_ForfeitMatch` ("Would you like to forfeit the match?", Emerald's wording, ours: FireRed has none), YES sends RUN; mic-core plays `battles.forfeit` for that side. Texts: forfeiter `sText_GotAwaySafely`, other `sText_WildFled` (FireRed's B_OUTCOME_LINK_BATTLE_RAN), WON/LOST/TIE the link outcome texts; no money, no whiteout. BAG → `sText_ItemsCantBeUsedNow` (BattleScript_ActionSelectionItemsCantBeUsed); mic-core refuses items. |
| M11-D7 | **No outcome saved** (D26): `finishLink` clears Active, sends `BattleEnded` (money 0) and the unchanged party; presence back to BUSY_LINK; both stay in the Colosseum, seats free to battle again. No `battle_outcomes` row (its key is the battle ID, one per battle). |
| M11-D8 | **Seats:** triggers `player_spot_0/1` (EnterColosseumPlayerSpot) → script step `colosseum_seat` ("Please wait. B Button: Cancel"; B → `LinkIntent.colosseum_cancel`); the attendant says `Text_TakeSeatStartBattle`. The client's seat step ends at BattleStarted and the battle runs with the link intro; after it the script ends. |

### Next step

Task 1 (contracts + seats).
## Tasks

- [ ] **Seats:** Colosseum seats as the Trade Center's; both seated → `Text_TakeSeatStartBattle`, the battle starts.
- [ ] **Server:** `battles.start` with both parties healed (D26), each side a player; `mic-core` waits for both choices per step (D27), turn timer 60 s, countdown event at 10 s, auto-pick at 0; disconnect grace 30 s (D28); the outcome changes nothing in the parties; busy BUSY_BATTLE.
- [ ] **Client:** link battle intro and outro (FireRed's link versions: "{NAME} wants to battle!", the opponent's trainer pic by gender, link outcome texts), "waiting for the other player" (FireRed's "Link standby..."), the countdown, BAG refused, RUN → forfeit question.
- [ ] **After:** both back in the Colosseum, then out as M8.

## Log

- 2026-11-23: building; design M11-D1..D8 decided.

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Battle | Two players play a single battle to the end | Both see their own side; winner and loser texts | ⬜ |
| 2 | Healed and restored | Damaged party before; check after | Healed at start; after, as before the battle; no EXP | ⬜ |
| 3 | Bag, run | Open BAG; RUN | Refused; forfeit question, YES ends it | ⬜ |
| 4 | Timer | One waits | Countdown, auto-pick at 0 | ⬜ |
| 5 | Switches, faint | Force switches both sides | Each picks its own, battle continues | ⬜ |
| 6 | Disconnect | One drops and returns in 30 s; again and stays away | Resumes; then forfeit win | ⬜ |
| 7 | Replica crash | Kill a replica mid-battle | Resumes from the saved step | ⬜ |
| 8 | Two replicas | Players on different replicas | Works | ⬜ |
