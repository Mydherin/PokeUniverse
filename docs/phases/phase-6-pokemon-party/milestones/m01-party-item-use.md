# M1 Items on a Pokémon: Medicine and PP ✅

Part of [Phase 6](../phase-6-pokemon-party.md). Rules: [context.md](context.md), D1-D3. Played 2026-11-04, with the regression check.

**Done:** from the BAG, USE on a Pokémon heals, cures, revives and restores PP like FireRed, saved with the bag, and the item is spent only if it worked.

## What Later Milestones Use

- **Server:** `pokemon/item.go` (`Party.UseItem`, data-driven), `item.PokemonEffect` and `SpendOnPokemon` in `item/use.go`, `usePartyItem` in `world/party.go`. M2 and M3 add their `FieldUse`s in `item.PokemonEffect`.
- **Contracts:** `party.v1.UsePartyItem` (realtime field 26); `ITEM_OUTCOME_USED_ON_POKEMON` (25), `NO_EFFECT` (26); `ItemEffect` fields 10-15 (`ev_stat`, `pp_up`, `pp_max_up`, `all_party`, `friendship`, `reusable`).
- **Client:** party menu mode `{kind: "use", item}`: `chooseToUse`, `useItem`, `useOnWholeParty`, `showRecovered`, `usedMessage`, `medicineTextId`. `chooseMoveForItem` takes the message and a callback (battle goes through it too). `useOnParty` in `bag.ts`; `onResult` of `bag.ts` and `berry-pouch.ts` open the mode on `PARTY_MENU`, then come back. `PartyHost.useItem`.

## Decisions and Gotchas

- **The server is the only check outside battle:** the client doesn't call `itemWorksOn` in `use` mode; `NO_EFFECT` drives the message. `itemWorksOn` stays for battle.
- **Friendship:** `[low, mid, high]` from `item_effects.h`; Energy Powder -5/-5/-10, Energy Root -10/-10/-15, Heal Powder -5/-5/-10, Revival Herb -15/-15/-20, vitamins and PP items 5/3/2. Rare Candy's (M2) goes in the same field.
- **Enigma Berry** has no effect data, so it answers `NO_EFFECT`.
- **The item-use scene** is left to [M1b](m01b-item-use-scene.md). The seam is `useItem` in `party-menu.ts`.
- **Battles' friendship from bag items:** not applied by `mic-battles` (unchanged, not part of this milestone).
- **Vitamins and the EV cap:** the test team sits at 510 EVs, so a vitamin answers "no effect" on all of it. That's right, not a bug: lower a Pokémon's `evs` to test one.

## Not Checked

- **Sounds:** the browser pane plays nothing we can hear (Blue Flute's flute, `se_use_item`).
- **Ether in battle:** the move list opened, the move was taken and the turn played; the message went by unseen.

## Found While Playing (Before M1, Not Fixed)

The BAG in battle differs from FireRed in three ways, by reading `item_menu.c` and `party_menu.c`, not compared on the ROM:

- A in the battle BAG goes straight to the party; FireRed asks USE / CANCEL first (`sContextMenuItems_BattleUse`).
- The party says "Choose a POKéMON."; FireRed says "Use on which POKéMON?" (`Message` choice in `party-menu.ts`, the `battle` mode with an `item`).
- B in that party goes back to the battle; FireRed goes back to the BAG (`chooseFromBag` in `battle/screen.ts`).
