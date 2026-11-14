# M7: Pokémon Center 2F

Part of [Phase 9](../phase-9-social.md). Decisions: [context.md](context.md#pokémon-center-2f) D15, D17. References: [context.md](context.md#firered-and-heartgold-references) (2F map, attendants' scripts).

## Resume Here

**✅ Done 2026-11-14:** all 8 cases played in the built-in browser pane (four sessions). What later milestones use is below.

**What's there (for M8 on):**
- **Maps:** `lib-maps/maps/{pokemon_center_2f,trade_center,battle_colosseum_2p}.yaml` (converted 1:1 by `tool-maps convert`, `includedLinkRooms` in `tool-maps/internal/convert/convert.go`). The link rooms' objects (attendant, seats) aren't wired yet (M8). Union Room warp (5,1) left out; Trade Center warp (9,1) behind the counter, unreachable. Attendants at x 2, 6, 10 (row 2), talked to from row 4 across the counter.
- **Door (D15):** house 2F (7,1) `warp_door` override + warp to `pokemon_center_2f`; the 2F's stairs/escalator warp back. The house's tilesets have no door metatile, so the client draws FireRed's **Cable Club door** as an overlay (`door_anims/cable_club.png` + the `pokemon_center` palette 08 copied by `make graphics`; `door-warp.ts`). Server: `mic-core/internal/world/warp.go` `warpCell` (stairs, door north, escalator under the player) and `arrivalFacing`.
- **Attendants:** `mic-core/internal/world/cable_club.go` builds the three scripts per player from the party (`partyScripts`). Direct Corner: TRADE (two-Pokémon check) / COLOSSEUM (SINGLE, DOUBLE with `party.Able() < 2`, MULTI, INFO, EXIT) → `askSave` → `ChooseLeader` → **JOIN GROUP / BECOME LEADER / EXIT all end with `CableClub_Text_PleaseVisitAgain`: M8 replaces this with the link.** `interact.go` looks one tile past a `counter`.
- **Script steps:** `world.proto` `ScriptStep` has `multichoice` (`Multichoice{menu, to}`), `jump`, `ask_save` (NO target), `end`; client `script-multichoice.ts` (FireRed's lists and positions), `overworld.ts` runs them; the save exchange reuses `save-dialog.ts` (our joke replaces "saved the game", closes after `se_save` + 60 frames like FireRed).
- **Art/sound:** `cable_club_receptionist`, `union_room_receptionist`, `npc_white.pal` (Makefile, `manifest.ts`, `npc-sprite.ts`); `mus_poke_center`, `se_sliding_door`, `se_escalator`.

**Pane how-to (saves rediscovering):** token: POST `/api/dev/bots` `{count:1, first:901, refreshOnly:true}` with `X-Bots-Secret` (notes `m4-headless/m4lib.mjs` `tokens()`); `navigate` `http://localhost:8080/play?bot=<accessToken>`, click the game, `z` until CONTINUE. Walking needs a held key: inject `hold(code, ms)` (keydown on `window`, wait, keyup), one step ≈ `n*267-60` ms. The pane's `key` only taps (turns); use it for A after a turn and for menus one Down at a time. Text prints slowly: one A per page, 4 s waits. Bot 901 = account 1841 (party: 6 in box 0). `infra/bots/bots.ts --first` takes 1-500 only (`--count 3 --first 402 --map pokemon_center_2f --stay` was used).

**Commands:** `make tool-maps CMD="convert ..."`, `make tool-maps CMD=validate`, `make maps`; Go build: `docker run --rm -v "$PWD":/repo -v pokeuniverse-go-mod:/go/pkg/mod -v pokeuniverse-go-build:/root/.cache/go-build -w /repo/mic-core golang:1.27-alpine go build ./...`.

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Door | Walk into the room's door | Door animation, 2F; stairs bring you back | ✅ 2026-11-14: bot 901 in the pane walked north into the room's door (slides open, walks in, fade), arrived on the 2F's escalator side; stepping onto the escalator rode back and walked out of the door south |
| 2 | Map | Walk the 2F | Collisions, counters, music as FireRed (compare the emulator once) | ✅ 2026-11-14: walked the 2F with held arrow keys: counters stop you a row below the attendants, seats and walls block, the aisle between the seats is open; `mus_poke_center` starts on arrival. Compared with the decomp's map (converted 1:1), not an emulator. Fixed: the attendants weren't drawn (no `cable_club_receptionist` art): added it and `union_room_receptionist` with `npc_white.pal` (Makefile, `manifest.ts`, `npc-sprite.ts`) |
| 3 | Wireless Club | Talk, YES then NO | FireRed's texts | ✅ 2026-11-14: A across the counter: `AskAboutLinking` (Teala) + YES/NO; YES pages through `ExplainWirelessClub` to the end, NO says `HopeYouEnjoyWirelessSystem`. Fixed: A on a counter didn't reach the NPC behind it: `Interaction` now looks past a `counter` tile (FireRed's GetInteractedObjectEventScript; `mic-core/internal/world/interact.go`) |
| 4 | Union Room | YES; NO; INFO | Joke; FireRed's goodbye; FireRed's info | ✅ 2026-11-14: `WelcomeUnionRoomEnter` + YES/NO/INFO at FireRed's spot; INFO pages `UnionRoomInfo` and returns to the menu; YES shows our joke (fits the box, two pages); NO says `PleaseVisitAgain` |
| 5 | Direct Corner | TRADE, COLOSSEUM menus, INFO | FireRed's menus and texts | ✅ 2026-11-14: `WelcomeWhichDirectCornerRoom` then TRADE CENTER/COLOSSEUM/EXIT at the top-left; COLOSSEUM → `PlayWhichBattleMode` + SINGLE/DOUBLE/MULTI/INFO/EXIT; INFO pages `ExplainBattleModes` and returns to the battle menu |
| 6 | Checks | One Pokémon → TRADE; one usable → DOUBLE | FireRed's refusals | ✅ 2026-11-14: bot 901 in the pane with one Pokémon (others parked in a box): TRADE CENTER → YES says `NeedTwoMonsToTrade` then `PleaseVisitAgain`; COLOSSEUM → DOUBLE says `NeedTwoMonsForDoubleBattle` and returns to the battle menu; same refusal with two Pokémon, one fainted (hp 0); party restored |
| 7 | Save exchange | Choose TRADE | SAVE-like dialog, nothing saved | ✅ 2026-11-14: full party, TRADE CENTER → YES → `VIRIDIAN CITY` save window + YES/NO, "already a saved file" YES/NO, our joke (closes after the save sound and 60 frames, as SAVE), `ChooseLeader` text, JOIN GROUP/BECOME LEADER/EXIT; JOIN GROUP → `PleaseVisitAgain` (M8 makes it link) |
| 8 | Many players | Bots on the 2F | Drawn, no blocking (Phase 8 D6) | ✅ 2026-11-14: 3 bots (`bots.ts --first 402 --stay`) walked the 2F, drawn with their followers; bot 901 walked 5 tiles west along their row straight past bots and followers without stopping; bots stopped after |
