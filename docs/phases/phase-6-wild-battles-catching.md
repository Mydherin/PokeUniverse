# Phase 6: Wild Battles and Catching

**Goal:** wild battles and catching, on the Gen 4 battle system.

The battle system itself ✅ (`mic-battles` on Showdown, battles saved in Redis every turn, the battle screen, animations and sounds, the NPC AI, experience, leveling, evolution, learning moves) was built in [Phase 4](phase-4-players-room.md): [plans/battles](../plans/battles/README.md). This phase adds what it doesn't have yet.

## Scope

- Wild battles and encounters: encounter tables by terrain (grass, caves, water), the wild AI from the plan, RUN, Poké Dolls and the Fluffy Tail. Tried on a test encounter in the room, like the test trainer; the real tables come with the maps ([Phase 11](phase-11-world-content.md)).
- Catching: Poké Balls in wild battles, Gen 4 catch formula, FireRed's ball animations, the caught Pokémon going to the party (or the PC boxes, [Phase 5](phase-5-pokemon-party.md)).
- The Pokédex registers what's caught (`mic-core` sends the change), with FireRed's page after a catch.

## Done When

- A player starts the test encounter, battles, catches a Pokémon and levels up.
- Restarting `mic-battles` or `mic-core` mid-battle resumes the battle at the last turn.
