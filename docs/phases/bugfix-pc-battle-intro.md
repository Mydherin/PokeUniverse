# Bugfix: Bill's PC and wild battle intro (temporary)

Temporary tracker for bugs the user reported on 2026-11-11, fixed before Phase 9. Delete this file (and its pointer in AGENTS.md **Now**) once every item is ✅ and committed.

## Resume Here

Next: **B2 and B4 wait on the user's steps or a full-screen screenshot** (the orchestrator asks the user). Neither reproduces: the steps tried are in Lookups. With the user's case: replay it first, fix, play it, commit, mark ✅. B1 and B3 are ✅. Work one item at a time: fix, play its test in game, commit to `main`, mark ✅ here, then the next. Save progress here before the context guard stops the session.

## Rules

- Match FireRed: check `references/pokefirered/` (`src/battle_interface.c`, `src/pokemon_storage_system*.c`, `src/pokemon_storage_system_*`) before changing behavior.
- Read only the lines a fix needs (`grep -n`, then a range). Write lookups below so nobody reads them twice.
- No regression: replay the PC's other modes (Withdraw, Deposit, Move) and a wild battle start after each fix.
- Commit per item, on `main`, message `Bugfix B<n>: <what>`.

## Items

| # | Bug | Status |
|---|---|---|
| B1 | Wild battle opening: the party's Poké Ball summary bar must NOT show in wild battles (user, 2026-11-11; FireRed `BattleIntroDrawPartySummaryScreens`, `battle_main.c` ~2697: only trainer battles create it). It showed and slid away in every wild battle | ✅ |
| B2 | Bill's PC: with nothing picked up (e.g. MOVE POKéMON), the keys can't move the cursor up to the PARTY POKéMON / CLOSE BOX buttons; it works only while holding a Pokémon. Cursor rules: `storage/cursor.ts` | ⬜ |
| B3 | Bill's PC: opening/closing the party panel (slide animation) shows Pokémon icons fading in/out in another zone of the screen. Should only show the panel sliding (`storage/party-panel.ts`) | ✅ |
| B4 | Bill's PC: after opening the party panel or some Pokémon moves, the CLOSE BOX button draws broken, and the left text box's border breaks (screenshot: CLOSE BOX button fine, border of the box below it broken) | ⬜ |

## Lookups

- **Play it:** stack up (`make ps`); bot token `curl -s -X POST localhost:8080/api/dev/bots -H "X-Bots-Secret: <.env BOTS_SECRET>" -d '{"count":1,"refreshOnly":true}'`, open `localhost:8080/play?bot=<token>` in the browser pane. BOT1 (account 1679) has 6 Pokémon and stands at the 2F PC (save kept with `refreshOnly`). Keys: Z = A, X = B, Enter = START. Browser-pane key taps are too short to walk: dispatch `keydown`/`keyup` on `window` with `code` (`ArrowUp`, `KeyZ`) from `javascript_tool`, ~380 ms per tile. Test grass: 1F (10-12, 5-6), walk Up/Down there; stairs 1F (10,2). 2F PC at (1,1): from the stairs go down to row 7, left to col 1, up (the room trainers at (9,4), (9,6) stay out of the way). The page's top overlay (Home, Online) hides CLOSE BOX: hide fixed elements with JS to see it. After an SPA change: `docker compose up -d --build --no-deps spa-pokeuniverse`, new token, reload.
- **B2 not reproduced** (2026-11-11, BOT1, desktop pane, MOVE POKéMON, nothing held). Steps tried: from box slot 0, Up → title, Up → PARTY POKéMON; Right → CLOSE BOX; from the title, Down into the box, Down x5 → wraps to the buttons; pick up CHARIZARD (A, MOVE), place it two rows down (A, PLACE), then Up x4 → buttons; open the party panel (A on PARTY POKéMON), close it (B), Up x2 → buttons. All of them reached the buttons. Our input rules match `HandleInput_InBox_Normal`.
- **B4 not reproduced either:** CLOSE BOX and the box title frame under it (its right end, before the arrow, sits about 3/4 across CLOSE BOX, as in the user's crop) look the same before and after the party panel opens and closes, with the hand on CLOSE BOX, and after moving PIKACHU from the party into the box (BOT1's box now holds it; dev data). The panel's hide blanks rows 21..2, cols 10-21, of its own BG, like FireRed's `HidePartyMenu`. We need the user's steps, or a screenshot of the whole screen.
- **B3 cause:** icons are created 160 px above their slot; FireRed's `MovePartySprites` hides one while `(y + y2 + centerToCornerY + 16) as u16 > 192`, otherwise the GBA's 8-bit OAM Y wraps it onto the box. Ours never hid them.

## Log

- 2026-11-11 B1 ✅: no party summary in wild battles (`battle/screen.ts`); played: wild CHANSEY intro has no bar, send-out and menu fine. Trainer intro not replayed (its code path is unchanged).
- 2026-11-11 B3 ✅: party icons hidden while above the screen (`MovePartySprites`), `storage/party-panel.ts`.
