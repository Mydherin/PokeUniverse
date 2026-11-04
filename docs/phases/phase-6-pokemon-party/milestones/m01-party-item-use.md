# M1 Items on a Pokémon: Medicine and PP ⬜

Part of [Phase 6](../phase-6-pokemon-party.md). Rules: [context.md](context.md), D1-D3.

**Done when:** from the BAG, USE on a Pokémon heals, cures, revives and restores PP like FireRed, saved with the bag, and the item is spent only if it worked.

## Resume Here

Not started. First step: the `UsePartyItem` contract.

## Tasks

- [ ] **Contract:** `party.v1` `UsePartyItem` (item, slot, optional move slot) and its answer (outcome, for the message; the party comes as `PartyChanged`). `make contracts`, `make breaking`.
- [ ] **`mic-core`:** effects in `internal/pokemon` from `ItemInfo.effect`, by `FieldUse`: `MEDICINE`, `ETHER`, `PP_UP`, `SACRED_ASH`, `ENIGMA_BERRY`. Friendship and EV rules of vitamins from FireRed. Handler in `world/party.go`, on the `transact` pattern of `heldItemAction`.
- [ ] **Client, party menu:** a `{kind: "use"; item}` `PartyMenuMode`: "Use on which POKéMON?", the HP bar animating, the message, back to the bag. Move list for ETHER and PP UP (`chooseMoveForItem`, from battle), Sacred Ash's revive-all.
- [ ] **Client, bag:** USE with a `PARTY_MENU` answer opens that mode, and comes back to the same pocket and position, as GIVE does (`Resume`).
- [ ] **Play it,** then the [regression check](context.md#playing-a-milestone).

## Play It

Add to the test bag what's missing. Damage a Pokémon in a battle first, or lower its HP in the test team.

- Potion on a hurt Pokémon: bar animates, message, quantity down. On a full one: "It won't have any effect" and nothing spent.
- Antidote, Full Heal, Revive on a fainted one, Full Restore, Sacred Ash on several fainted.
- Ether on a move with PP missing, Elixir, PP Up on a move; vitamin: stat up in SUMMARY, refused at the cap.
- Reload: the HP, PP and quantities are as left. The same items still work in battle.

## What's Known

- `item/use.go` already answers `PARTY_MENU` for these `FieldUse`s through `partyMenu`; `State`/`Result`/`Changed` is its shape to follow. Non-party effects stay there.
- `spa-pokeuniverse/src/game/world/items.ts:18` `itemWorksOn(item, mon, inBattle, moveSlot?)` reads `itemInfo(item).effect` (`hp`, `hpPercent`, `revive`, `cures`, `confusion`, `infatuation`, `pp`, `ppMax`).
- `party-menu.ts` (1166 lines): `PartyMenuMode` at line 60 (`field`, `give`, `battle`), `Resume` after it; battle's item path at `chooseInBattle` / `chooseMoveForItem` / `wontHaveEffect`. Grep, don't read it all.
- `world/party.go`: `partyChange`, `heldItemAction`, `sendParty`.
- FireRed: `references/pokefirered/src/party_menu.c`: `ItemUseCB_Medicine` (4427), `ItemUseCB_TryRestorePP` (4591), `ItemUseCB_PPUp` (4709), `ItemUseCB_SacredAsh` (5208).

## Files

`lib-contracts/proto/pokeuniverse/party/v1/`, `mic-core/internal/pokemon/`, `mic-core/internal/world/party.go`, `spa-pokeuniverse/src/game/firered/party-menu.ts`, `firered/bag.ts`, `game/world/items.ts`.
