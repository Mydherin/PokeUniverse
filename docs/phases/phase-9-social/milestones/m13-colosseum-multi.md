# M13: Colosseum, Multi Battles (4 Players)

Part of [Phase 9](../phase-9-social.md). Decisions: [context.md](context.md#pvp) D25-D29, D18-D20. FireRed has it, so it's built with FireRed's options only (user 2026-11-12, Q1).

## Resume Here

Not started. Needs M12 (doubles against players) and M8 (rooms).

## Tasks

- **Room of four (D18, D29):** MULTI at the counter → FireRed's `CableClub_EventScript_ChooseLinkLeaderFrom4`: the leader's screen waits for three members (accept each), FireRed's "start with these players" confirmation; the member list as M8. Fewer than four → FireRed's `CableClub_Text_NeedFourPlayers` refusal.
- **Map:** `battle_colosseum_4p.yaml` from `BattleColosseum_4P` (seats at `3,4`, `3,6`, `10,4`, `10,6`), converted in this milestone; the room's private zone phase as M8.
- **Teams:** FireRed's link multi: leader and the second joiner against the other two (seat sides as FireRed); each brings 3 Pokémon chosen from the party (FireRed's multi party selection), healed, restored after (D26).
- **Battle:** a Gen 4 custom format with Showdown's `gameType: 'multi'` (four players, two per side, each controls one Pokémon); `mic-core` waits for all four choices per step (D27), timer and disconnects per player (D28; a player gone past the grace ends the battle for all, their side loses, as a broken FireRed link ends it).
- **Client:** Phase 5's doubles UI with the partner's Pokémon controlled by the partner (Phase 5 M13's partner animations), link multi intro with four trainer pics and send-outs, outcome texts for the team.

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Room of four | Leader + 3 members (2 tabs + 2 bots) | All accepted, confirmation, walk into the 4P room | ⬜ |
| 2 | Not enough | Leader starts with 3 | FireRed's need-four refusal | ⬜ |
| 3 | Party choice | Each picks 3 | FireRed's selection screen | ⬜ |
| 4 | Battle | Play to the end | Each controls one Pokémon; partners' moves shown; team outcome | ⬜ |
| 5 | Restored | Check parties after | As before, no EXP | ⬜ |
| 6 | Timer, disconnect | One waits; one drops past the grace | Auto-pick; battle ends, their side loses | ⬜ |
| 7 | Replicas | Players on two replicas | Works | ⬜ |
