# M3 TM/HM Teaching ⬜

Part of [Phase 6](../phase-6-pokemon-party.md). **Needs:** M2's learn flow. Rules: [context.md](context.md), D1, D3, D5.

**Done when:** USE in the TM CASE shows who can learn the move, teaches it, forgets a move if needed, and the catalog has every species' TM and tutor moves.

## Resume Here

Not started. First step: the learnset script; settle the source rule below against the output.

## Tasks

- [ ] **Contract:** `SpeciesInfo` gets `machine_moves` and `tutor_moves` (moves, not TM numbers, so a TM's move is `ItemInfo.move`). `make contracts`, `make breaking`.
- [ ] **Catalog:** `infra/pokemon/learnsets.mjs`, run once from `@pkmn/sim`'s data, writes both into `species/v1/catalog.proto`; print what's dropped. Then the proto is the source (D5). Add a row to AGENTS.md's exception list.
- [ ] **`mic-core`:** `FIELD_USE_TM_HM` in M1's table: species can learn it, doesn't know it, teach or forget. TMs are spent, HMs aren't (FireRed). HMs can't be forgotten, as in M11.
- [ ] **Client, party menu:** ABLE / NOT ABLE / LEARNED in the slots, "<Pokémon> learned <move>", forget flow; `tm-case.ts`'s USE opens it (`onResult`, line 470, today goes back to the list).
- [ ] **Play it,** then the [regression check](context.md#playing-a-milestone).

## Play It

- Slots show ABLE and NOT ABLE correctly for a TM several of the team can learn, and for one only some can.
- Teach with a free slot; with four moves forget one, or give up. TM spent once learned, not on giving up. HM stays.
- Already known: refused. An HM can't be forgotten afterward. The learned move works in battle, with its animation.
- Gen 4 species (387-493) and a species with few TMs (Magikarp: none) answer correctly. Reload keeps it.

## Decision to Settle

**Source of "can learn":** a species learns a TM's move if Showdown's learnset for it has `4M` or `3M`, tutor if `4T` or `3T`. FireRed's TMs teach Gen 3 moves, and the project's rules are Gen 4, so both generations count. Check the script's output for a few species before writing it down.

## What's Known

- `infra/battle/catalog.mjs:332` reads `Dex.data.Learnsets[id].learnset`, whose sources look like `4L15`; level moves come from `/^4L\d+$/`. Its header has the Docker command. `move.num > MOVE_COUNT` are skipped. `infra/pokemon/evolutions.mjs` is the shape of a once-only script that edits the proto.
- `ItemInfo.move` (field 8) is the move a TM/HM teaches; client: `world/moves.ts` `tmMove`.
- `item/use.go` already answers `PARTY_MENU` for `FIELD_USE_TM_HM`. `lib-contracts/proto/pokeuniverse/species/v1/catalog.proto:116` is `SpeciesInfo`, `level_moves` = 13.
- FireRed: `party_menu.c` `ItemUseCB_TMHM` (4762); tutors `sTutorMoves`, `sTutorLearnsets` (1903-1927). Tutor NPCs come in Phase 12: this milestone only stores their moves.

## Files

`lib-contracts/proto/pokeuniverse/species/v1/catalog.proto`, `infra/pokemon/learnsets.mjs`, `mic-core/internal/pokemon/`, `mic-core/internal/world/party.go`, `spa-pokeuniverse/src/game/firered/party-menu.ts`, `firered/tm-case.ts`, `AGENTS.md`.
