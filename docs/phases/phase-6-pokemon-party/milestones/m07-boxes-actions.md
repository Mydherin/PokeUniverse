# M7 Boxes: Managing Pokémon 🚧

Part of [Phase 6](../phase-6-pokemon-party.md). **Needs:** M6. Rules: [context.md](context.md), D3, D6.

**Done when:** the box screen does everything FireRed's does: WITHDRAW, DEPOSIT, MOVE, RELEASE, held items and box options, each decided and saved by `mic-core`.

## Resume Here

The server task is done and builds; the client's way to it is in (`npx tsc` clean). Nothing committed or played. **Next step:** Client, moving: in `storage/storage.ts`, the pick-up hand (cursor frames 32 open, 48 fist; [M6 lookups](m06-boxes-storage.md#box-screen-lookups-firered) "Cursor" lines) and MOVE mode placing, calling `host.boxAction({ case: "movePokemon", value: { from: { box, slot }, to: { box, slot } } })` after showing the change; then WITHDRAW and DEPOSIT. Read in FireRed `_tasks.c` only the move/place tasks (grep `Task_MoveMon\|Task_PlaceMon\|Task_WithdrawMon\|Task_DepositMenu`) and `_data.c` `SetMovingMonData`/`SetPlacedMonData` (around line 625).

**Before playing:** the dev database (account 2) still has M6's test copies in boxes 1-3, and its party is a full six, so WITHDRAW refuses. Clear them or reuse them: `delete from trainer_pokemon where account_id=2 and box>0` and `update trainers set current_box=default where account_id=2`, through `docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'` (the user runs the delete: auto mode blocked it).

**Commands:** start with `cd /Users/mydherin/projects/mydherin/PokeUniverse &&`. `npx tsc --noEmit` from `spa-pokeuniverse/`; after a client change `docker compose up -d --build spa-pokeuniverse`; after adding a string to `texts.json`, `make text`. No `go` on this machine: `mic-core` compiles in its Docker build (`docker compose up -d --build mic-core`).

**Playing in the browser pane** (`http://localhost:8080/play`, the user signs in): keys Z = A, X = B, Enter = START, arrows. Helper, once per page load with `javascript_tool`: `window.__k = async (seq, gap=350) => { for (const code of seq) { window.dispatchEvent(new KeyboardEvent('keydown',{code})); await new Promise(r=>setTimeout(r,50)); window.dispatchEvent(new KeyboardEvent('keyup',{code})); await new Promise(r=>setTimeout(r,gap)); } }`. To the box screen after a reload (the player is saved under the bedroom PC): wait 6 s, `Enter` ×2 (2.5 s apart), `KeyZ` (CONTINUE), `KeyZ`, `ArrowUp` (face the PC), then `KeyZ` ×5 (about 2 s apart) to BILL'S menu, then `ArrowDown ArrowDown KeyZ` for MOVE POKéMON (none for WITHDRAW, one for DEPOSIT). Zoom on region `[130,200,670,560]` to see the screen.

## Tasks

- [x] **`mic-core`, intents and rules:** withdraw, deposit, move or swap (party or box), release, box name, wallpaper. One transaction each (D3). Rules: a party of six is full; the last Pokémon able to battle can't leave the party; holding mail can't be deposited; placing a Pokémon in a box restores HP, status and PP.
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

**Server (done this milestone):**

