# M8 Phase Check 🚧

Part of [Phase 7](../phase-7-wild-battles-catching.md). **Needs:** M1-M7. Rules: [context.md](context.md#playing-a-milestone).

**Done when:** the whole phase is played once from a fresh session, every restart case resumes, the follower behaves in grass and wild battles, the regression check passes, and the phase's Done When is ticked.

## Resume Here

**In progress (3 sessions).** Done ✅: Run 1-4; restarts after a failed RUN, after a ball broke free, mid-turn, at the nickname question (party and full party), at the PC message; real crash (`kill mic-core`) mid wild battle; reload mid-battle (ball thrown, game left → bag back to 27). Repel (Run 5 part): REPEL used, a Lv20 Skarmory still came (lead Staryu Lv10: correct, only lower foes are blocked); the 100-step wore-off message not seen yet.

**Next, in order:** (1) Run 5's rest: walk ~100 steps in the grass for "REPEL's effect wore off…" (no foe ≤ Lv10 meanwhile), then Black Flute, Cleanse Tag, Illuminate lead (Staryu): rough battle counts. (2) Run 6: Sweet Scent (Oddish) in the grass; Pickup (Meowth) over a few battles (Thief ✅ in session 1). (3) Run 7: lose on purpose: whiteout texts and money (heal first, or set HPs low in the DB with the game closed; Charizard Lv50 makes losing slow). (4) Run 8: room trainer at (9,4): RUN refused, ball blocked, win with exp. (5) Follower: in grass, through the transition and back; after a catch (lead unchanged); after the lead faints (Phase 6 M9's rules). (6) Restore test data, then Closing below.

**Fix made (session 2), played ✅:** nickname question lost after a restart, `spa-pokeuniverse/src/game/firered/overworld.ts` (uncommitted): the join's `BattleEnded{caught{nicknamePending}}` arriving while the map loads is kept in `pendingNaming` (`startOverworld`) for the new `Overworld`; `battleEnded()` with no battle screen runs `askCaughtName` (field `caughtAsk`, run in `frame()`, locks the player): loads the party set + species art, field message `sText_GiveNicknameCaptured` + `fieldYesNo`; NO → `nameCaught("")` + PC text when BOX; YES → fade, naming screen, back via `enter(false)`. **Difference (MMO):** FireRed has no reconnect; after a restart the question is asked in the field's message box. Naming-screen icon fix (art load) is built but not yet looked at. SPA typecheck passes; image built (`index-DsM60n4W.js`).

**State now:** game closed (pane on `/`). Party: 0 Slowpoke FNT, 1 Meowth FNT, 2 Staryu FNT, 3 Oddish 25/30, 4 Charizard, 5 Magnemite "AA"; box index 1 slot 0 Rattata. Repel active (~30 steps used), Repel ×4. Player in the test grass (10-12, 5-6).

**Seen in passing (not Phase 7):** SUMMARY says "Met in Somewhere" (the house has no map section name).

**Pane (hidden) recipe:** the pane window is 0×0 → `resize_window` 960×720. The page's CSP blocks `eval(localStorage.h)`: paste the harness text itself (read it with `localStorage.h`; write `window.__q=[]` instead of `let __q`), add `window.__s=async()=>{__cap();await __sleep(60);return __show()}`, then click `a[href="/play"]` from `/` (one app instance; the click needs the patched ResizeObserver). Wait ~50 s, Enter, then Z on CONTINUE. Screenshot after `__s()` at `scale: 0.3`; a black capture is often just a frame between draws: capture again. Login if needed: insert a refresh token (`openssl rand -hex 32`, `sha256(convert_to('<hex>','UTF8'))`), `document.cookie="pu_session=<hex>; path=/auth"`, then load the app once (a second `import()` of the bundle refreshes again → reuse → chain revoked). Rebuilding `spa-pokeuniverse` breaks an open page (lazy chunks gone): reload after. Closing the BAG from the field returns to the START menu (press X once more before walking). The battle BAG remembers its pocket and cursor.

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
