# M14 Phase 4 Battle Check 🚧

Part of the [battles plan](README.md). **Needs:** M4-M12. Shared rules and context: [context.md](context.md).

Manual, only when the user asks: start a battle on desktop and mobile; play to win and to lose; use a potion; switch; let a Pokémon faint; reload mid-battle; restart `mic-core` and `mic-battles` mid-battle; check the party after the battle. Also unplayed so far: M11, M12, SHIFT and doubles (both trainers; spread moves; a multi-hit move replaying per strike; Dark Void's partner slide; Trick Room and Gravity texts), and frame rate on a phone.

## Progress

**State (2026-11-04):** nothing played yet. M13 is committed; the client's doubles have never run in the game.

**Exact next step (the user asked for this, in a fresh session): play these points in the game, no phone.** Fix what breaks, then tick them here.

- [ ] **Singles trainer (regression):** moves, a switch, a faint, a multi-hit move (animation replays per strike; Double Slap alternates sides).
- [ ] **Double trainer** (`test_double_trainer` at 9,6 in the player's room, 2F): both choices, picking targets, going back with B, a spread move (Earthquake, Heat Wave, Rock Slide, Surf, Discharge), replacing a fainted Pokémon, the end of the battle and the double prize.
- [ ] **Also in doubles:** Dark Void's partner slide; Trick Room and Gravity texts.
- [ ] **SHIFT:** the option's switch prompt in singles.
- [ ] **M11, M12:** exp, level up, learning a move, evolution; held items, bag items.

**Later in this milestone, not now:** frame rate on a phone, mobile, reload and restart mid-battle, win and lose paths.

**Before playing:** `make text`, `make maps` (both passed at M13's commit; gitignored output, so only needed on a fresh checkout), `make graphics` if the doubles healthboxes are missing.
