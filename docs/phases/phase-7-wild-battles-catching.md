# Phase 7: Wild Battles and Catching

**Goal:** wild battles and catching, added to the [Battle System](phase-5-battle-system/phase-5-battle-system.md).

## Scope

- Wild battles and encounters: encounter tables by terrain (grass, caves, water), the wild AI ([M5](phase-5-battle-system/milestones/m05-npc-ai.md)), RUN, Poké Dolls, the Fluffy Tail and the Cleanse Tag. Tried on a test encounter in the room, like the test trainer; the real tables come with the maps ([Phase 12](phase-12-world-content.md)).
- Catching: Poké Balls in wild battles, Gen 4 catch formula, FireRed's ball animations, the caught Pokémon going to the party (or the PC boxes, [Phase 6](phase-6-pokemon-party/phase-6-pokemon-party.md)).
- The Pokédex registers what's caught (`mic-core` sends the change), with FireRed's page after a catch.

## Done When

- A player starts the test encounter, battles, catches a Pokémon and levels up.
- Restarting `mic-battles` or `mic-core` mid-battle resumes the battle at the last turn.
