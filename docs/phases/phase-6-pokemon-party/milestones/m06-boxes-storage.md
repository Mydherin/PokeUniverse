# M6 Boxes: Storage and Viewing ✅

Part of [Phase 6](../phase-6-pokemon-party.md). Rules: [context.md](context.md), D6, D7.

**Done when:** the PC opens BILL'S PC, and the box screen shows the player's saved boxes like FireRed: icons, names, wallpapers, moving between boxes, and the summary of a Pokémon in a box.

## Outcome

Played and closed. Boxes live in `mic-core` (migration `00015`, `pokemon/box.go`, `world/box.go`, `party/v1/box.proto`); the client is `firered/storage/` plus BILL'S PC in `players-pc.ts`. Read-only: M7 adds the actions.

**Fixed while playing:**

- Wallpaper didn't change on a slide: `Background.x` is in 1/256 pixels and the slide wrote pixels (`bgX << 8` now). BG 3's drift had the same mistake (`BG3_SPEED = 128`).
- DEPOSIT: Right on a party slot no longer hides the panel (`Task_PokeStorageMain` ignores it there).
- PARTY POKéMON outside MOVE POKéMON and MOVE ITEMS shows `gText_WhichOneWillYouTake` until any press, as FireRed's, instead of opening the panel.

**Not played:** L/R in the LR button mode (code follows FireRed); New Game emptying the boxes (checked in code: `pokemon.Reset`, and saving the party only deletes `box = 0`). Touch: the shared pad didn't answer a mouse click in the emulated phone, the same for every screen.

**Dev database left over (account 2):** 30 test copies in box 3 and the copies in boxes 1-2. Undo: `delete from trainer_pokemon where account_id=2 and box>0`, then `update trainers set current_box=default where account_id=2`.

## Decisions and Differences

| What | Why |
|---|---|
| **MOVE ITEMS is in BILL'S menu** | FireRed has five entries (`sMainMenuTexts`). It opens the Pokémon screen for now; M7 gives it FireRed's item mode |
| **Read-only:** A on a Pokémon offers only SUMMARY and CANCEL; A on the box title does nothing; no marks, grabbing or SELECT mode | This milestone's scope; [M7](m07-boxes-actions.md) adds the rest, box options included |
| Moves can't be switched in a box Pokémon's summary (the header still shows ⒶSWITCH) | Read-only; M7 removes `movesLocked` and sends it to the server |
| The next box waits for the server's answer | The MMO: boxes live on the server, not in memory |
| The bedroom PC opens BILL'S PC, directly as a top entry | D7 |

## Box Screen Lookups (FireRed)

Files: `src/pokemon_storage_system_{tasks,graphics,data,misc}.c`.

**Backgrounds** (`initBg` sizes: BG 2 is size 1, the rest 0):

| BG | Priority | Content |
|---|---|---|
| 0 | 0 | Messages and menus. Std frame at tile 2 palette 13 (bottom window), user frame at tile 0xB palette 14 (yes/no, selection menu) |
| 1 | 1 | `menu.png` loaded at tile 0x100 (`menu.bin` entries include 0x100; 0x100 is the blank tile). Windows' tiles go after it: base 0x100 + baseBlock |
| 2 | 2 | Wallpaper, 512x256. Two tile banks: `256 * offset` |
| 3 | 3 | `scrolling_bg.png` + `.bin`; each frame X and Y move 128/256 of a pixel, that is half a pixel |

**Palettes (BG):** 0 `interface.pal`; 1 `party_menu.pal`; 2 `interface_no_display_mon.pal`; 3 `scrolling_bg` palette; 4 + 2*offset a wallpaper's two palettes (32 colors, from its PNG); 15 `item_info_frame.png`'s palette. Sprites: `misc2.pal` for cursor and arrows.

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
- **Buttons:** Up: box pos 24 from 0, 29 from 1, vertical wrap -1, flip. Down or Start: title, flip. Left/Right wrap. A: 0 shows the party (outside MOVE POKéMON and MOVE ITEMS, `gText_WhichOneWillYouTake` until any press), 1 close prompt. B: continue prompt.
- **Party:** Up/Down wrap over 0-6. Left from others: slot 0, remembering `cursorPrevPartyPos` (starts at 1, and on entering). Right: from 0 back to it; from others hide the panel, box pos 0 (Deposit: nothing). A on 6, or B: Deposit closes (close prompt, B prompt), others hide the panel. A on a Pokémon: selection menu.

**Opening:** SE_PC_LOGIN, screen effect on. Deposit starts in the party with the panel shown, the others in the box, cursor 0. Selection menu: width `longest + 2`, height `2*items`, at `(29 - width, 15 - height)`, user frame, entries x 8, y 2, 16 apart.

**Prompts:** close: SE_SELECT, `gText_ExitFromBox`, yes/no; Yes: SE_PC_OFF, screen off. B: SE_SELECT, `gText_ContinueBoxOperations`, yes/no; **No or B** leaves, Yes stays. Back to BILL'S PC with the cursor on the entry.

