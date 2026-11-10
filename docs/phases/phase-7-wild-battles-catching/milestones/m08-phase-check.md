# M8 Phase Check ✅

Part of [Phase 7](../phase-7-wild-battles-catching.md). **Needs:** M1-M7. Rules: [context.md](context.md#playing-a-milestone).

**Done when:** the whole phase is played once from a fresh session, every restart case resumes, the follower behaves in grass and wild battles, the regression check passes, and the phase's Done When is ticked.

## Resume Here

**Done (2026-11-10, 6 sessions).** Every play check ✅; test data restored (account 2 from `m8-db-backup-before.sql`; the tests' `battle_outcomes` rows left as history). Nothing to resume.

## What Was Played ✅

- **Runs 1-8:** grass and transition, RUN (escape, failed, Smoke Ball animation, O4), catch with Pokédex page and name, full party → PC, Repel, Black Flute, Cleanse Tag, Illuminate, Sweet Scent, Pickup, Thief, wild whiteout ("panicked and lost ₽800", Lv100 × 4 × 2; home 1F, healed), room trainer (RUN refused, ball blocked, win with exp, ₽1800 prize).
- **Restarts:** `mic-battles` and `mic-core` after a failed RUN, a ball broke free, mid-turn, at the nickname question (party and full party), at the PC message; `docker compose kill mic-core`; a reload mid-battle drops it with balls back.
- **Follower:** in grass, through the transition and back, after a catch that filled the party, first healthy member after the lead faints; hidden after load until the first step = HGSS (`follow_mon.c:1913`).

## Decisions and Differences

- **Nickname question after a restart (MMO):** FireRed has no reconnect. The join's `BattleEnded{caught{nicknamePending}}` arriving while the map loads is kept in `pendingNaming` (`spa-pokeuniverse/src/game/firered/overworld.ts`); with no battle screen, `askCaughtName` asks in the field's message box (`sText_GiveNicknameCaptured` + `fieldYesNo`; NO → PC text when BOX; YES → naming screen).
- **Trainer win text:** "Player defeated COOLTRAINER ROLANDO!" is FireRed's literal "Player"; Lv100 gets no exp (Gen 4).

## Follow-ups (Later Phases)

| Item | Goes to | Index |
|---|---|---|
| Safari Ball and the Safari Zone, roamers, real tables, rods and Surf hooked on water maps, `FLAG_SYS_NOT_SOMEONES_PC` | 12 | O10 |
| Remove the test grass with the rest of the test content | 10 | O9 |
| SUMMARY shows "Met in Somewhere" in the house (its maps have no map section name); look at the naming screen's Pokémon icon fix (built in M8, never seen) | 10 | O12 |
