# M7: Pokémon Center 2F

Part of [Phase 9](../phase-9-social.md). Decisions: [context.md](context.md#pokémon-center-2f) D15, D17. References: [context.md](context.md#firered-and-heartgold-references) (2F map, attendants' scripts).

## Resume Here

Not started. First step: `tool-maps convert` the 2F ([maps.md](../../../maps.md)).

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
