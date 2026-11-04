# M2 Rare Candy and Evolution Stones ⬜

Part of [Phase 6](../phase-6-pokemon-party.md). **Needs:** M1. Rules: [context.md](context.md), D1, D3, D4.

**Done when:** Rare Candy levels up, learns moves and evolves outside battle, and stones evolve, with the same scenes as battles.

## Resume Here

Not started. First step: split what's battle-bound out of `battle/level-up.ts` and `battle/learn.ts`.

## Tasks

- [ ] **`mic-core`:** `RARE_CANDY` and `EVOLUTION_ITEM` in M1's table. Level up through the same gain code as battles (stats, HP rising, moves to learn), then `pokemon/evolution.go` with an item trigger.
- [ ] **Client:** FireRed's party menu level up (message, stats windows), then learning, then the evolution scene, all reused from Phase 5 M11 (D4), each coming back to the bag.
- [ ] **Play it,** then the [regression check](context.md#playing-a-milestone).

## Play It

The test team is Lv 50 (`pokemon/testteam.go` `testLevel`): add low-level test Pokémon near a learn and an evolution.

- Rare Candy: level and stats up. With a free move slot: learns. With four moves: forget flow, skip flow. At Lv 100: no effect, nothing spent.
- Rare Candy that reaches an evolution: scene plays, cancelling with B keeps the species.
- Thunder Stone on Pikachu: evolves, stone spent. On a Pokémon it doesn't fit: no effect. Held Everstone doesn't block a stone (check below).
- Reload after each. A battle level up and evolution still behave as before.

## What's Known

- [Phase 5 M11](../../phase-5-battle-system/milestones/m11-exp-level-up-evolution.md) **How it works** has the flow. `evolve(p, slot)` and `learnMove` are in `world/party.go`; `EvolvePokemon`, `PokemonEvolved{failed}`, `LearnMove`, `PendingEvolution` exist in `party.v1`; `Player.evolving` is memory only.
- Server rule to keep: no evolution past species 151 without the National Pokédex. Test with species up to 151.
- The catalog has item evolutions, not used until now. Missing items are listed in M11's **Left Out of the Catalog**: they stay out unless the user asks.
- FireRed: `party_menu.c`: `ItemUseCB_RareCandy` (5018), `ItemUseCB_EvolutionStone` (5293). Check there how `GetEvolutionTargetSpecies` treats Everstone for item use.

## Files

`mic-core/internal/pokemon/` (`evolution.go`, `growth.go`), `mic-core/internal/world/party.go`, `spa-pokeuniverse/src/game/firered/party-menu.ts`, `firered/battle/` (`level-up.ts`, `learn.ts`, `evolution.ts`).
