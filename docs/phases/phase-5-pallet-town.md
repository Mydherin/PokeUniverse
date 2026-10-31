# Phase 5: Pallet Town

**Goal:** all of Pallet Town as in FireRed, with its events, up to choosing a starter.

## Scope

- Maps: player's house (both floors), rival's house, Oak's lab and Pallet Town outdoors, with warps and the edge to Route 1.
- Event system (interpreter in `mic-core`) with per-player story flags saved in PostgreSQL.
- NPCs and dialogue: Mom, the rival's sister, townsfolk, signs.
- Oak stops the player at the edge of Route 1 and leads them to the lab.
- Choosing a starter (Bulbasaur, Charmander or Squirtle); the rival takes the one strong against it.
- Minimal Pokémon data model to save the starter ([Phase 8](phase-8-pokemon-party.md) extends it).
- Oak gives the POKéDEX (`FLAG_SYS_POKEDEX_GET`: the START menu shows it; the screen exists since [Phase 4](phase-4-players-room.md)), and the starters seen and caught are registered.
- The START menu shows POKéMON once the starter is chosen, as in FireRed: party screen and summary for what the game has then ([Phase 8](phase-8-pokemon-party.md) extends them).
- **Per-player story:** each player sees their own Oak, rival and events, even in a shared world.
- The first rival battle comes with [Phase 9](phase-9-battles.md); until then the event continues without it.

## Done When

- A new player walks from their room to Oak's lab and gets a starter, like in FireRed.
- Restarting `mic-core` mid-event keeps the story progress already shown.
