# M1 Items on a Pokémon: Medicine and PP 🚧

Part of [Phase 6](../phase-6-pokemon-party.md). Rules: [context.md](context.md), D1-D3.

**Done when:** from the BAG, USE on a Pokémon heals, cures, revives and restores PP like FireRed, saved with the bag, and the item is spent only if it worked.

## Resume Here

**State (2026-11-04):** all code written and committed on `gen4-battles`. `make contracts`, `make breaking`, `mic-core` build + vet, SPA tsc and vite bundle pass; `make text` and `make audio` ran. **Never run in the game: nothing below is checked on screen, and the containers still run the old code.**

**Next steps, in order:**

1. `docker compose up --build -d`. No other read is needed to start.
2. Get the items: the new test bag entries only reach a trainer with **no party** (`loadParty` in `world/world.go`), so use a New Game, or add them to the account's rows.
3. Hurt or poison a Pokémon by a battle, or with an `UPDATE trainer_pokemon` in Postgres for the test.
4. Play **Play It** below, then the [regression check](context.md#playing-a-milestone). Fix what fails, write the result here.
5. Close: mark ✅ here and in the phase file, cut this file down, move on to [M1b](m01b-item-use-scene.md).

## Tasks

- [x] **Contracts:** `party.v1.UsePartyItem` (realtime field 26); `ITEM_OUTCOME_USED_ON_POKEMON` (25), `NO_EFFECT` (26); `ItemEffect` fields 10-15 (`ev_stat`, `pp_up`, `pp_max_up`, `all_party`, `friendship`, `reusable`), filled in for vitamins, PP UP/MAX, Sacred Ash, Blue Flute and the herbs.
- [x] **`mic-core`:** `pokemon/item.go` (`Party.UseItem`, data-driven), `item.PokemonEffect` and `SpendOnPokemon` in `item/use.go`, `usePartyItem` in `world/party.go`, test bag additions.
- [x] **Client, party menu:** `{kind: "use", item}`; `chooseToUse`, `useItem`, `useOnWholeParty`, `showRecovered`, `usedMessage`, `medicineTextId`; `chooseMoveForItem` now takes the message and a callback (battle goes through it too: **retest an Ether in battle**).
- [x] **Client, bag and pouch:** `useOnParty` in `bag.ts`, `onResult` of `bag.ts` and `berry-pouch.ts` open the mode on `PARTY_MENU`, then come back. `PartyHost.useItem`; `none` in `battle/screen.ts`. `se_use_item` and 17 texts added.
- [ ] **Play it,** then the regression check.

## Play It

- Potion on a hurt Pokémon: "Use on which POKéMON?", bar rises a point a frame, message, back to the bag on the same pocket, quantity down. On a full one: "It won't have any effect", nothing spent. B leaves with nothing spent.
- Antidote, Awakening, Full Heal: ailment mark gone, the right message. Full Restore at full HP with a status: "became healthy".
- Revive on a fainted one (box palette and icon come back). Sacred Ash: runs alone over every fainted one; none fainted: no effect, not spent.
- Ether and PP UP ask the move, B goes back; Elixir doesn't ask. PP UP's message names the move; PP up in SUMMARY. A fourth PP UP: no effect. PP MAX.
- HP UP and Protein: stat up in SUMMARY, HP rises with HP UP; the 11th Protein: no effect. Blue Flute on a sleeping one: flute sound, not spent.
- Oran Berry and Leppa Berry from the BERRY POUCH: back to the pouch.
- Reload: HP, PP, EV-raised stats and quantities are as left. In battle a Potion and an Ether still work.

## Decisions and Gotchas

- **The server is the only check outside battle:** the client doesn't call `itemWorksOn` in `use` mode; `NO_EFFECT` drives the message. `itemWorksOn` stays for battle.
- **Friendship:** `[low, mid, high]` from `item_effects.h`; Energy Powder -5/-5/-10, Energy Root -10/-10/-15, Heal Powder -5/-5/-10, Revival Herb -15/-15/-20, vitamins and PP items 5/3/2. Rare Candy's (M2) goes in the same field.
- **Enigma Berry** has no effect data, so it answers `NO_EFFECT`. `FieldUse`s handled in `item.PokemonEffect`: M2 and M3 add theirs there.
- **Fidelity gap:** FireRed plays a scene before the effect (`Task_DoUseItemAnim`), left to [M1b](m01b-item-use-scene.md). The seam is `useItem` in `party-menu.ts`.
- **Battles' friendship from bag items:** not applied by `mic-battles` (unchanged, not part of this milestone).

## Files

`lib-contracts/proto/pokeuniverse/{party,item,realtime}/v1/`, `mic-core/internal/pokemon/item.go`, `mic-core/internal/item/use.go`, `mic-core/internal/world/{party,testbag}.go`, `mic-core/internal/realtime/realtime.go`, `spa-pokeuniverse/src/realtime/connection.ts`, `spa-pokeuniverse/src/game/firered/{party-menu,bag,berry-pouch,overworld,manifest}.ts`, `firered/battle/screen.ts`, `firered/{texts,sounds}.json`.
