# M6 Boxes: Storage and Viewing 🚧

Part of [Phase 6](../phase-6-pokemon-party.md). Rules: [context.md](context.md), D6, D7.

**Done when:** the PC opens BILL'S PC, and the box screen shows the player's saved boxes like FireRed: icons, names, wallpapers, moving between boxes, and the summary of a Pokémon in a box.

## Resume Here

**State:** server and contracts done; BILL'S PC menu written; box screen not started. Uncommitted in the working tree. `mic-core` build + vet and SPA `tsc` pass. Never run: the migration, `AddCaught`, `make text`, anything in the game.

**Next step:** task 1 below, the client link and asset wiring. Then write the screen from [Box Screen Lookups](#box-screen-lookups-firered): don't re-read what's there, and read only the functions listed under [Still To Look Up](#still-to-look-up), in the step that needs them.

**Commands:** start with `cd /Users/mydherin/projects/mydherin/PokeUniverse &&`. The shell's folder can stay where an earlier command left it, and a `make` that lands in `references/pokefirered` runs FireRed's Makefile and builds there (happened once, cleaned up: the submodule is clean).

## Tasks

Done:

- [x] **Migration** `00015_add_pokemon_boxes.sql`: `trainer_pokemon.box` (0 = party, 1-14), new primary key, slot limits. `trainer_boxes`: only changed names and wallpapers; no row is FireRed's default. `trainers.current_box`.
- [x] **`mic-core`:** party queries filter `box = 0`; `pokemon.Reset` empties boxes too (`ResetTrainerPokemon`, `ResetTrainerBoxes`), `PutTrainer` resets `current_box`. `pokemon/box.go`: `LoadBoxes`, `LoadBox`, `ViewBox`, `AddCaught` (party, else `SendMonToPC`'s search from the current box; heals, as a box keeps no HP or status; unused until [Phase 7](../../phase-7-wild-battles-catching.md)). `world/box.go`: `OpenBox`, answers only at a PC, reads when asked.
- [x] **Contracts:** `party/v1/box.proto`: `OpenBox` (box 0 = current; any other becomes current), `BoxView` (box 0 = refused; all 14 `BoxInfo`, one box's `BoxPokemon`). Realtime fields: client 28 `open_box`, server 20 `box_view`. `make breaking` passes.
- [x] **PC menu** in `players-pc.ts`: BILL'S PC as the first top entry (window height 8), `accessStorage` (SE_PC_LOGIN, two messages waiting for a press), BILL'S menu with descriptions and refusals, `PcChoice.Boxes`, `billsEntry`, `resumeBills`. Constructor takes `partyCount`. `overworld.ts`: `openPcScreen(resume, open)` now takes a function. `texts.json`: the menu's strings.

To do, in order:

1. [ ] **Link and assets:**
   - `realtime/connection.ts`: `openBox(box)` (send like `useFieldMove`, line 270), `boxView` in the world interface and the switch (like `fieldMoveResult`, lines 48 and 324).
   - `overworld.ts`: `askBox(box): Promise<BoxView>` like `askFieldMove` (line 499); `case PcChoice.Boxes` in `runPc`: `this.openPcScreen(() => pc.menu.resumeBills(), (back) => startStorage(flow, host, pc.menu.billsEntry, back))`. Until this exists the menu's entries do nothing.
   - `Makefile` `FIRERED_GFX` (line 17): add `pokemon_storage`.
   - `manifest.ts`: a `STORAGE_GRAPHICS` set beside `PARTY_GRAPHICS` (line 241), loaded with a `loadStorage()` like `loadParty()` (line 655), id union at line 346. Tiles `{ png, bin, bpp4: true }`; wallpapers `wallpapers/<name>/tiles.png` and `tilemap.bin`.
   - `texts.json`: `gText_ExitFromBox`, `gText_ContinueBoxOperations`, `gPCText_Summary`, the selection message (`MSG_IS_SELECTED` in `sMessages`, `_tasks.c` line 276 on), CANCEL. Then `make text` and `make graphics`.
2. [ ] **`firered/storage/`,** split by concern, `party-menu.ts` as the shape (`startStorage` awaits `assets.loadStorage()`, the box and its art, then builds the class; `gba.reset()`, `initBg`, `copyTiles`, `gba.setVBlank(gba.standardVBlank)`, `gba.setMain(() => flow.runFrame())`, `gba.tasks.create(step)`; `beginPcScreenTurnOn(gba)` as in `item-pc.ts` line 197, off as in line 591):
   - `storage.ts`: setup, the state machine, input.
   - `box-view.ts`: wallpaper, icons, title, arrows, scrolling. The next box's answer and art are awaited **before** the scroll starts (FireRed has them at once).
   - `cursor.ts`: the hand, its shadow and its movement.
   - `display-mon.ts`: pic and text on the left.
   - `party-panel.ts`: the slide, slots, party icons.
3. [ ] **SUMMARY from a box:** `startSummary(flow, host, slot, done)` reads `host.party.pokemon[slot]`, so pass a `PartyHost` whose `party` is `new PartyState({ pokemon: the box's Pokémon })`, without the gaps, and map slots both ways. Add a `movesLocked` flag to `PartyHost`, checked in `summary.ts` at `if (!this.swapping)` (about line 1023): FireRed lets a box Pokémon's moves be switched, read-only forbids it until M7. Back from the summary: start the screen again with box, area and cursor kept, like `Resume` in `party-menu.ts`.
4. [ ] **Test content:** a few Pokémon in boxes 1 and 2, in `pokemon/testteam.go`, with the comment from [context.md](context.md#playing-a-milestone).
5. [ ] **Build and play:** [Playing a Milestone](context.md#playing-a-milestone) (rebuild `mic-core`, which applies the migration, and `spa-pokeuniverse`), the list below, then the regression check. The top menu's cursor now starts on BILL'S PC: the regression's PC steps need one more Down.
6. [ ] **Close:** cut this file down, set ✅ and the next milestone in the phase file and in `AGENTS.md`, add `firered/storage/` and `party/v1/box.proto` to [tech-stack.md](../../../tech-stack.md) line 114's list.

## Decisions and Differences

| What | Why |
|---|---|
| **MOVE ITEMS is in BILL'S menu,** though this file listed four entries | FireRed has five (`sMainMenuTexts`), and no doc gave a reason to drop it. All entries open the same read-only screen for now. Tell the user when closing |
| **Read-only:** A on a Pokémon offers only SUMMARY and CANCEL; A on the box title does nothing; no marks, grabbing or SELECT mode | This milestone's scope; [M7](m07-boxes-actions.md) adds the rest, box options included |
| Moves can't be switched in a box Pokémon's summary | Read-only; M7 removes `movesLocked` and sends it to the server |
| The next box waits for the server's answer | The MMO: boxes live on the server, not in memory |
| The bedroom PC opens BILL'S PC, directly as a top entry | D7 |

## Play It

Add a few test Pokémon to boxes 1 and 2 (test content).

- The PC menu shows the new entry; all earlier entries work the same. SEE YA! returns.
- Cursor over every position; side panel shows the right Pokémon. Change box with L/R and the arrows; wallpaper slides.
- SUMMARY of a boxed Pokémon pages through. Party panel lists the team. Mobile layout too ([ui.md](../../../ui.md)).
- New Game empties boxes too. Party is untouched by all of it.

## Box Screen Lookups (FireRed)

Files: `src/pokemon_storage_system_{tasks,graphics,data,misc}.c`.

**Backgrounds** (`initBg` sizes: BG 2 is size 1, the rest 0):

| BG | Priority | Content |
|---|---|---|
| 0 | 0 | Messages and menus. Std frame at tile 2 palette 13 (bottom window), user frame at tile 0xB palette 14 (yes/no, selection menu) |
| 1 | 1 | `menu.png` loaded at tile 0x100 (`menu.bin` entries include 0x100; 0x100 is the blank tile). Windows' tiles go after it: base 0x100 + baseBlock |
| 2 | 2 | Wallpaper, 512x256. Two tile banks: `256 * offset` |
| 3 | 3 | `scrolling_bg.png` + `.bin`; each frame X and Y move 128/256 of a pixel, that is half a pixel |

**Palettes (BG):** 0 `interface.pal`; 1 `party_menu.pal`; 2 `interface_no_display_mon.pal`; 3 `scrolling_bg` palette; 4 + 2*offset a wallpaper's two palettes (32 colors, from its PNG); 15 `item_info_frame.pal`. Sprites: `misc2.pal` for cursor and arrows.

**Windows:** 0 on BG 1: (0,11), 9x7, palette 3, baseBlock 0xC0. 1 on BG 0: (11,17), 18x2, palette 13, baseBlock 0x14: message, `FONT_NORMAL_COPY_1` at (0,2) with the outer frame. `sYesNoWindowTemplate` for yes/no: look it up.

**Display Pokémon:** pic sprite at (40,48), from `art.front` and `frontPalette` or `shinyPalette` when `mon.shiny`. Text, all in window 0, filled with 1: nickname at (6,0), `/SPECIES` at (6,14), gender and `Lv` at (10,28), item in the small font at (6,44). Gender colors (fg, bg, shadow): male 4,1,5; female 6,1,7; none 2,1,3. No gender symbol through `shownGender` in `party-menu.ts`. Empty: blank, pic invisible.

**Wallpapers** by number: forest, city, desert, savanna, crag, volcano, snow, cave, beach, seafloor, river, sky, stars, pokecenter, tiles, simple. Check each folder's name with `ls`. Drawn 20x18 tiles at tile x `(bg2_X/8 + 10 + direction*24) & 63`, y 2, each entry's tile + `offset << 8` and palette + `offset*2 + 3`. With a direction: offset flips first; the old wallpaper's 44 columns past `(bg2_X/8 + 30) & 63` are cleared (`TrimOldWallpaper`), and 4 columns are blanked beside the new one (x + 20 going right, x - 4 going left).

**Scrolling:** Right is box + 1, Left box - 1, wrapping over 14. SE_SELECT, then `bg2_X += ±6` for 32 frames (positive going right). Held L/R only in the LR button mode (`flow.options.buttonMode`), and held Left/Right on the title.

**Title:** text on a 64x16 buffer, colors bg 0, fg 14, shadow 15, palette entries 14 and 15 = RGB(7,7,7) and white for every wallpaper; `toTiles({width:64,height:16,pixels,palette:null},[4,2])` makes the sheet. Two 32x16 sprites at `x + i*32`, y 28, subpriority 24, `x = 240 - 64 - width/2`. Incoming starts at `x + direction*192`, moves `-direction*6` until in place; outgoing moves the same and is destroyed when its x is under 0x40 or over 0x100.

**Arrows:** `box_scroll_arrow.png`, at `92 + i*136`, y 28, subpriority 22.

**Box icons:** `MonIcon` at `(24*col + 100, 24*row + 44)`, priority 2, subpriority `19 - col`; 6 columns, 5 rows.

**Cursor:** `cursor.png` 32x32, subpriority 6, priority 1 (2 in the box); frames (tile offset in `AnimCmd.image`): 0 and 16 at 30 each, looping, is the bounce; 32 open; 48 fist. Shadow `cursor_shadow.png` 16x16: visible only in the box, subpriority 21, priority 2.

| Area | Position |
|---|---|
| Box | `(24*col + 100, 24*row + 32)` |
| Party | slot 0 (104,52); others (152, `24*(pos-1) + 4`); CLOSE BOX, pos 6, (152,132) |
| Title | (162,12) |
| Buttons | `(88*pos + 120, 14)`: 0 PARTY POKéMON, 1 CLOSE BOX |

**Cursor motion:** 6 steps, 12 when wrapping. Wrap -1 or 1 adds ∓192 to that axis' distance. Speed = distance << 8 / steps. Each step adds it, then keeps x in 64..256 and y in -16..176 by carrying over the edge. The flip timer starts at steps / 2 when set; at 0 it toggles `vFlip`. The last step lands exactly on target, then area and position change and the side panel updates. On starting a move: anim 1 (still), shadow hidden unless going within the box.

**Input by area** (repeat for directions; SE_SELECT on every move):

- **Box:** Up: row up, from the top row to the title. Down: row down, past the last row to buttons, pos `(pos + 6 - 30) / 3`, vertical wrap 1, flip. Left and Right wrap within the row (horizontal wrap ∓1). Start: title. A on a Pokémon: selection menu. B: continue prompt. L/R as above.
- **Title:** Up: buttons pos 0, flip. Down: box pos 2. Left/Right scroll. B: continue prompt. A: nothing for now.
- **Buttons:** Up: box pos 24 from 0, 29 from 1, vertical wrap -1, flip. Down or Start: title, flip. Left/Right wrap. A: 0 shows the party, 1 close prompt. B: continue prompt.
- **Party:** Up/Down wrap over 0-6. Left from others: slot 0, remembering `cursorPrevPartyPos` (starts at 1, and on entering). Right: from 0 back to it; from others hide the panel, box pos 0. A on 6, or B: Deposit closes (close prompt, B prompt), others hide the panel. A on a Pokémon: selection menu.

**Opening:** SE_PC_LOGIN, screen effect on. Deposit starts in the party with the panel shown, the others in the box, cursor 0. Selection menu: width `longest + 2`, height `2*items`, at `(29 - width, 15 - height)`, user frame, entries x 8, y 2, 16 apart.

**Prompts:** close: SE_SELECT, `gText_ExitFromBox`, yes/no; Yes: SE_PC_OFF, screen off. B: SE_SELECT, `gText_ContinueBoxOperations`, yes/no; **No or B** leaves, Yes stays. Back to BILL'S PC with the cursor on the entry.

**Party panel:** `party_menu.bin` is 12x22, drawn at x 10; hidden, only source rows 20-21 at y 0-1. Show: SE_WIN_OPEN. Hide: SE_SELECT, 20 frames: one row per frame, the emptied row filled with 0x100 at `y = 22 - frames` (x 10, 12 wide), sprites -8 per frame; then the cursor returns to the saved box position. `close_box_button.bin` is 9x4 at x 21, top half (source rows 0-1) when hidden. Slots 1-5: `party_slot_filled.bin` or `party_slot_empty.bin`, 4x3 written into the 12-wide buffer at index `12*(3*(pos-1)+1) + 7`. Party icons (shown): slot 0 (104,64), others (152, `24*(i-1) + 16`), priority 1, subpriority 12; hidden they're 160 higher and invisible.

### Still To Look Up

Only these, each when its step starts:

- `_tasks.c`: `SetUpShowPartyMenu`, `ShowPartyMenu`, `UpdateCloseBoxButtonTilemap`, `InitPokeStorageBg0`, `sYesNoWindowTemplate`, the Pokémon data tilemap when no Pokémon shows (`TILEMAP_PKMN_DATA`, `sPkmnData_Tilemap`), `CreateWaveformSprites` and `UpdateWaveformAnimation`, `StartDisplayMonMosaic` with `SpriteCB_DisplayMonMosaic`.
- `_graphics.c`: `InitBoxMonIconScroll` and `UpdateBoxMonIconScroll` (column timing), `StartBoxScrollArrowsSlide` on, `SpriteCB_BoxScrollArrow`, `AnimateBoxScrollArrows`, arrow anims and `sOamData_BoxTitle`.
- `_data.c`: `SetSelectionAfterSummaryScreen`, `SetCursorInParty`, `SetSelectionMenuTexts` (message and order), `SpriteCB_CursorShadow`.

### Client API

- Sprites: `SpriteTemplate { sheet, palette, width, height, priority, anims?, callback? }`; `gba.sprites.loadSheet(tag, tiles)`, `.create(template, x, y, subpriority)`, `.destroy(s)`; `sprite.startAnim(n)`, `x2`, `vFlip`, `invisible`. `gba.palettes.loadSpritePalette(tag, colors)`, `.load(colors, offset, count)`.
- `AnimCmd`: `{ image, duration }`, `{ jump }`, `"end"`.
- `new Window(bg, { left, top, width, height, palette, baseBlock })`: `fill`, `print(font, x, y, colors, text)`, `putTilemap`, `clearTilemap`, `copyToVram`, `pixels`. `printDefault` colors 1,2,3. `YesNoMenu(flow, bg, template, font, left, top, initial, frameTile, framePalette)`. `CursorMenu.processInput(wrap)`, `moveCursor`. `drawStdFrame(win, tile, palette)`, `copyTiles(bg, tiles, at, count?)`.
- `bg.map`, `bg.setEntry(tx, ty, value)`, `bg.x`, `bg.y`, `bg.tiles`, `bg.visible`. Entry: tile 10 bits, flips, palette top 4 bits.
- `MonIcon(flow, species, x, y, subpriority, priority)`: art loaded first with `assets.pokemonArt(n)`; `.sprite`, `.setAnim(4)` is still. `monName(flow, mon)`, `assets.species(n).name`, `assets.itemName(item)`, `flow.encode`, `flow.play`.
- Input: `isPressed`, `isRepeated`, `isHeld`, `Button.*`.

## Files

Touched: everything listed under Done, plus `mic-core/internal/realtime/realtime.go` and the generated `lib-contracts/gen/` and `mic-core/internal/db/`. Next: `realtime/connection.ts`, `firered/overworld.ts`, `firered/manifest.ts`, `firered/texts.json`, `firered/summary.ts`, `firered/party-menu.ts` (`PartyHost`), `firered/storage/` (new), `Makefile`, `mic-core/internal/pokemon/testteam.go`.
