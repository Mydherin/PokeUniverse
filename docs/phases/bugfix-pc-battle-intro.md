# Bugfix: Bill's PC and wild battle intro (temporary)

Temporary tracker for bugs the user reported on 2026-11-11, fixed before Phase 9. Delete this file (and its pointer in AGENTS.md **Now**) once every item is ✅ and committed.

## Resume Here

Next: **B4** (B3 ✅; B1 and B2 don't reproduce, waiting on the user's exact case, see Lookups). Work one item at a time: fix, play its test in game, commit to `main`, mark ✅ here, then the next. Save progress here before the context guard stops the session.

## Rules

- Match FireRed: check `references/pokefirered/` (`src/battle_interface.c`, `src/pokemon_storage_system*.c`, `src/pokemon_storage_system_*`) before changing behavior.
- Read only the lines a fix needs (`grep -n`, then a range). Write lookups below so nobody reads them twice.
- No regression: replay the PC's other modes (Withdraw, Deposit, Move) and a wild battle start after each fix.
- Commit per item, on `main`, message `Bugfix B<n>: <what>`.

## Items

| # | Bug | Status |
|---|---|---|
| B1 | Wild battle opening: the party's Poké Balls on the summary bar (`PartySummary`, `battle/healthbox.ts`; FireRed `CreatePartyStatusSummarySprites`) don't appear. Make them appear and slide like FireRed | ⬜ |
| B2 | Bill's PC: with nothing picked up (e.g. MOVE POKéMON), the keys can't move the cursor up to the PARTY POKéMON / CLOSE BOX buttons; it works only while holding a Pokémon. Cursor rules: `storage/cursor.ts` | ⬜ |
| B3 | Bill's PC: opening/closing the party panel (slide animation) shows Pokémon icons fading in/out in another zone of the screen. Should only show the panel sliding (`storage/party-panel.ts`) | ✅ |
| B4 | Bill's PC: after opening the party panel or some Pokémon moves, the CLOSE BOX button draws broken, and the left text box's border breaks (screenshot: CLOSE BOX button fine, border of the box below it broken) | ⬜ |

## Lookups

- **Play it:** stack up (`make ps`); bot token `curl -s -X POST localhost:8080/api/dev/bots -H "X-Bots-Secret: <.env BOTS_SECRET>" -d '{"count":1,"refreshOnly":true}'`, open `localhost:8080/play?bot=<token>` in the browser pane. BOT1 (account 1679) has 6 Pokémon and stands at the 2F PC (save kept with `refreshOnly`). Keys: Z = A, X = B, Enter = START. Browser-pane key taps are too short to walk: dispatch `keydown`/`keyup` on `window` with `code` (`ArrowUp`, `KeyZ`) from `javascript_tool`, ~380 ms per tile. Test grass: 1F (10-12, 5-6), walk Up/Down there; stairs 1F (10,2). 2F PC at (1,1): from the stairs go down to row 7, left to col 1, up (the room trainers at (9,4), (9,6) stay out of the way). The page's top overlay (Home, Online) hides CLOSE BOX: hide fixed elements with JS to see it. After an SPA change: `docker compose up -d --build --no-deps spa-pokeuniverse`, new token, reload.
- **B1, B2 not reproduced** (2026-11-11, BOT1, desktop pane): two wild battles drew the bar, then the six balls sliding in one by one (FireRed's delays); MOVE POKéMON with nothing held reached PARTY POKéMON / CLOSE BOX from the title (Up) and from the bottom row (Down, wrapping), also after placing a Pokémon and after the party panel opened and closed. Our input rules match `HandleInput_InBox_Normal` and the summary code matches `CreatePartyStatusSummarySprites`. Asked the orchestrator for the user's exact case (phone or desktop, party size, which battle, which mode).
- **B3 cause:** icons are created 160 px above their slot; FireRed's `MovePartySprites` hides one while `(y + y2 + centerToCornerY + 16) as u16 > 192`, otherwise the GBA's 8-bit OAM Y wraps it onto the box. Ours never hid them.

## Log

- 2026-11-11 B3 ✅: party icons hidden while above the screen (`MovePartySprites`), `storage/party-panel.ts`.
