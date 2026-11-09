# M5 Field Moves on the Party Screen ✅

Part of [Phase 6](../phase-6-pokemon-party.md). Rules: [context.md](context.md), D3.

**Done when:** a Pokémon's field moves show in its party menu options like FireRed; Milk Drink and Softboiled work; the others answer FireRed's refusal until [Phase 12](../../phase-12-world-content.md) gives them maps. Played 2026-11-05, with the regression check.

## What Later Work Uses

- **Contract:** `party.v1` `UseFieldMove` (slot, move, optional target), answered by `FieldMoveResult` with a `FieldMoveOutcome`.
- **`mic-core`:** the table `fieldMoves` in `pokemon/fieldmove.go`, one rule per move; `zone.useFieldMove` in `world/party.go` saves HP that moved. Phase 12 fills the `refuses(...)` entries (a rule then also needs the map and the tile in front). Sweet Scent answers `SWEET_SCENT` since Phase 7 M3 (`zone.sweetScent`).
- **Client:** `party-menu.ts`: `FIELD_MOVES`, `useFieldMove`, `refuseFieldMove`, `chooseWhoToHeal`, `shareHp`, `animateHp`. `FIELD_MOVES` only decides what's listed.

## Decisions

- **SUMMARY first, not field moves above it:** `SetPartyMonFieldSelectionActions` adds SUMMARY first.
- **Each move's own refusal,** as `sFieldMoveCursorCallbacks`, not one "can't use that here" for all.
- **Difference, the MMO's content order:** FireRed asks HMs for a badge first (`gText_CantUseUntilNewBadge`) and refuses in link rooms. There are no badges yet: Phase 12 adds that check to the table.
- **A move asks mic-core twice:** without a target ("can it be used?", also Softboiled's 1/5 check) and with it. No rule lives in the client.
- **The user pays max HP / 5 even when the target needs less,** as FireRed. It's refused at HP ≤ max / 5, not only under it.
