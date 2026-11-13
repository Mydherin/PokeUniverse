# M7: Pokémon Center 2F

Part of [Phase 9](../phase-9-social.md). Decisions: [context.md](context.md#pokémon-center-2f) D15, D17. References: [context.md](context.md#firered-and-heartgold-references) (2F map, attendants' scripts).

## Resume Here

**In progress** (session 1, 2026-11-14, stopped at the context guard). Build state: `make maps` compiles (0 errors), `mic-core` builds (`go build ./...` in docker). Stack not rebuilt or restarted yet; no case played.

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
