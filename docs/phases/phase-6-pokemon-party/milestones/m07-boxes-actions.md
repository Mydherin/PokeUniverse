# M7 Boxes: Managing Pokémon ✅

Part of [Phase 6](../phase-6-pokemon-party.md). **Needs:** M6. Rules: [context.md](context.md), D3, D6.

**Done when:** the box screen does everything FireRed's does: WITHDRAW, DEPOSIT, MOVE, RELEASE, held items and box options, each decided and saved by `mic-core`.

## Resume Here

**Done ✅ (2026-11-08).** Everything built and played; regression check passed. Committed with M8 and M9's edge cases.

**Played (closing session):** MOVE GARCHOMP to party slot 0 (MOVE, SHIFT with SNORLAX, PLACE SNORLAX in an empty slot): mic-core saved it, the party menu and the battle's party list agree, GARCHOMP led the room trainer's battle (a trainer battle instead of grass: same lead rule). Regression: POKéMON SWITCH, GIVE, TAKE, SUMMARY move SWITCH; BAG TOSS, USE ("It won't have any effect"), LEFTOVERS USE → OAK's "This isn't the time"; PC WITHDRAW/DEPOSIT ITEM; trainer battle with a POTION, `docker compose restart mic-core` mid-battle resumed it, win + exp; a reload mid-battle dropped it with the AWAKENING used back in the bag; stairs, SAVE, reload: same state. All saved by mic-core. No socket drop except the forced restart (the earlier "frequent drops" were the BAD_MESSAGE bug, fixed). Party drift not seen. Test levels and the bag restored from a dump afterwards.

**Bugs fixed during M7** (details below): reconnect answers paired by `BoxView.request`; `realtime.go` missing `return true` after three box actions (socket closed); the PC kept open across a reconnect (`world/open_pc.go`); GIVE from the bag as FireRed's `GiveChosenBagItem`; refused answers in the store paths.

**Differences from FireRed (with reason):** WALLPAPER's fade starts at once and waits for mic-core's answer while white (MMO: the server decides); NAME and WALLPAPER refused → the box as mic-core kept it. NAME while an item is in the hand: the item goes back to its Pokémon (it never left it on mic-core). RELEASE's SURF/DIVE rule decided by mic-core (it has every box) while the shrink runs.

**Follow-ups (outside M7):** the same lost-answer hang after a reconnect exists for `evolveAnswer`, `learnAnswer`, `fieldMoveAnswer`. Once, after fast key presses, the shown party drifted from mic-core's until a reload (not reproduced; suspect `panel.sync` during `startCompact`, or keys during `saving`).

**Dev database (account 2):** party SNORLAX, CHARIZARD (POTION), GARCHOMP, LUCARIO; M6's test copies in boxes 1-3; GARDEVOIR in box 5 ("ABC", VOLCANO, markings ● ▲); player under the bedroom PC.

## Tasks

