# M5 Catching Rules ⬜

Part of [Phase 7](../phase-7-wild-battles-catching.md). **Needs:** M4. Rules: [context.md](context.md) D6, D9, D10; [catch and balls](context.md#gen-4-rules-used-by-several-milestones).

**Done when:** every ball in the catalog can be thrown in a wild battle with Gen 4's formula and modifiers, the result (shakes, caught or not) comes as events, a catch is saved with the battle's outcome into the party or a box with its caught data, the Pokédex marks it caught, the nickname intent works, and trainer battles block balls. The client may show it with plain messages until M7.

## Resume Here

**Not started.** First step: find Gen 4's catch code in `pokeheartgold` (grep `CalculateBallShakes`, `BallCatchRate`, or `ITEM_TIMER_BALL` in `src/battle/`), write its file and lines here, then compare with the formula in context.md.

## Tasks

### Contracts

- [ ] `battle/v1` events: `BallThrown { ball, shakes (0-3), caught, blocked }` (blocked: a trainer's Pokémon; FireRed's `BattleScript_TrainerBallBlock` "The TRAINER blocked the BALL!" "Don't be a thief!").
- [ ] `BattleResult.CAUGHT` (7); `BattleEnded.caught { species, nickname_pending, where: PARTY | BOX, box, box_full_before (FireRed's "BOX was full" variant), new_in_pokedex }`.
- [ ] `BattleStart` facts the formula needs that `mic-battles` can't know: whether the wild species is already caught (Repeat Ball), night (Dusk Ball: the server's game clock, check what Phase 5 M11 uses for Eevee's day / night), cave terrain (from M3's terrain), water encounter (Dive Ball).
- [ ] `party/v1` (or `world/v1`): `NameCaughtPokemon { name }` intent and its answer (D10).

### `mic-battles` (`src/catch.ts`, new)

- [ ] Ball choice (the `item` action with a `BATTLE_USE_BALL` item), resolved before Showdown's turn (D6): `a` with the wild Pokémon's current HP, max HP, status and the species' catch rate; the ball's modifier (Master always catches); the four checks; `BallThrown`. Not caught: the turn is spent (M4's way) and the foe moves. Caught: the battle ends `CAUGHT` with the Pokémon's state (HP, status, PP, held item, D9).
- [ ] Gen 4 checks to confirm in `pokeheartgold`: four shake checks, Quick Ball's turn 1 only, Timer's turn count, Nest Ball under level 30, Dusk Ball's cave rule, Dive Ball's water rule, Heal Ball heals on catch, Substitute (can a ball catch behind one in Gen 4?), a semi-invulnerable target (Fly, Dig: Gen 4 still catches?). Write each answer here.
- [ ] Trainer battles: `blocked` event, the ball spent or not as FireRed (check `BattleScript_TrainerBallBlock` and `PokeBallBattleUseFunc`; FireRed keeps the item? find it).

### `mic-core`

- [ ] `BattleChoice`: a ball is refused when the party and every box are full (FireRed's bag text for it: grep `IsPlayerPartyAndPokemonStorageFull` in `src/item_use.c` and its string); balls spent from the bag, kept spent across a restart (`keepSpent`).
- [ ] Outcome `CAUGHT`: fill the caught data (ball, met level = its level, met location = the map's location, OT name / ID / gender = the player, friendship: species base, Luxury Ball's growth bonus noted for friendship gains, Heal Ball restores), then `pokemon.AddCaught` (party or box, D9); `pokedex.Catch` (and seen); one transaction with the rest of the outcome (party, items, money, Pickup).
- [ ] **Nickname** (D10): the just-caught Pokémon's reference stays on the player's active battle record until the answer; `NameCaughtPokemon` validates the name like the naming screen's limits (10 characters, the charmap) and renames it where it is (party or box); a restart before the answer asks again; cancel = keep the species name.

## Play It

- Throw POKé BALLs at a full-HP foe until one catches; it lands in the party with its ball shown in the summary; the Pokédex marks it caught.
- With a full party: it goes to the current box (BILL'S PC shows it). With every box full (SQL): balls refused.
- Master Ball always catches; Quick Ball on turn 1 catches far more often; Repeat Ball on a caught species (spot-check, not every ball: [testing effort](../../../../AGENTS.md#testing)).
- A ball in the room trainer's battle: blocked.
- Restart `mic-core` at the nickname question: asked again, the Pokémon already saved.

## Gotchas

- Shakes shown are capped at 3 even though Gen 4 rolls four checks: 3 shakes with no click = broke free on the fourth.
