# M5 Field Moves on the Party Screen ⬜

Part of [Phase 6](../phase-6-pokemon-party.md). **Needs:** M1's HP animation. Rules: [context.md](context.md), D3.

**Done when:** a Pokémon's field moves show in its party menu options like FireRed; Milk Drink and Softboiled work; the others answer "can't use that here" until [Phase 12](../../phase-12-world-content.md) gives them maps.

## Resume Here

Not started. First step: read the field move list in `party_menu.c` (line 2972, `sFieldMoves`).

## Tasks

- [ ] **Contract:** a `party.v1` intent for using a field move (slot, move, target when it has one), with a refusal outcome.
- [ ] **`mic-core`:** a table by move, each answering "can it be used here"; every move refuses for now but Milk Drink and Softboiled, which move HP between party Pokémon (D3). Phase 12 fills the entries, without changing the flow.
- [ ] **Client:** field move options above SUMMARY, in the moves' order, in `field` mode only; refusal message; Milk Drink's "Use on which POKéMON?" with two HP bars.
- [ ] **Play it,** then the [regression check](context.md#playing-a-milestone).

## Play It

- A test Pokémon with Cut, Fly, Surf: options listed, each refuses in the room, the menu comes back.
- Milk Drink / Softboiled: HP moves from one to the other; refused when the user is under 1/5 of its HP or the target is full or fainted (check FireRed).
- A Pokémon with none: the menu is as before. In battle and in GIVE mode no field move shows.

## What's Known

- The map effects (cutting, flying, surfing…) aren't here, and the bag's field items have the same pattern (`onFieldIf` in `item/use.go`).
- `party-menu.ts:760` sets the battle's options; the `field` ones are set next to it.

## Files

`lib-contracts/proto/pokeuniverse/party/v1/`, `mic-core/internal/pokemon/`, `mic-core/internal/world/party.go`, `spa-pokeuniverse/src/game/firered/party-menu.ts`.