- [x] **`mic-core`, intents and rules:** withdraw, deposit, move or swap (party or box), release, box name, wallpaper. One transaction each (D3). Rules: a party of six is full; the last Pokémon able to battle can't leave the party; holding mail can't be deposited; placing a Pokémon in a box restores HP, status and PP.
- [x] **Client, moving:** the hand (grab, place, SHIFT swing), MOVE mode, WITHDRAW, DEPOSIT with the choose-box popup, B/CLOSE BOX refused while holding, MAIL kept out of the boxes, a held one kept across the summary. Played 2026-11-07.
- [x] **Client, menus:** ✅ RELEASE (confirmation, shrink and come-back, messages, SURF/DIVE rule on mic-core; played 2026-11-07). ✅ MARK (menu, saved by mic-core, marks on PKMN DATA; played 2026-11-07). ✅ The summary shows the marks (not played).
- [x] **Client, ITEM mode:** TAKE, GIVE, SWITCH, BAG, INFO, GIVE from the bag, CLOSE BOX holding an item; server and client (not played).
- [x] **Client, box options:** JUMP, WALLPAPER, NAME (`naming-screen.ts` box mode). Played 2026-11-07.
- [x] **Play it,** then the [regression check](context.md#playing-a-milestone). Played 2026-11-08.

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


**Client moving (this milestone):**

- `storage.ts`: `held: Held | null` (`mon`, `icon`, `from`): the hand's Pokémon stays at `from` on mic-core until put down, so each PLACE or SHIFT is one `save(from, to, moved)` (= `movePokemon`); placing back on `from` sends nothing. `saving` blocks `main()` until the answer. Refused (the moved one isn't at `to` in the answer, or the call fails) → `dropHeld()` and `box.sync`/`panel.sync` show mic-core's state.
- SHIFT on mic-core is a swap, so the one now in the hand ends at the old `from` there: `from` doesn't change. FireRed compacts the party right after taking from it (`Task_HandleMovingMonFromParty`), so the shown party (`panel.mons`) is mic-core's without the held one; `partyIndex(pos)` adds one past `held.from`; an empty party slot is `{0, len(party)}`.
- Server change: party → party with an empty target at `len(party)` = to the end (`storage.go`), for a party one put down in an empty party slot.
- `box-view.ts`: `Place`, `sameMon` (species + personality: no ids), `hidden` (held one's slot shows empty), `take`, `put`, `sync`. `party-panel.ts`: own `mons`, `take`, `put`, `startCompact` (8-step slide, `MovePartySpriteToNextSlot`), `updateSlots`, `sync`. `cursor.ts`: `holding`, `HAND_OPEN`/`HAND_FIST`, `reachDown`/`reachUp` (y2 0-8), `holdPoint`, `iconPriority`.
- FireRed sources read: `_tasks.c` 935-1250 (`Task_OnSelectedMon` to `Task_DepositMenu`), 660-760 (main's INPUT_* cases), `_data.c` 405-700 (place changes, `TryStorePartyMonInBox`: first free slot, `GetFirstFreeBoxSpot`), 941 (`CanMovePartyMon`, `CanShiftMon`), 1746 (`SetMenuTextsForMon`: MOVE mode is MOVE/SHIFT/PLACE, SUMMARY, WITHDRAW in box or STORE in party, MARK, RELEASE, CANCEL), `_graphics.c` 637-940 (compact, `ShiftMons`, `SpriteCB_HeldMon`). Strings added to `texts.json`: MOVE, SHIFT, PLACE, WITHDRAW, STORE and the refusals.
- DEPOSIT (done): `MovePokemon.to = {box, slot: 30}` (`FIRST_FREE`, `box-view.ts`) = the box's first free slot, chosen by mic-core (`storage.firstFree`, the held one's own slot free as in FireRed; back on its own slot = no change); the answer is the **current** box (`world/box.go`: DEPOSIT keeps the shown box), so no extra `askBox`. Client: `Choice.Store` (Deposit entry first; MOVE mode in the party instead of WITHDRAW), `deposit()` (popup, full-box message), `store(box)` (icon into the shown box's `firstFree()` or destroyed, `save`, `compactParty`, hand still → bounce). `depositBox` (sDepositBoxId) starts on the current box per screen opening.
- `storage/choose-box.ts` `ChooseBoxMenu(flow, bg, view, box, heldFrom)`: `update()` returns a box, `BOX_CANCELED` or `BOX_NONE_CHOSEN`; `isFull`, `destroy`. JUMP reuses it (start on the current box).
- Choose-box popup: FireRed's `_menu.c` 423-660 (positions and anims are in `choose-box.ts`). Text goes into the center sheet's tiles one tile per character, up to EOS (EOS isn't a character).
- After a deposit: `Task_DepositMenu` states 2-3: compact the party, `ResetSelectionAfterDeposit` (hand bounce, display refresh).

**RELEASE (done):**

- `storage.ts` `release()`: `ask` (now `answer(yes)`, shared with CLOSE BOX and B) → the icon (held one's, or `take`n from its slot) gets `RELEASE_ANIMS` (affine, normal size box) while `releasePokemon` goes out; once the shrink ends (invisible, hand bounces) and the answer is in: released (the one isn't at `place` any more) → `released()` (messages, `compactParty` for a party one, then `sync(view)`: syncing the panel before the slide would close it at once), else `cameBack()` (grows back, put back in its slot, messages). A failed call counts as refused. `afterPress(then)` is JOY_NEW(A|B|DPAD) (also in `notice`, `deposit`); `toMain()`; `sync(view)` (box + panel, also used by `save`).
- mic-core `ReleasePokemon` → `storage.lastToKnow`: the released one knows SURF or DIVE and no other party Pokémon nor boxed one does (query `OtherBoxPokemonKnowsMove`) → `ErrRefused`. Difference: FireRed decides it on the client during the shrink; here mic-core decides (it has every box), the shrink runs meanwhile. Any server refusal plays the came-back messages (the client already refused last able and MAIL itself).

**MARK (done):**

- Server: migration `00016_add_pokemon_markings.sql` (`markings smallint 0-15`), `Pokemon.Markings` (`pokemon.go`, `store.go` rows, `Proto`), `party.proto` `Pokemon.markings = 23`, `box.proto` `SetMarkings{place, markings}` (realtime id 33), `storage.go` `SetMarkings` (ErrRefused past 4 bits or empty place), `world/box.go` `SetMarkings` through `boxAction` (answered like RELEASE).
- Client: `storage/markings-menu.ts` `MarkingsMenu(flow, markings, 176, 16)` (`update()` false once closed, `markings` changed only by OK, `destroy()`): window sprites built from the user frame's 9 tiles (`BufferMenuFrameTiles`: 8×14 tiles in two 64×64 sprites), marks/cursor/text from `markingsMenu` (`misc/markings2.png`), text sprite drawn 32×32 centered as 32×16. `storage.ts` `mark()` (`Task_ShowMarkMenu`): predicts `mon.markings`, sends only when changed, `sync(view)` on the answer. `display-mon.ts`: `marks` sprite at (40,150), anim = markings (`markingCombo`, `misc/mon_markings.png`, 16 images of 4 tiles). Makefile `FIRERED_GFX_FILES` gained both pngs (`make graphics`).
- `party-panel.ts` `sync` now takes mic-core's object for a same Pokémon too (fresh markings, HP).

**Summary marks (done, not played):** `summary.ts` `marks` sprite (`MARKS_TEMPLATE`, sheet `markingCombo` under tag `summaryMarks` with `summaryMarkingPal` = `summary_screen/marking.pal`, manifest) at (20,91); `showMarks(invisible)` (hidden with no marks) next to every `pic` show/hide: first page, `hideSpritesBeforeFlip` (Moves, RIGHT), `showSpritesBeforeFlip` (MovesInfo), seek step 11.

### ITEM mode (done, played)

- Contract: `box.proto` `MoveHeldItem{from,to}` (34), `StoreHeldItem{place}` (35), `GiveHeldItem{place, item}` (36); client `BoxAction` union has them. Answers: `BoxView` (+ `PartyChanged` when the party is touched, + `BagChanged` first for store/give). Refused = nothing changed; the client reads the result from the held items in the answer.
- Same idea as moving a Pokémon: the hand's item stays on `from` on mic-core until put down. `MoveHeldItem` swaps `from`'s and `to`'s items (GIVE when `to` holds none, SWITCH otherwise: the hand's new item is then at `from`, so `from` stays). Refused when `from` holds nothing, either holds MAIL, or `from == to`.
- `pokemon/storage.go`: `storage.edit(places, change)` (copies, change, writes box slots one by one and the party once; now also under `SetMarkings`), `MoveHeldItem`, `ChangeHeldItem(pl, change(held) (held, err))`. `world/box.go`: `boxItemAction` (boxAction + an `item.State` copy saved with `item.Write` in the same transaction, `sendChanged` on success; `boxAction` wraps it), `heldItemInBox` runs `item.TakeHeld` (MAIL refused) or `item.Hold(fromPC=false)`; refused unless TAKEN/GIVEN/SWAPPED.
- Client (done): `storage/item-icons.ts` `ItemIcons` (3 affine 32×32 sprites, tags `storageItemIcon0..2`, subpriority 11; `showAt`/`hideAt` (APPEAR/DISAPPEAR), `toHand`, `inHand`, `swap`, `give`, `toBag`, `handToBag`, `hideParty`, `dropHand`, `clear`, `busy` = IsItemIconAnimActive; hand point = `cursor.itemPoint()` (hand x+4, y+y2+8); box slot (24·col+112, 24·row+56) prio 2, party 0 (116,76), others (164, 24·(pos−1)+28) prio 1; flights 12 frames of (10,21)/16 px, swaps swing by SIN[f·8]>>4). `storage.ts`: `items` and `heldItem: {item, from}` only in MOVE ITEMS (`startItemMode`: BLDALPHA 7/11 on all layers, `itemMode` on `BoxArea`/`PartyPanel` (icon of a Pokémon holding nothing = `ObjMode.Blend`, `setItem`, `refreshBlend`) and `DisplayMon` (item name on top, rest 15 px lower), INFO frame tiles at BG0 0x1A4). Menus = `SetMenuTextsForItem`; message MSG_IS_SELECTED2 (item name) or "GIVE to a POKéMON?". `moveCursor` hides/shows the icon under the hand; `scrollBox` waits for the icon to shrink, shows it after; `hideParty` slides party icons up. TAKE sends nothing (the `from` Pokémon shows no item locally: `hideHeldItem` after every `sync` and scroll); GIVE/SWITCH = `saveItem(moveHeldItem)` (back on `from` = nothing); BAG = `storeHeldItem` answered first (still held = SE_FAILURE "The BAG is full."); CLOSE BOX/B holding = "Put this item in the BAG?" (YES first) → `storeHeldItem{from}`; GIVE from the bag = fade, `startBag(..., BagLocation.PcBox)` (new location: like Party's GIVE, MAIL refused with "You can't write MAIL here."), back through `Resume.given` → `giveHeldItem{place, item}`, the item shown on that Pokémon, hand empty (FireRed's `GiveChosenBagItem`). Refused (`saveItem`'s check or a failed call) → `dropHeldItem`, `resetItemIcons`. INFO: `INFO_WINDOW` (BG0, 0,12, 25×8, base 0x14) slid in column by column, `drawInfoFrame`, SE_WIN_OPEN both ways. Strings added: TAKE, GIVE, SWITCH, BAG, INFO and the item messages.
- Watch when playing: a refused GIVE/SWITCH while its anim runs still prints the success message (screen then corrected).
- FireRed flow (`_tasks.c` 1408-1660): TAKE (`Task_TakeItemForMoving`): MAIL → "can't store mail" message; else hand opens, `Item_FromMonToMoving`, wait icon anim, fist, refresh display. GIVE (`Task_GiveMovingItemToMon`): hand opens, `Item_GiveMovingToMon`, wait, bounce, MSG_ITEM_IS_HELD, A/B/DPAD. BAG (`Task_ItemToBag`): `AddBagItem` fails → SE_FAILURE MSG_BAG_FULL; else `Item_TakeMons`, wait, MSG_PLACED_IN_BAG, A/B/DPAD, refresh. SWITCH (`Task_SwitchSelectedItem`): MAIL check on the target, `Item_SwitchMonsWithMoving`, fist, MSG_CHANGED_TO_ITEM. INFO (`Task_ShowItemInfo`): SE_WIN_OPEN, description window slides in, A/B/DPAD, slides out. CLOSE BOX holding an item (`Task_CloseBoxWhileHoldingItem`): MSG_PUT_IN_BAG + YES/NO; YES → bag full message or `MoveItemFromCursorToBag`, then bounce. GIVE2 (`Task_GiveItemFromBag`): fade out, `SCREEN_CHANGE_ITEM_FROM_BAG`.

**From M6** (its file's [Box Screen Lookups](m06-boxes-storage.md#box-screen-lookups-firered) has FireRed's positions, timings and input per area; read only the part at hand):

- Server: `pokemon/box.go` (`LoadBoxes`, `LoadBox`, `ViewBox`, `AddCaught` for Phase 7), `world/box.go` (`OpenBox`, only at a PC). `trainer_boxes` keeps only changed names and wallpapers; `trainers.current_box`.
- Client: `storage/storage.ts` (state machine, input, prompts, `openSelection`, `choose`), `box-view.ts` (`BoxArea`), `cursor.ts`, `display-mon.ts`, `party-panel.ts`. Entry is `BillsEntry` (`players-pc.ts`); PARTY POKéMON's "Which one will you take?" already follows it.
- To remove: `movesLocked` (`PartyHost`, `summary.ts`, set in `openSummary`) once move switching reaches the server; its header shows ⒶSWITCH meanwhile.
- Not done in M6: the waveform and mosaic for a moved Pokémon, the CLOSE BOX flash when holding one (`_tasks.c` line 811), marks, SELECT mode, A on the title.
- `bg.x` and `bg.y` are in 1/256 pixels.

- `pokemon_storage_system_data.c:625` `SetPlacedMonData`: `BoxMonRestorePP` on placing a box Pokémon. `_tasks.c` is the flow (2770 lines): read the piece at hand.
- `world/party.go` `partyChange` and `heldItemAction` are the shapes of an action; `sendParty` updates the client.

## Files

`mic-core/internal/pokemon/` (`storage.go`), `mic-core/internal/world/box.go`, `world/open_pc.go`, `mic-core/internal/realtime/realtime.go`, `mic-core/internal/world/`, `mic-core/queries/pokemon.sql`, `lib-contracts/proto/pokeuniverse/`, `spa-pokeuniverse/src/game/firered/storage/`, `spa-pokeuniverse/src/realtime/` (`box-action.ts`, `connection.ts`), `overworld.ts` (`boxAction`, `storageHost`), `bag.ts` (`BagLocation.PcBox`).
