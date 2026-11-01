# Phase 9: Battles

**Goal:** wild encounters, catching and the story's trainer battles, on the Gen 4 battle system.

The battle system itself (`mic-battles` on Showdown, battles saved in Redis every turn, the battle screen, animations and sounds, the NPC AI, experience, leveling, evolution, learning moves) moved to [Phase 4](phase-4-players-room.md): [plans/battles](../plans/battles/README.md).

## Scope

- Wild encounters in grass, caves and water (encounter tables, the wild AI from the plan).
- Catching: Poké Balls in wild battles, Gen 4 catch formula, FireRed's ball animations, the caught Pokémon going to the party (or the PC boxes, [Phase 8](phase-8-pokemon-party.md)).
- The Pokédex registers what's caught (`mic-core` sends the change), with FireRed's page after a catch.
- Trainer battles (NPCs) from the story, starting with the first rival battle in Oak's lab (deferred from [Phase 5](phase-5-pallet-town.md)); trainers spotting the player (sight range).

## Done When

- A player walks into grass, battles, catches a Pokémon and levels up.
- Restarting `mic-battles` or `mic-core` mid-battle resumes the battle at the last turn.
