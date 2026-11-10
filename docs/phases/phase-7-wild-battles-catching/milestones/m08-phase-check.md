# M8 Phase Check 🚧

Part of [Phase 7](../phase-7-wild-battles-catching.md). **Needs:** M1-M7. Rules: [context.md](context.md#playing-a-milestone).

**Done when:** the whole phase is played once from a fresh session, every restart case resumes, the follower behaves in grass and wild battles, the regression check passes, and the phase's Done When is ticked.

## Resume Here

**In progress (4 sessions).** Done ✅: Run 1-5; restarts after a failed RUN, after a ball broke free, mid-turn, at the nickname question (party and full party), at the PC message; real crash (`kill mic-core`) mid wild battle; reload mid-battle (ball thrown, game left → bag back to 27). Run 5 (session 4): REPEL wore-off message ✅; rough counts per 60 steps: none 4, BLACK FLUTE 3 (texts ✅), flute + CLEANSE TAG 2, flute + Illuminate lead 5. Run 6 part: SWEET SCENT ✅ (SUMMARY above it in the party menu is FireRed's order; red flash, wild battle; the foe's dark slide-in tint is FireRed's). Run 8 part: RUN refused ("No! There's no running…") ✅, ball blocked ("The TRAINER blocked…") ✅. Also seen ✅: Smoke Ball escapes under BLOCK (Gen 4) with its animation; "There's no PP left for this move!"; the follower becomes the first healthy member after the lead faints.

**Next, in order:** (1) Run 8's win: Charizard is now Lv100 in the DB (test only); talk to COOLTRAINER ROLANDO from (10,4) facing left (player stands there now), YES, SWITCH Staryu → Charizard (slot 2), win the 6 Lv50 with Air Slash/Dragon Pulse (Flamethrower 15 PP); check exp messages. The test trainer heals the party first. (2) Pickup: 21 won wild battles, no find yet (10% each, `mic-battles/src/engine/wild.ts` `pickUp` → `mic-core/internal/battle/outcome.go:49` read and look right); Meowth (slot 1) holds nothing now (METAL COAT taken to the bag). Faster: farm wins with Charizard Lv100 in the 1F grass, check `select held_item from trainer_pokemon where account_id=2 and box=0 and slot=1`. (3) Run 7: wild whiteout: game closed, set every party HP to 0 except Slowpoke (slot 4, or the lead) at 1, walk the grass, lose: whiteout texts and money (2560 now; `battle.WhiteOutLoss`). (4) Follower: in grass, through the transition and back; after a catch (lead unchanged). **To check:** right after loading the game no follower shows next to the player (seen twice); see whether it appears after a step (HGSS behavior) or is a bug. (5) Restore test data, then Closing below.

**Auto loops (pane):** `__hunt(n)` walks n steps and flees each battle, `__farm(n)` wins n battles (`__win`: move menu Up+Right = slot 2); stop them with `__res.stop=true` (`__hunt`: `__res.steps=9999`), else they keep pressing keys. They drift the player out of the grass: check the screen every few battles. Grass on 1F is right of Mom's table; from the 2F stairs: down the stairs, then about Left 2, Down 2. Stairs on 1F are entered walking Up-Right of the grass (one wrong path goes upstairs). `__s()` must retry until the capture is > 25 KB (black frames are ~22 KB).

**Fix made (session 2), played ✅:** nickname question lost after a restart, `spa-pokeuniverse/src/game/firered/overworld.ts` (uncommitted): the join's `BattleEnded{caught{nicknamePending}}` arriving while the map loads is kept in `pendingNaming` (`startOverworld`) for the new `Overworld`; `battleEnded()` with no battle screen runs `askCaughtName` (field `caughtAsk`, run in `frame()`, locks the player): loads the party set + species art, field message `sText_GiveNicknameCaptured` + `fieldYesNo`; NO → `nameCaught("")` + PC text when BOX; YES → fade, naming screen, back via `enter(false)`. **Difference (MMO):** FireRed has no reconnect; after a restart the question is asked in the field's message box. Naming-screen icon fix (art load) is built but not yet looked at. SPA typecheck passes; image built (`index-DsM60n4W.js`).

**State now:** game closed (pane on `/`), session 4 ended in the trainer battle (dropped by leaving). Party (healed by the trainer): 0 Staryu, 1 Meowth (no item), 2 Charizard **Lv100** (exp 1059860, Cleanse Tag held; Smoke Ball in the bag), 3 Oddish, 4 Slowpoke, 5 Magnemite "AA". Bag: Metal Coat, Smoke Ball back, Black Flute ×0. Player on 2F at (10,4), right of the test trainer. Money 2560.

**Seen in passing (not Phase 7):** SUMMARY says "Met in Somewhere" (the house has no map section name).

**Pane (hidden) recipe:** the pane window is 0×0 → `resize_window` 960×720. The page's CSP blocks `eval(localStorage.h)`: paste the harness text itself (read it with `localStorage.h`; write `window.__q=[]` instead of `let __q`), add `window.__s=async()=>{__cap();await __sleep(60);return __show()}`, then click `a[href="/play"]` from `/` (one app instance; the click needs the patched ResizeObserver). Wait ~50 s, Enter, then Z on CONTINUE. Screenshot after `__s()` at `scale: 0.3`; a black capture is often just a frame between draws: capture again. Login if needed: insert a refresh token (`openssl rand -hex 32`, `sha256(convert_to('<hex>','UTF8'))`), `document.cookie="pu_session=<hex>; path=/auth"`, then load the app once (a second `import()` of the bundle refreshes again → reuse → chain revoked). Rebuilding `spa-pokeuniverse` breaks an open page (lazy chunks gone): reload after. Closing the BAG from the field returns to the START menu (press X once more before walking). The battle BAG remembers its pocket and cursor.

**Test data changed (restore at the end):** backup `m8-db-backup-before.sql` in the shared notes (trainers, trainer_boxes, trainer_items, trainer_pokemon). Temporary test party (order since changed, see State now): Slowpoke Lv3 (Tackle), Meowth Lv10 (Pickup, Thief/Scratch), Staryu Lv10 (Illuminate), Oddish Lv10 (Sweet Scent), Charizard (Smoke Ball 194, later Lv100); the old party slots 1-5 moved to box 6 slots 0-4; added items pocket 3 Poké Ball ×30, pocket 1 slots 14-16 Repel ×5, Black Flute, Cleanse Tag. Position set to 1F 12,5. Pane login: refresh token row for account 2 inserted with `sha256(convert_to('<hex>','UTF8'))`; set the cookie on /login, then navigate /play (don't POST /auth/refresh yourself: the page's own refresh makes it a reuse and revokes the chain). Restore = delete account 2's trainer_pokemon and trainer_items rows, re-COPY account 2's lines from the backup, reset trainers row (position 2F 9,5 north, money 2560, pokedex_caught), `redis-cli del player:2:pos`, revoke tokens.

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
