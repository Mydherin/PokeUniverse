# Phase 7: Wild Battles and Catching

**Goal:** wild battles and catching, added to the [Battle System](phase-5-battle-system/phase-5-battle-system.md).

## Resume Here

**Next step:** plan the phase (nothing built yet). Turn it into a folder with milestones, like [Phase 6](phase-6-pokemon-party/phase-6-pokemon-party.md), following [Planning a milestone](README.md#how-a-phase-is-tracked): every piece on every layer (contracts, `mic-battles`, `mic-core`, client screens, FireRed's scenes, art, strings, sounds). Ask the user to confirm the split before building. Carry over from Phase 6: the test team in `mic-core/internal/pokemon/testteam.go` goes with the test content; whiteout's respawn map and the follower with walking NPCs are still open ([Phase 6 M9's follow-ups](phase-6-pokemon-party/milestones/m09-following-check.md#follow-ups-later-phases)).

## Scope

- Wild battles and encounters: encounter tables by terrain (grass, caves, water), the wild AI ([M5](phase-5-battle-system/milestones/m05-npc-ai.md)), RUN, Poké Dolls, the Fluffy Tail and the Cleanse Tag. Tried on a test encounter in the room, like the test trainer; the real tables come with the maps ([Phase 12](phase-12-world-content.md)).
- Catching: Poké Balls in wild battles, Gen 4 catch formula, FireRed's ball animations, the caught Pokémon going to the party (or the PC boxes, [Phase 6](phase-6-pokemon-party/phase-6-pokemon-party.md)).
- The Pokédex registers what's caught (`mic-core` sends the change), with FireRed's page after a catch.

## Done When

- A player starts the test encounter, battles, catches a Pokémon and levels up.
- Restarting `mic-battles` or `mic-core` mid-battle resumes the battle at the last turn.
