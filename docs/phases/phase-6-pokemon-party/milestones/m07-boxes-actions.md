# M7 Boxes: Managing Pokémon ⬜

Part of [Phase 6](../phase-6-pokemon-party.md). **Needs:** M6. Rules: [context.md](context.md), D3, D6.

**Done when:** the box screen does everything FireRed's does: WITHDRAW, DEPOSIT, MOVE, RELEASE, held items and box options, each decided and saved by `mic-core`.

## Resume Here

Not started. First step: rules and intents in `mic-core`, written from `pokemon_storage_system_data.c`.

## Tasks

- [ ] **`mic-core`, intents and rules:** withdraw, deposit, move or swap (party or box), release, box name, wallpaper. One transaction each (D3). Rules: a party of six is full; the last Pokémon able to battle can't leave the party; holding mail can't be deposited; placing a Pokémon in a box restores HP, status and PP.
- [ ] **Client, moving:** the pick-up hand, its animation and Shift swapping; WITHDRAW and DEPOSIT flows, with a box to choose; MOVE mode.
- [ ] **Client, menus:** the Pokémon's menu (MOVE, SUMMARY, WITHDRAW/STORE, MARK, ITEM, RELEASE) with the release confirmation and its sound; markings saved (add to the row).
- [ ] **Client, ITEM mode:** GIVE, TAKE, SWITCH between boxes' Pokémon.
- [ ] **Client, box options:** JUMP, WALLPAPER, NAME (`naming-screen.ts`).
- [ ] **Play it,** then the [regression check](context.md#playing-a-milestone).

## Play It

- WITHDRAW into a free party slot, refused when full. DEPOSIT, refused for the last able Pokémon or with mail. MOVE and swap between boxes and with the party, the lead changing.
- A hurt Pokémon comes back healed. RELEASE with confirmation, refused for the last able one.
- GIVE and TAKE in ITEM mode, a boxed one's held item stays. MARK, NAME, WALLPAPER, JUMP.
- A full box, then every box full: messages. **Reload after each:** everything is as left; a refused action changed nothing.
- A battle after moving the team: the new lead goes first, the party menu agrees.

## What's Known

- `pokemon_storage_system_data.c:625` `SetPlacedMonData`: `BoxMonRestorePP` on placing a box Pokémon. `_tasks.c` is the flow (2770 lines): read the piece at hand.
- `world/party.go` `partyChange` and `heldItemAction` are the shapes of an action; `sendParty` updates the client.

## Files

`mic-core/internal/pokemon/`, `mic-core/internal/world/`, `mic-core/queries/pokemon.sql`, `lib-contracts/proto/pokeuniverse/`, `spa-pokeuniverse/src/game/firered/storage/`.
