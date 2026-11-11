# Bugfix: Bill's PC and wild battle intro (temporary)

Temporary tracker for bugs the user reported on 2026-11-11, fixed before Phase 9. Delete this file (and its pointer in AGENTS.md **Now**) once every item is ✅ and committed.

## Resume Here

Next: **B1**. Work one item at a time: fix, play its test in game, commit to `main`, mark ✅ here, then the next. Save progress here before the context guard stops the session.

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
| B3 | Bill's PC: opening/closing the party panel (slide animation) shows Pokémon icons fading in/out in another zone of the screen. Should only show the panel sliding (`storage/party-panel.ts`) | ⬜ |
| B4 | Bill's PC: after opening the party panel or some Pokémon moves, the CLOSE BOX button draws broken, and the left text box's border breaks (screenshot: CLOSE BOX button fine, border of the box below it broken) | ⬜ |

## Lookups

- (none yet)

## Log

- (none yet)
