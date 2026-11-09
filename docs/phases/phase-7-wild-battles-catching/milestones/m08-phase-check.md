# M8 Phase Check 🚧

Part of [Phase 7](../phase-7-wild-battles-catching.md). **Needs:** M1-M7. Rules: [context.md](context.md#playing-a-milestone).

**Done when:** the whole phase is played once from a fresh session, every restart case resumes, the follower behaves in grass and wild battles, the regression check passes, and the phase's Done When is ticked.

## Resume Here

**In progress (session 1).** Run 1-2 ✅ (grass battle: transition, intro, music; RUN escapes; vs faster Surskit "Can't escape!" twice; Smoke Ball: smoke puffs then "…fled using its SMOKE BALL!"). Run 3 partly: ball broke free (0 shakes), Thief stole the wild Magnemite's item ✓ (Run 6's Thief), 2nd ball caught it (3 shakes, click, caught intro, "Gotcha!"), nickname question ✓ (no dex page: account 2 has every species caught; M7 played the dex page). Restarts ✓ after a failed RUN and after a ball broke free (same battle resumes). Slowpoke and Meowth fainted in that battle (party order after: Meowth, Slowpoke, Staryu, Oddish, Charizard, Magnemite).

**Open bug (found here), next step = fix it:** restart mic-battles then mic-core at the nickname question: the client's battle screen is gone after the reconnect (back on the field) and the question isn't asked again, although mic-core re-sends it: `mic-core/internal/world/world.go:156` → `askNaming` (`naming.go:22`) queues `BattleEnded{CAUGHT, caught{nicknamePending}}` at join. Client: `spa-pokeuniverse/src/game/firered/overworld.ts:467` `battleEnded()` with no `battleScreen` only calls `afterBattle` and drops `b.caught`. The question/naming flow lives in `game/firered/battle/screen.ts:499-531` (message `sText_GiveNicknameCaptured`, `yesNo`, `startNamingScreen(flow,"caughtMon",…)`, `host.nameCaught(name)`; PC text via `Text_MonSentToBox…`). Fix: when `battleEnded` arrives with no battle screen and `b.caught?.nicknamePending`, ask the same question on the field (message box + Yes/No, then the naming screen; NO → `nameCaught("")` and the PC message when `where` is BOX); write the difference (FireRed has no reconnect) in this file. State now: DB has `naming_box/slot` 0/5 pending (Magnemite, party slot 5); after the fix, reload the pane and the question should come on join. Then: Run 3's rest (POKéMON shows ball and name), Run 4-8, restarts mid-turn and at the PC message, crash, reload, follower.

**Test data changed (restore at the end):** backup `m8-db-backup-before.sql` in the shared notes (trainers, trainer_boxes, trainer_items, trainer_pokemon). Temporary test party: 0 Slowpoke Lv3 (Tackle), 1 Meowth Lv10 (Pickup, Thief/Scratch), 2 Staryu Lv10 (Illuminate), 3 Oddish Lv10 (Sweet Scent), 4 Charizard (Smoke Ball 194); the old party slots 1-5 moved to box 6 slots 0-4; added items pocket 3 Poké Ball ×30, pocket 1 slots 14-16 Repel ×5, Black Flute, Cleanse Tag. Position set to 1F 12,5. Pane login: refresh token row for account 2 inserted with `sha256(convert_to('<hex>','UTF8'))`; set the cookie on /login, then navigate /play (don't POST /auth/refresh yourself: the page's own refresh makes it a reuse and revokes the chain). Restore = delete account 2's trainer_pokemon and trainer_items rows, re-COPY account 2's lines from the backup, reset trainers row (position 2F 9,5 north, money 2560, pokedex_caught), `redis-cli del player:2:pos`, revoke tokens.

**Harness:** `localStorage.h` in the pane holds the hidden-pane harness (eval it after a reload; `__walk()` stops on battle music, `__clip(ms,every)`, `__sheet`, `__show`). Title: Enter, then Z (Z on CONTINUE sometimes goes back to the title once; press Enter, Z again). Arrows pressed while a message prints are lost: check the menu cursor before Z.

## The Run

1. Walk into the test grass with the follower: both rustle; a wild battle starts with the right transition, intro and music.
2. RUN once (escape), once against a faster foe until it fails, once holding a Smoke Ball: its escape animation before the message (O4, hooked in M6, not played there).
3. Weaken a foe, throw a POKé BALL until it catches; Pokédex page (new species), name it, see it in POKéMON with its ball and name.
4. Fill the party, catch another: sent to the PC; find it in BILL'S PC.
5. Repel: no low-level battles, then the wore-off message. Black Flute, Cleanse Tag, an Illuminate lead: rate changes (rough counts).
6. Sweet Scent in the grass. Pickup over a few battles. Thief on a held item.
7. Lose on purpose: wild whiteout texts and money.
8. The room trainer: RUN refused, ball blocked, battle still wins with exp.

## Restarts

- `docker compose restart mic-battles` and then `mic-core`: mid-turn, after a failed RUN, after a ball broke free, at the nickname question (asked again), at the PC message.
- A real crash (`docker compose kill mic-core`) during a wild battle (Phase 5 M14 left it unplayed for trainers).
- A reload during a wild battle drops it (Phase 5 D22), with balls used back in the bag.

## Follower

- In grass, through the transition and back after the battle; after a catch that changes the party (lead unchanged); after the lead faints in a wild battle (Phase 6 M9's rules).

## Closing

- [ ] Every milestone file cut to what later phases use; this phase's Resume Here and the Phases table in [README.md](../../README.md); AGENTS.md's **Now** → Phase 8.
- [ ] Follow-ups for later phases listed here (Safari Ball, roamers, rods and Surf hooks, `FLAG_SYS_NOT_SOMEONES_PC`, the test grass removed in Phase 10).
