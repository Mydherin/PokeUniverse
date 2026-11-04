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
- **Battles' friendship from bag items:** `played` records each in `Active.Friendship` (item, target slot) and `finish` applies them with the outcome, so leaving rolls it back. X items, Dire Hit and Guard Spec. have only `friendship` in their catalog `effect` ([1, 1, 0]): `itemEffect` in `mic-battles` hides it for `BATTLE_USE_SELF`. Item and level-up friendship add +1 on the map where the Pokémon was met (`mapID` through `UseItem`, `Gain`, `battle.Apply`).
- **Vitamins and the EV cap:** the test team sits at 510 EVs, so a vitamin answers "no effect" on all of it. That's right, not a bug: lower a Pokémon's `evs` to test one.

## Not Checked

- **Sounds:** the browser pane plays nothing we can hear (Blue Flute's flute, `se_use_item`).
- **Ether in battle:** the move list opened, the move was taken and the turn played; the message went by unseen.
- **The battle BAG's fixes below and battle friendship:** built, not played. To play them: A, then USE or CANCEL; B in the party; an X item at +6; POKé FLUTE with and without a sleeper; TOSS in the battle pouch; friendship after a battle.

## Battle BAG, Fixed After Playing

The BAG in battle now follows FireRed, by reading `item_menu.c`, `party_menu.c` and `berry_pouch.c`, not compared on the ROM:

- A in the battle BAG opens USE / CANCEL, OPEN / CANCEL for the BERRY POUCH, only CANCEL for an item with no battle use (`openContextMenu` in `bag.ts`).
- The BERRY POUCH in battle opens USE / TOSS / EXIT; a berry with no battle use gets OAK's words (`battle` in `berry-pouch.ts`).
- The party says "Use on which POKéMON?" (`chooseMessage` in `party-menu.ts`).
- B in that party goes back to the BAG, or the BERRY POUCH for a berry (`chooseFromBag` in `battle/screen.ts`).
- POKé FLUTE always plays: with nobody asleep "Now, that's a catchy tune!"; otherwise its fanfare (`mus_poke_flute`) and "The POKéMON hearing the FLUTE awoke!", waking both parties, bench included, except Soundproof (`hearingFlute` in `mic-battles`, `ItemUsed.awoke`, `recent.flute`).
- An X item, Dire Hit or Guard Spec. that would do nothing says "It won't have any effect." in the BAG: `no_effect_items` in the request (`selfItemsWithNoEffect` in `mic-battles`), passed to `startBag`.

Still differs from FireRed:

- **Kept, a Gen 4 rule:** an X item that works takes effect in the turn (Gen 4 order, phase-5 D12); FireRed spends it and prints its effect in the BAG.
- **Kept, no sections yet:** the met-location +1 compares `MetMap` with the zone's map (`metOn`); FireRed compares region map sections, so another map of the same town gives no +1 until maps have sections.
- **Kept, Enigma Berry:** no effect data (it came from the e-Reader).
