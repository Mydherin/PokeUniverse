# M7: Pokémon Center 2F

Part of [Phase 9](../phase-9-social.md). Decisions: [context.md](context.md#pokémon-center-2f) D15, D17. References: [context.md](context.md#firered-and-heartgold-references) (2F map, attendants' scripts).

## Resume Here

**In progress** (session 2, 2026-11-14, stopped at the context guard). Build state: all code written; `npx tsc --noEmit` (spa) passes, `mic-core` builds (`go build ./... && go vet` in docker), `make contracts`, `make text`, `make audio`, `make graphics` run. **Stack not rebuilt or restarted; no case played.**

**Next step:** rebuild and restart the stack (mic-core, spa; one replica), then play cases 1-8 in the built-in pane (M6's setup: grep `Built-in browser pane` in m06-private-channels.md). Watch for: the door overlay's depth (drawn under the player, `ahead: -1`) and its closed frame (cut from `tilesets/pokemon_center.png` frames 726/734); the escalator ride's direction (2F's (1,6) is `down_escalator`: angles 0x7c/0x76); the Union Room joke fitting the box (`PU_Text_UnionRoomJoke`, `infra/text/extract.mjs`); SaveDialog inside a script (`askSave`) clearing its windows before the next message.

**Session 2 done (files):**
- Door art: `Makefile` (`door_anims/cable_club.png` in `FIRERED_GFX_FILES`; `data/tilesets/secondary/pokemon_center/palettes/08.pal` copied as `door_anims/cable_club.pal`), `manifest.ts` `doorCableClub`; sounds `mus_poke_center`, `se_sliding_door`, `se_escalator` in `sounds.json` (+ `SoundId` list in `manifest.ts`).
- Client warps: new `spa-pokeuniverse/src/game/firered/door-warp.ts` (`Door` overlay per WARP_DOOR warp cell, `LeavingDoor`/`ArrivingDoor` = Task_DoorWarp/Task_ExitDoor, `LeavingEscalator`/`ArrivingEscalator` = field_effect.c's escalator out/in); `world/avatar.ts` (north into a WARP_DOOR with a warp → `link.warp`; a step onto an escalator with a warp → `link.warp`; `forceWalk(d)` for the arrivals' scripted step, sent as a move; `isEscalator`); `player-sprite.ts` `visible`; `overworld.ts` (`leaveByWarp` picks stairs/door/escalator; arrival by the destination's behavior; `Warp.leaving`, `doors`).
- Scripts with branches: `world.proto` `ScriptStep` gains `multichoice` (`Multichoice{menu, to}`: jump per choice, then B), `jump`, `ask_save` (NO target), `end`. mic-core `internal/world/cable_club.go`: the three attendants built per player from the party (`partyScripts`, keyed by object script; `Interaction` now takes the party): Wireless Club YES/NO; Union Room YES (joke) / NO / INFO; Direct Corner TRADE (YES/NO, two-Pokémon check) / COLOSSEUM (SINGLE, DOUBLE with `party.Able() < 2` check, MULTI, INFO, EXIT) → `askSave` → choose-leader text → JOIN/LEADER/EXIT all end with `CableClub_Text_PleaseVisitAgain` until M8. Client: new `script-multichoice.ts` (FireRed's lists and positions; base block 0x125 as the player menu), `overworld.ts` runs `jump`/`end`/`multichoice`/`askSave` (SaveDialog), a message before a multichoice (past jumps) doesn't wait for A.
- Strings: `texts.json` + `WORLD_TEXTS` (`cable_club.*` → `CableClub_Text_*`), menu labels (`gText_Yes`, `gText_TradeCenter`, …); our joke `PU_Text_UnionRoomJoke`.
- Not done: the attendants' music is the map's (`mus_poke_center`, nothing to do); `faceOriginal` not used (FireRed's `release` doesn't turn them back).

**Done:**
- `tool-maps convert` now also converts `TradeCenter` and `BattleColosseum_2P` (`includedLinkRooms` in `tool-maps/internal/convert/convert.go`; [maps.md](../../../maps.md) Scope line updated). Converted `ViridianCity_PokemonCenter_2F TradeCenter BattleColosseum_2P` → `lib-maps/layouts/pokemon_center_2f.yaml`, `lib-maps/maps/{pokemon_center_2f,trade_center,battle_colosseum_2p}.yaml`, `lib-maps/tilesets/{pokemon_center,cable_club}.yaml`. The 2F map was renamed from `viridian_city_pokemon_center_2f` (id and file); its stairs warp is `{ id: pallet_town_players_house_2f, at: [1, 6], to: pallet_town_players_house_2f, spawn: pallet_town_players_house_2f }`; objects as converted (scripts `common.union_room_attendant`, `common.wireless_club_attendant`, `common.direct_corner_attendant`; mystery gift man with `flag: hide_mg_deliverymen`). Union Room warp (5,1) left out by convert; Trade Center warp (9,1) kept (behind the counter, unreachable). Link rooms' objects (attendant, chair/seat triggers) not wired yet (M8).
- House 2F door: `overrides: [{ at: [7, 1], behavior: warp_door }]` and warp `{ id: pokemon_center_2f, at: [7, 1], to: pokemon_center_2f, spawn: pallet_town_players_house_2f }` in `pallet_town_players_house_2f.yaml` (back wall, between the bookshelf and the stair rail; (7,2) below is floor).
- `mic-core/internal/world/warp.go`: `warpCell` decides the warp as FireRed: stair warp (as before), the `WARP_DOOR` tile in front going north (TryDoorWarp), or the escalator under the player (TryStartWarpEventScript: client sends `UseWarp` with its own cell after stepping on it). `arrivalFacing`: east on an escalator (then FireRed walks one step east: EscalatorWarpInEffect_6/7), south otherwise (a door's arrival walks out south).

**Gotcha (decision taken, Why):** the house's tilesets (`building` + `generic_building_1`) have **no door metatile** (checked the whole catalog). So the client draws the door as an overlay: FireRed's **Cable Club door** (`graphics/door_anims/cable_club.png`, `METATILE_PokemonCenter_CableClubDoor` 0x2DE, `DOOR_SIZE_1x2`, `DOOR_SOUND_SLIDING`; `src/field_door.c` line 280), covering (7,0)-(7,1). *Why:* FireRed's only indoor wall door, and it's the door that leads to the link area. Its palette is the `pokemon_center` tileset's (see `sDoorAnimPalettes_CableClub` in `field_door.c`); `make graphics` must copy the png (gitignored output).

**Next step:** client (`spa-pokeuniverse`):
1. Door art: add `door_anims/cable_club.png` + its palette to `make graphics` / `manifest.ts`; draw the closed frame at house (7,0)-(7,1).
2. `src/game/world/rules.ts` + `avatar.ts` (~line 174, `Collision.StairWarp` → `link.warp`): pressing north into a `WARP_DOOR` cell with a warp → `useWarp(d, x, y)` with the player's own cell; stepping onto an escalator cell with a warp → `useWarp` after the step.
3. `src/game/firered/overworld.ts` (`leaveByStairs` ~885, `warped` ~876, `ArrivingStairs` ~921) and a new `door-warp.ts` / `escalator-warp.ts` next to `stair-warp.ts` (same `Leaving*`/`Arriving*` shape): Task_DoorWarp (door opens with SE, walk up, door closes, hide, fade; `field_fadetransition.c` 743), Task_ExitDoor (black, fade in, after 25 frames SE + door opens, walk down, close at 14 frames; line 317), escalator out/in (`field_effect.c` 1323-1600: SE_ESCALATOR, sprite offset by Cos/Sin(0x84,0x94) down or (0x7c,0x76) up, 16 steps every 2 frames, then walk east).
4. Then attendants (scripts `common.*_attendant`, `cable_club.inc`), strings via `make text`, then the Manual Test.

**Files touched:** `tool-maps/internal/convert/convert.go`, `lib-maps/` (new files above + house 2F), `mic-core/internal/world/warp.go`, `docs/maps.md`.

**Commands:** `make tool-maps CMD="convert ..."`, `make tool-maps CMD=validate`, `make maps`, `make tool-maps CMD="preview pokemon_center_2f --objects --collision --scale 2"`; Go build: `docker run --rm -v "$PWD":/repo -v pokeuniverse-go-mod:/go/pkg/mod -v pokeuniverse-go-build:/root/.cache/go-build -w /repo/mic-core golang:1.27-alpine go build ./...`. Tile previews: `make tool-maps CMD="catalog-preview <tileset>"`.

## Tasks

- **Map:** `lib-maps/maps/pokemon_center_2f.yaml` from `ViridianCity_PokemonCenter_2F` (layout, tileset, receptionists, the hidden mystery gift man, warps); also `trade_center.yaml` and `battle_colosseum_2p.yaml` (used by M8), with their objects and seats.
- **Door:** a door in the player's room (house 2F), placed clear of FireRed's furniture and the stairs, warping to the 2F's stairs tile; the stairs warp back to it (D15). The door uses FireRed's door animation and sound.
- **Attendants (D17):** Wireless Club (`CableClub_EventScript_WirelessClubAttendant`), Union Room (`CableClub_EventScript_UnionRoomAttendant`: YES gives the joke, NO and INFO as FireRed), Direct Corner (`CableClub_EventScript_DirectCornerAttendant`: TRADE / COLOSSEUM / CANCEL; COLOSSEUM → SINGLE / DOUBLE / MULTI / INFO / EXIT; the checks and their messages; the save exchange as SAVE). Up to the choice of LEADER/JOIN, which M8 makes work (for now it says the link failed: `CableClub_Text_AbortLink`).
- **Strings:** FireRed's through `make text`; the Union Room joke ours (in the charset).
- **Music:** the Pokémon Center's.

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Door | Walk into the room's door | Door animation, 2F; stairs bring you back | ⬜ |
| 2 | Map | Walk the 2F | Collisions, counters, music as FireRed (compare the emulator once) | ⬜ |
| 3 | Wireless Club | Talk, YES then NO | FireRed's texts | ⬜ |
| 4 | Union Room | YES; NO; INFO | Joke; FireRed's goodbye; FireRed's info | ⬜ |
| 5 | Direct Corner | TRADE, COLOSSEUM menus, INFO | FireRed's menus and texts | ⬜ |
| 6 | Checks | One Pokémon → TRADE; one usable → DOUBLE | FireRed's refusals | ⬜ |
| 7 | Save exchange | Choose TRADE | SAVE-like dialog, nothing saved | ⬜ |
| 8 | Many players | Bots on the 2F | Drawn, no blocking (Phase 8 D6) | ⬜ |
