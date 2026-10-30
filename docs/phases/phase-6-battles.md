# Phase 6: Battles

**Goal:** Gen 4 battles through `mic-battles`.

## Scope

- `mic-battles` running Showdown with Gen 4 rules, over NATS.
- Battles saved to Redis after every turn, outcomes to PostgreSQL; retried turns never run twice.
- Wild encounters in grass, caves and water.
- Battle UI on desktop and mobile; animations and sounds triggered by name.
- Catching, experience, leveling, evolution, learning moves.
- Trainer battles (NPCs).

## Done When

- A player walks into grass, battles, catches a Pokémon and levels up.
- Restarting `mic-battles` or `mic-core` mid-battle resumes the battle at the last turn.
