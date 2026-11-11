# Phase 12: World Content

**Goal:** all of Kanto playable from start to end.

## Scope

- NPCs, dialogue and story events for all of Kanto, on the event system from [Phase 10](phase-10-pallet-town.md).
- Where items come from (found, given, bought) and the effects still missing, on the item catalog, bag and money from [Phase 4](phase-4-players-room.md); Pokémon Centers, PokéMarts.
- Gyms, badges, Elite Four and Champion.
- Field moves needed to progress (e.g. Cut, Surf, Strength), with their cut-in of the Pokémon (`CreateFieldEffectShowMon`), Sweet Scent's too ([O11](index.md#open-items), from Phase 7 M3).
- **Map phases** (from [Phase 10](phase-10-pallet-town.md)): each map built here lists the story flags that split it into phases, e.g. Saffron City with Team Rocket vs cleared; a map that doesn't really change lists none (one phase). Personal-layer objects (Snorlax, item balls, Cut trees, boulders, trainers) use the player's flags, not phases.
- Players across a map border: connected maps' players drawn together ([O15](index.md#open-items), Phase 8 D4).
- All Kanto maps, story trainers (spotting the player by sight range) and encounters; the Pokédex area page shows where each species lives (FireRed's area markers, Sevii Islands maps once unlocked).
- Wild content left by Phase 7 ([O10](index.md#open-items)): every real encounter table, Surf, Rock Smash and rods hooked on their maps (server ready), the Safari Zone and Safari Ball, roamers, `FLAG_SYS_NOT_SOMEONES_PC` (the PC message's owner).
- Public art for all of Kanto, as done for Pallet Town in [Phase 11](phase-11-pallet-town-art.md).

## Done When

- A player can play all of Kanto from the first town to the Champion.
