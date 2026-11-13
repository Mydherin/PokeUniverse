# M12: Colosseum, Double Battles

Part of [Phase 9](../phase-9-social.md). Decisions: [context.md](context.md#pvp) D25-D28; Phase 5 M13 (doubles).

## Resume Here

Not started. Needs M11.

## Tasks

- DOUBLE from the menu (two usable each, checked at the counter and again at the start); `gen4doublescustomgame` with both sides players.
- Both players' two choices per step with targets; partner-free (each controls both of their own); the timer per step.
- Client: Phase 5's doubles UI against a player; link double intro (two send-outs each).
- MULTI is M13 (four players).

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Battle | Double battle to the end | Both control two Pokémon, targets right | ⬜ |
| 2 | Spread moves | Earthquake, Surf | Hit as Gen 4 doubles | ⬜ |
| 3 | One left | One side down to one Pokémon | Battle continues as doubles do | ⬜ |
| 4 | Not enough | One usable Pokémon at the start | FireRed's refusal | ⬜ |
| 5 | Timer, disconnect | As M11 | Same rules | ⬜ |
