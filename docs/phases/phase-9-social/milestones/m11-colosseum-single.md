# M11: Colosseum, Single Battles

Part of [Phase 9](../phase-9-social.md). Decisions: [context.md](context.md#pvp) D25-D28. References: `battle_controller_link_opponent.c`, `cable_club.c`, `battle_message.c` link strings.

## Resume Here

Not started. Needs M8.

## Tasks

- **Seats:** Colosseum seats as the Trade Center's; both seated → `Text_TakeSeatStartBattle`, the battle starts.
- **Server:** `battles.start` with both parties healed (D26), each side a player; `mic-core` waits for both choices per step (D27), turn timer 60 s, countdown event at 10 s, auto-pick at 0; disconnect grace 30 s (D28); the outcome changes nothing in the parties; busy BUSY_BATTLE.
- **Client:** link battle intro and outro (FireRed's link versions: "{NAME} wants to battle!", the opponent's trainer pic by gender, link outcome texts), "waiting for the other player" (FireRed's "Link standby..."), the countdown, BAG refused, RUN → forfeit question.
- **After:** both back in the Colosseum, then out as M8.

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