- Contract (`party/v1/box.proto`, realtime ids 29-32): `BoxPlace{box, slot}` (box 0 = party; party slot `len(party)` = WITHDRAW to the end), `MovePokemon{from,to}` (taken `to` = SHIFT), `ReleasePokemon{place}`, `RenameBox{box,name}`, `SetBoxWallpaper{box,wallpaper}`.
- Answer to each: a `BoxView` of the box shown (`to`'s box, else `from`'s, else current; it becomes current), plus `PartyChanged` whenever the action touches the party (sent on refusal too, to correct). Refused = nothing written; the client predicts, then trusts the answer. No separate result message: the client checks FireRed's refusals itself first (messages), the server re-checks.
- Rules in `pokemon/storage.go` (`MovePokemon`, `ReleasePokemon`, `SetBox`, `ErrRefused`): party ≤ 6; party must keep `Able() ≥ 1`; MAIL never ends in a box nor is released (`item.IsMail`, now exported); a Pokémon placed in a box is a healed copy (HP, status, PP); release drops the held item; name 1-8 runes, wallpaper 0-15. FireRed sources: `CanMovePartyMon`/`CanShiftMon` (`_data.c:941`), mail and release checks (`_tasks.c:667,723,999-1018`: release also refuses eggs, no eggs yet).
- `world/box.go`: `boxAction(p, shown, touchesParty, act)` runs act + `ViewBox` in one transaction, only at a PC; `viewBox` helper (also used by `OpenBox`). Queries `DeleteBoxPokemon`, `UpsertTrainerBox`. Regenerate with `make contracts sqlc`.
- Client plumbing (done): `realtime/box-action.ts` `BoxAction` (union of the four messages), `connection.boxAction(action)`, `StorageHost.boxAction(action): Promise<BoxView>` (overworld waits on the same `boxAnswer` as `askBox`; offline answers box 0). `PartyChanged` arrives before the `BoxView`, and the overworld already applies it to the party, so the screen re-reads `partyHost` and the view when the promise resolves.
- Not yet on the server: markings (add a column with the menus task), ITEM mode's box held items (GIVE/TAKE/SWITCH on box slots: add an intent with that task, reuse `item.Hold`/`item.TakeHeld`).


**From M6** (its file's [Box Screen Lookups](m06-boxes-storage.md#box-screen-lookups-firered) has FireRed's positions, timings and input per area; read only the part at hand):

- Server: `pokemon/box.go` (`LoadBoxes`, `LoadBox`, `ViewBox`, `AddCaught` for Phase 7), `world/box.go` (`OpenBox`, only at a PC). `trainer_boxes` keeps only changed names and wallpapers; `trainers.current_box`.
- Client: `storage/storage.ts` (state machine, input, prompts, `openSelection` with SUMMARY and CANCEL only), `box-view.ts` (`BoxArea`), `cursor.ts`, `display-mon.ts`, `party-panel.ts`. Entry is `BillsEntry` (`players-pc.ts`); PARTY POKéMON's "Which one will you take?" already follows it.
- To remove: `movesLocked` (`PartyHost`, `summary.ts`, set in `openSummary`) once move switching reaches the server; its header shows ⒶSWITCH meanwhile.
- MOVE ITEMS opens the Pokémon screen: FireRed's item mode (`OPTION_MOVE_ITEMS`) goes in with the ITEM mode task.
- Not done in M6: the waveform and mosaic for a moved Pokémon, the CLOSE BOX flash when holding one (`_tasks.c` line 811), marks, SELECT mode, A on the title.
- `bg.x` and `bg.y` are in 1/256 pixels.

- `pokemon_storage_system_data.c:625` `SetPlacedMonData`: `BoxMonRestorePP` on placing a box Pokémon. `_tasks.c` is the flow (2770 lines): read the piece at hand.
- `world/party.go` `partyChange` and `heldItemAction` are the shapes of an action; `sendParty` updates the client.

## Files

`mic-core/internal/pokemon/` (`storage.go`), `mic-core/internal/world/box.go`, `mic-core/internal/realtime/realtime.go`, `mic-core/internal/world/`, `mic-core/queries/pokemon.sql`, `lib-contracts/proto/pokeuniverse/`, `spa-pokeuniverse/src/game/firered/storage/`, `spa-pokeuniverse/src/realtime/` (`box-action.ts`, `connection.ts`), `overworld.ts` (`boxAction`, `storageHost`).
