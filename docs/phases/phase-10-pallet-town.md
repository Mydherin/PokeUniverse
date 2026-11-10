# Phase 10: Pallet Town

**Goal:** all of Pallet Town as in FireRed, with its events, up to choosing a starter and the first rival battle.

## Scope

- Maps: rival's house, Oak's lab and Pallet Town outdoors, with warps and the edge to Route 1 (the player's house exists since [Phase 4](phase-4-players-room.md)).
- Event system (interpreter in `mic-core`) with per-player story flags saved in PostgreSQL.
- NPCs and dialogue: Mom, the rival's sister, townsfolk, signs.
- Oak stops the player at the edge of Route 1 and leads them to the lab.
- Choosing a starter (Bulbasaur, Charmander or Squirtle); the rival takes the one strong against it.
- The first rival battle in Oak's lab, on the [Battle System](phase-5-battle-system/phase-5-battle-system.md).
- The starter is saved with the Pokémon data model from [Phase 5](phase-5-battle-system/phase-5-battle-system.md), and it replaces the test team; the test trainer and the test grass patch on 1F ([Phase 7](phase-7-wild-battles-catching/phase-7-wild-battles-catching.md)) leave the room.
- Oak gives the POKéDEX (`FLAG_SYS_POKEDEX_GET`: the START menu shows it; the screen exists since [Phase 4](phase-4-players-room.md)), and the starters seen and caught are registered.
- The START menu shows POKéMON once the starter is chosen, as in FireRed (the party screen and summary exist since [Phase 5](phase-5-battle-system/phase-5-battle-system.md)).
- The house's maps get Pallet Town's map section, so SUMMARY stops showing "Met in Somewhere"; look at the naming screen's Pokémon icon fix when the starter is named ([O12](index.md#open-items), from Phase 7 M8).
- **Shared map, personal layer** (user 2026-11-10, [Phase 8 D20](phase-8-multiplayer-world/milestones/context.md#decisions)): players in one zone see each other; each one's FireRed story flags (per player, on the server) change only their own layer: stationary/legendary encounters (one per player, each catches their own), item balls and hidden items, temporary NPCs that leave after you talk to them, beaten trainers, Cut trees, boulders, tiles a map script changes by flag. The server checks collisions against the player's own flags; the client filters map objects by its own flags. Seeing another player walk through an object that blocks you is accepted (as PokeMMO). Permanent NPCs (Oak in his lab, townsfolk) are shared by the zone.
- **Map phases** ([Phase 8 D19](phase-8-multiplayer-world/milestones/context.md#decisions)): a map lists the story flags that split it into phases; zone = map + phase, so players in different phases never see each other. Maps listing none stay phase `0`. Pallet Town's maps list theirs here, if any.
- **Private scene phase:** during a scripted story scene (Oak leading the player to the lab) the player is in a private phase until it ends, so NPCs one player's script moves never show to others.

## Done When

- A new player walks from their room to Oak's lab, gets a starter and battles the rival, like in FireRed.
- Restarting `mic-core` mid-event keeps the story progress already shown.
