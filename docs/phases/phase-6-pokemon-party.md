# Phase 6: Pokémon and Party

**Goal:** every item and TM works on Pokémon, players manage their Pokémon, and their lead Pokémon follows them.

## Done

Built for the [Battle System](phase-5-battle-system/phase-5-battle-system.md); each milestone's file has the details to build on it.

- ✅ **Data model** ([M2](phase-5-battle-system/milestones/m02-party.md)): Gen 4 stats, natures, IVs/EVs, personality, growth rates, moves and PP, saved in `trainer_pokemon`; `party.v1` contracts; the test team.
- ✅ **Party menu** ([M3](phase-5-battle-system/milestones/m03-party-screen.md)): SUMMARY, SWITCH, ITEM (GIVE, TAKE); GIVE from the BAG, TM CASE, BERRY POUCH and PC.
- ✅ **Summary** ([M3](phase-5-battle-system/milestones/m03-party-screen.md)): INFO, SKILLS, moves and their details, move SWITCH.
- ✅ **Growing, from battles** ([M11](phase-5-battle-system/milestones/m11-exp-level-up-evolution.md)): exp, level up, learning and forgetting moves, friendship, evolution (the catalog has every species' evolutions).
- ✅ **Items in battle** ([M12](phase-5-battle-system/milestones/m12-held-and-bag-items.md)): held items' effects, and bag items used on a Pokémon.

## Remaining

- **Items used on a Pokémon outside battle:** Rare Candy (level up, learning, evolution), potions and other medicine, PP items, evolution stones. `mic-core`'s `item/use.go` already answers `PARTY_MENU` for them, but USE does nothing yet: the party menu has no mode for it. Reuse M11's level up, learning and evolution.
- **TM/HM teaching:** the TM CASE's USE goes back to the list for now (`tm-case.ts`, `onResult`). The species catalog only has level-up learnsets (`level_moves`): TM and tutor learnsets are still to add.
- Held-item effects outside battle.
- Field moves from the party screen (what they do on the map comes with the maps that need them, [Phase 12](phase-12-world-content.md)).
- **Exp. Share:** its holder gets a share of the battle's exp (no effect yet).
- **Bill's PC boxes** added to the PC menu from [Phase 4](phase-4-players-room.md).
- **Following Pokémon** with HGSS-style overworld sprites (`pokeemerald-expansion`'s `overworld.png` for every species; not in the build yet); other players see them from [Phase 8](phase-8-multiplayer-world.md).

## Done When

- ✅ The team shows in POKéMON; SWITCH, held items and the summary work; battles level up and evolve it.
- Items and TMs used from the bag work on the test team.
- A player manages their team and boxes, and their lead Pokémon follows them in the world.
