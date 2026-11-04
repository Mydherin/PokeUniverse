# Phase 5: Pokémon and Party

**Goal:** every item and TM works on Pokémon, players manage their Pokémon, and their lead Pokémon follows them.

The Pokémon data model, the party, the party screen and the summary moved to [Phase 4](phase-4-players-room.md) with the battles ([plans/battles](../plans/battles/README.md)).

## Scope

- **Items used on a Pokémon outside battle:** Rare Candy (level up, learning, evolution), potions and other medicine, PP items, evolution stones (USE from the bag does nothing yet).
- TM/HM teaching (TM and tutor learnsets), held-item effects outside battle.
- Field moves from the party screen (what they do on the map comes with the maps that need them, [Phase 11](phase-11-world-content.md)).
- **Exp. Share:** its holder gets a share of the battle's exp (no effect yet).
- Bill's PC boxes added to the PC menu from [Phase 4](phase-4-players-room.md).
- **Following Pokémon** with HGSS-style overworld sprites (`pokeemerald-expansion`'s `overworld.png` for every species); other players see them from [Phase 7](phase-7-multiplayer-world.md).

## Done When

- Items and TMs used from the bag work on the test team.
- A player manages their team and boxes, and their lead Pokémon follows them in the world.
