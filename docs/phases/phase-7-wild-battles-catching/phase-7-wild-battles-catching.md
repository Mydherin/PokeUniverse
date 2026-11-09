# Phase 7: Wild Battles and Catching

**Goal:** walking through grass starts FireRed's wild battles with Gen 4 rules; the player can run, catch the Pokémon with any ball, name it, see it registered in the Pokédex and find it in the party or the PC. Added to the [Battle System](../phase-5-battle-system/phase-5-battle-system.md), tried on a test grass patch in the player's house; the real tables come with the maps ([Phase 12](../phase-12-world-content.md)).

## Resume Here

**Next step:** start [M4](milestones/m04-wild-battle-rules.md) at its Resume Here. Read only that file. M1, M2 and M3 done 2026-11-09. The open items aimed at this phase are O4 and O5 in the [phase index](../index.md#open-items).

Carried over from Phase 6: the test team (`mic-core/internal/pokemon/testteam.go`) stays until Phase 10 with the other test content; whiteout's respawn map stays as is (D12); re-check the follower with walking NPCs when they come ([Phase 6 M9's follow-ups](../phase-6-pokemon-party/milestones/m09-following-check.md#follow-ups-later-phases)).

Every milestone is played in the game before it closes, with the regression check ([context.md](milestones/context.md#playing-a-milestone)).

## Milestones

Order = dependencies. Marks: ⬜ not started · 🚧 in progress · ✅ done · ⏸ deferred.

| # | Milestone | Status | Needs | In short |
|---|---|---|---|---|
| M1 | [Data: tables, wild items, test grass](milestones/m01-data-tables.md) | ✅ | | Encounter tables in the map format and `ServerMap` (land, water, Rock Smash, rods); species' wild held items; Iron Ball fix; the test grass patch and its table |
| M2 | [Making a wild Pokémon](milestones/m02-wild-pokemon.md) | ✅ | M1 | Slot and level choice per kind; IVs, nature, gender, ability, shiny, held item; Gen 4 lead abilities on the Pokémon made |
| M3 | [Encounters on the map](milestones/m03-encounters.md) | ✅ | M2 | Step check (cooldown, rate, buff), Repel, flutes, Cleanse Tag, Pure Incense, Gen 4 rate abilities, Sweet Scent; starting the wild battle; grass rustle; Rock Smash and rods ready for Phase 12 |
| M4 | [Wild battle rules](milestones/m04-wild-battle-rules.md) | ⬜ | M3 | `mic-battles` wild side; RUN and the Gen 4 escape rule; Poké Doll, Fluffy Tail, Smoke Ball, Run Away; Roar, Whirlwind, Teleport; Thief/Covet; Pay Day; Pickup; wild whiteout; resume |
| M5 | [Catching rules](milestones/m05-catching-rules.md) | ⬜ | M4 | Gen 4 catch formula and every ball; trainer block; full storage; the caught Pokémon saved to party or box, Pokédex caught, the nickname intent |
| M6 | [The wild battle screen](milestones/m06-wild-battle-screen.md) | ⬜ | M4 | Wild transitions, terrains, intro slides, "Wild X appeared!", shiny sparkle, caught-ball mark, wild music, RUN and escape messages, wild whiteout text |
| M7 | [Ball throw and the catch scene](milestones/m07-catch-scene.md) | ⬜ | M5, M6 | Throw, shakes, break free, Gotcha and its fanfare, stars, every ball's art; the Pokédex page, nickname with the naming screen, sent-to-PC messages |
| M8 | [Phase check](milestones/m08-phase-check.md) | ⬜ | M1-M7 | The whole phase played; restarts at every new step; follower in grass; regression |

M1 → M2 → M3 → M4 is a chain. After M4, M5 and M6 can go in either order; M7 needs both.

## Scope

- **Encounters:** FireRed's tables and step check for grass and caves (played), Surf, Rock Smash and the three rods (server ready, hooked with their maps in Phase 12); Repel, the White and Black Flutes, the Cleanse Tag and Pure Incense; Gen 4 lead abilities, both on the encounter rate and on the Pokémon made; Sweet Scent from the party menu.
- **Wild Pokémon:** random IVs, nature, gender and ability, shiny at 1/8192, held items by species (FireRed's and the expansion's `itemCommon` / `itemRare`).
- **Wild battles:** FireRed's transitions, terrains, intro and music; RUN with the Gen 4 rules and escape items; moves that end a wild battle; items stolen and kept; Pay Day; Pickup after battles; whiteout against a wild Pokémon.
- **Catching:** every ball in the catalog (FireRed's twelve and Gen 4's Heal, Dusk and Quick) with the Gen 4 formula; FireRed's throw and catch scene; the Pokédex page for a new species; nicknaming; the party, or the PC when it's full.
- **Not here:** the field moves' cut-in of the Pokémon, Sweet Scent's included (O11, Phase 12); Safari Zone, static and roaming legendaries, the Old Man's catching demo, Pokédex area pages and every real table (Phase 12); using the rods and Surf on water maps (Phase 12); other players seeing a player in battle (Phase 8); Pokémon Center respawn (Phase 10).

## Done When

- A player walks into the test grass, meets a wild Pokémon with FireRed's transition and intro, runs from one and catches another with a ball, names it, sees its Pokédex page, and finds it in the party (or the PC when the party is full); battles there level up the team.
- Repel, the flutes, the Cleanse Tag and the lead's ability change encounters as the rules say.
- Restarting `mic-battles` or `mic-core` mid-battle resumes it at the last turn, including mid-catch and at the nickname question.
- Every milestone played in the game, with no regression in the regression check.