**Party panel:** `party_menu.bin` is 12x22, drawn at x 10; hidden, only source rows 20-21 at y 0-1. Show: SE_WIN_OPEN. Hide: SE_SELECT, 20 frames: one row per frame, the emptied row filled with 0x100 at `y = 22 - frames` (x 10, 12 wide), sprites -8 per frame; then the cursor returns to the saved box position. `close_box_button.bin` is 9x4 at x 21, top half (source rows 0-1) when hidden. Slots 1-5: `party_slot_filled.bin` or `party_slot_empty.bin`, 4x3 written into the 12-wide buffer at index `12*(3*(pos-1)+1) + 7`. Party icons (shown): slot 0 (104,64), others (152, `24*(i-1) + 16`), priority 1, subpriority 12; hidden they're 160 higher and invisible.

**Show panel:** 20 frames: source rows `20 - t` to 21 drawn from y 0, sprites +8 per frame. Party panel and close button at x 10 and 21, y 0.

**Yes/no:** `sYesNoWindowTemplate` BG 0, (24,11), 5x4, palette 15, baseBlock 0x5C; `CreateYesNoMenu(font NORMAL_COPY_1, left 0, top 2, frame tile 11, palette 14, initial 1)`. BG 0 starts blank.

**Pokémon data:** `pkmn_data.bin` 8x4 at (1,0) on BG 1: source rows 0-1 with a Pokémon, 2-3 without. **Waveform:** `waveform.png`, 16x8 sprites at `(i*63 + 8, 9)`, subpriority 2, palette misc2. Anims by `i*2` off, `i*2 + 1` on: left off tile 0; left on 2, 4, 6 at 8 frames looping; right off 8; right on 10, 4, 12 at 8 looping. The mosaic only follows a Pokémon being moved: M7.

**Arrows:** 8x16, priority 2; anim 0 left tile 0, anim 1 right tile 2. Bounce (`speed` -1 left, 1 right): every 4th frame `x2 += speed`, after 6 moves back to 0. Runs on entering the title or after any scroll, stops on leaving it or on A there. Slide: going right timers 5 (left arrow) and 29 (right), jump x 248; going left 29 and 5, jump 72. Each frame `x -= scrollSpeed`, invisible at x <= 72 or >= 248; when its timer ends, x = the jump, visible, and it goes on moving. Scroll end: back in place, visible.

**Box icons scrolling:** old ones move at `-6*direction` and stop at x <= 68 or >= 252; columns leave and arrive one by one, built as FireRed's, because moving both boxes as a block passes the 64 sprites.

**Cursor shadow:** cursor's x, y + 20. **After SUMMARY:** the cursor goes on the last Pokémon viewed. **Selection message:** `gText_PkmnIsSelected` with `{DYNAMIC 0}` = name (`expandDynamic`), SUMMARY then CANCEL for this milestone.

**Close button flash:** only while holding a Pokémon going to the party (`_tasks.c` line 811): M7.

Sprites center on (x, y) as FireRed's. `FontId.NormalCopy1`.

### Client API

- Sprites: `SpriteTemplate { sheet, palette, width, height, priority, anims?, callback? }`; `gba.sprites.loadSheet(tag, tiles)`, `.create(template, x, y, subpriority)`, `.destroy(s)`; `sprite.startAnim(n)`, `x2`, `vFlip`, `invisible`. `gba.palettes.loadSpritePalette(tag, colors)`, `.load(colors, offset, count)`.
- `AnimCmd`: `{ image, duration }`, `{ jump }`, `"end"`.
- `new Window(bg, { left, top, width, height, palette, baseBlock })`: `fill`, `print(font, x, y, colors, text)`, `putTilemap`, `clearTilemap`, `copyToVram`, `pixels`. `printDefault` colors 1,2,3. `YesNoMenu(flow, bg, template, font, left, top, initial, frameTile, framePalette)`. `CursorMenu.processInput(wrap)`, `moveCursor`. `drawStdFrame(win, tile, palette)`, `copyTiles(bg, tiles, at, count?)`.
- `bg.map`, `bg.setEntry(tx, ty, value)`, `bg.x`, `bg.y` (in 1/256 pixels), `bg.tiles`, `bg.visible`. Entry: tile 10 bits, flips, palette top 4 bits.
- `MonIcon(flow, species, x, y, subpriority, priority)`: art loaded first with `assets.pokemonArt(n)`; `.sprite`, `.setAnim(4)` is still. `monName(flow, mon)`, `assets.species(n).name`, `assets.itemName(item)`, `flow.encode`, `flow.play`.
- Input: `isPressed`, `isRepeated`, `isHeld`, `Button.*`.

## Files

The server and contract work, plus `mic-core/internal/realtime/realtime.go` and the generated `lib-contracts/gen/` and `mic-core/internal/db/`; then `realtime/connection.ts`, `firered/overworld.ts`, `firered/manifest.ts`, `firered/mon-icon.ts`, `firered/texts.json`, `firered/summary.ts`, `firered/party-menu.ts`, `firered/storage/` (new), `firered/players-pc.ts`, `Makefile`, `mic-core/internal/pokemon/testteam.go`, this file and the phase file.
