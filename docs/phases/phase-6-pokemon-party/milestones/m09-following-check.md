# M9 Following Pokémon: Edge Cases and Phase Check 🚧

Part of [Phase 6](../phase-6-pokemon-party.md). **Needs:** M7, M8, and every other milestone for the check. Rules: [context.md](context.md), D8, D9.

**Done when:** the follower is right through every way the lead can change or the player can move, and the whole phase has been played once in one session.

**Main reference: HeartGold**, as in [M8](m08-following-walk.md): every edge case (warps, lead changes, fainting, battles, reloads) behaves as `references/pokeheartgold/` does; M8's What's Known lists what's already been read there.

## Resume Here

State (2026-11-08, after session 5): step 7 almost done, **no bugs found, no code changed**. Stack up and current. **Account 2 holds phase-check data** (restore it, step 7c).

**Played and passed (session 5, one sitting, account 2):** SWITCH (Garchomp to lead, follower changes), item PC WITHDRAW (Potion) and DEPOSIT (Antidote), BILL'S PC WITHDRAW (Staryu, box 3), Potion from the bag (FireRed's special anim scene), GIVE Exp. Share, Rare Candy (Charizard 51), Water Stone (Staryu → Starmie), TM13 with forget-a-move, Blue Flute USE (party prompt, FireRed-correct), TOSS, Light Ball USE ("This isn't the time"), TAKE, SUMMARY move swap; double battle won (Garchomp, Lucario Lv99): Exp. Share messages for Starmie (Lv51), Potion in battle spent, `docker compose restart mic-core` mid-battle resumed it; DEPOSIT Snorlax; stairs down (follower hidden on arrival, out on first step); SAVE; reload: same tile, party, bag and PC items (checked in the DB), follower out on first step.

- Follower hidden after that battle: caused by the mid-battle `mic-core` restart (re-join = map entry, `placeFollower`), not by the win. Not a bug.
- Box 3's test Pokémon all carry Garchomp's moves and hp 171 (test data from the backup), not a code bug.

**Next (exact):**

a. **Last regression item:** on 2F start the trainer battle (PC (1,1); trainer (9,4): walk Down to row 5, Right to col 10, Left once to face it, A, A), get hurt, use a Potion from the BAG, then reload the page: the battle is dropped and the Potion is back (×4 before the battle). Then leave `/play`.
b. If it passes, step 7 passes. Restore account 2 ([Test data](#test-data-account-2)).
c. Close M9 and Phase 6: this file ✅ and cut to what later phases need, phase table and Resume Here, phases README, `AGENTS.md` **Now** to Phase 7's first file. Commit (don't push).

Setup used (gone after the restore): items `(2,1,14,68,2),(2,1,15,97,1),(2,1,16,182,1)` + the context's test TMs; Lucario and Garchomp at Lv99. Key helper: see Playing tips; a zoom region `[134,200,670,562]` at scale 0.5 covers the game canvas.

## Tasks

- [x] **Battle hang:** played: one test battle with 5 faints in a row (Raichu, Charizard, Snorlax, Charmeleon, Lucario), each cry and text moved on, whiteout fine. Destiny Bond's message not seen (the AI won't set it up); accepted.
- [x] **Lead changes:** SWITCH, evolutions, whiteout, lead at 0 HP (next able one follows), Revive of the fainted lead (it follows again on menu close), box DEPOSIT of the lead and MOVE back into slot 1 (follower changes at once). A *won* battle after the lead faints isn't playable (the test trainers' Lv50 teams can't be beaten by mashing); it ends in the same `finish` → `sendParty` → `syncFollower` path as the fainted-lead case, which passed.
- [x] **Movement:** reload, swap by stepping onto the follower, stairs down and up (hidden on arrival, out on the first step).
- [x] **Scripts:** only what exists: both maps have static NPCs only, no sight trainers or walking NPCs yet (re-check the follower when they arrive, Phase 7+). NPCs block, the follower never overlaps them, talking with the follower beside works.
- [x] **Empty cases:** all fainted: no follower, no error (**fixed**, below); Revive from there: the revived one appears hidden, out on the first step. Empty party: can't happen in play (last-Pokémon guards); on join the test team fills it (**fixed** a join loop, below).
- [x] **Big sheets:** Snorlax (64×64) walks all four ways; Farfetch'd (083, asymmetric) faces right both ways.
- [ ] **Phase check:** step 7: all played and passed except the battle-reload regression item (Resume Here a).

## Play It

- Each item above, with a reload after it.
- SWITCH the lead, leave the menu: the new one follows. Lead faints in battle: the next one that can fight follows on return.
- Walk down the stairs and back; SAVE, reload: same follower, right place.
- A full session: use a Potion and a TM, level with a Rare Candy, evolve with a stone, Exp. Share in a battle, deposit, withdraw, follow.

## What's Known

- **Fixed, played:** whiteout left the follower on its old tile. `world/battle.go` `finish` calls `p.placeFollower()` before `z.correct` (HGSS `FollowMon_RecreateForMap`): player on `Start` (6,6), follower out on the first step.
- **Decision (HGSS):** the follower is **not** hidden during the battle transition (`battle/battle_setup.c:218` only records `followMonSlot`; the field keeps drawing it under the wipe). The evolution scene is its own screen.
- **Fixed (session 4), all fainted showed slot 1:** `pokemon/party.go` `Lead()` now returns nil when nobody can fight (HGSS `FollowMon_IsActive` is FALSE with no alive Pokémon; `FollowMon_InitMapObject`'s fallback to the first non-egg only builds the hidden object). Played.
- **Fixed (session 4), join loop:** an empty party with Pokémon in boxes made every join fail (`GiveTestTeam` re-inserted the test boxes: duplicate key). `pokemon/testteam.go` now skips the test boxes when any box holds Pokémon (`CountBoxPokemon`). Test content, goes with it in Phase 7.
- Box cursor: from the box title, Up goes to PARTY POKéMON (drawn right over the title) and a second Up wraps to the bottom row: FireRed's behavior, not a bug.
- Stair warps start when the direction is pressed while standing on the tile (2F's is at (10,2), walk left from (11,2) and keep holding).
- **Follow-up (not M9, Phase 7+):** whiteout uses `Start`'s tile but stays in the battle's zone (`Start.Map` ignored). Fine while battles happen only on 2F; needs a warp to the respawn map later.

### Battle hang

- Seen once (session 1): test trainer, Charizard's Flamethrower on a red-HP Gengar; the screen stayed on "CHARIZARD used FLAMETHROWER!" over a minute, no errors; a reload dropped the battle. Not reproduced in play since.
- **Engine ruled out (session 3):** `mic-battles`' real `Battles` class (in-memory store) driven through a Destiny Bond double faint, with and without benches, SHIFT and SET: batch `moveUsed, volatileStart, moveUsed, damage, faint, activate, faint`, then a SWITCH request or the outcome. All right. Script setup if needed again: Node 24 `--experimental-transform-types` plus a resolve hook adding `.ts` (the repo's esbuild is a Linux binary), in the scratchpad, never committed.
- **Likely cause, fixed:** `battle/playback.ts` `faint` waits `while (sound.isPlaying("cry"))` with no limit, and `isPlaying` only turns false on `onended`, which never fires while the AudioContext isn't running (unlock refused, iOS "interrupted", hidden pane). `gba/sound.ts` `isPlaying` and `fanfarePlaying` now treat a non-running context as silent. Not proven to be session 1's cause; no other endless wait was found on that path.
- **Added:** FireRed's `sText_PkmnTookFoe` for Destiny Bond's `-activate` (`battle/messages.ts`: def = the bond's user, atk = `source ?? recent.mover`; `texts.json`, `make text` run).
- The AI won't cooperate to force a double faint in play (it switched Destiny-Bond Gengar out). Side note, not chased: when both last Pokémon faint, Showdown's Gen 4 rule gives side 0 the win.

### Playing tips

- Keys: Z = A, X = B, Enter = START (`gba/input.ts`). Quick taps don't step: hold with dispatched events (`window.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowDown', code:'ArrowDown'}))`, keyup after ~250 ms). In the test battle, after a foe faints the SHIFT prompt opens the party on A: answer with X.
- **Test trainers heal both teams first** (`battle.Trainers[...].Heals`, `world/battle.go` `startBattle`): low-HP SQL setups don't work. To lose fast, move party slots 1-5 to box 14 (empty) and keep Lv20 Raichu alone.
- **SQL gotcha:** `mic-core` keeps the player in memory for a while after leaving `/play`, so SQL edits are overwritten unless it's restarted first: leave `/play`, `docker compose restart mic-core`, edit, rejoin (not mid-battle: a restart resumes the battle). SQL: `docker compose exec -T postgres psql -U pokeuniverse`.

### Test data (account 2)

- Restored after session 4 (the phase check will change it again).
- Backup from before M9: `/Users/mydherin/Library/Application Support/Claude/side-session-notes/local_64ebf443-5bed-4ec1-ab1d-7b1af71e2aef/m9-backup/m9-<table>.tsv`. Every table that references `trainers` is in it and cascades, so restore = leave `/play`, `docker compose restart mic-core`, `docker compose cp` each file to `postgres:/tmp/`, then in one `psql -v ON_ERROR_STOP=1` transaction: `delete from trainers where account_id=2;` and `\copy <table> from '/tmp/m9-<table>.tsv'` for trainers, trainer_pokemon, trainer_items, trainer_pc_items, trainer_boxes, battle_outcomes (in that order). Done this way in session 4.

### Earlier notes

- `sendParty` in `world/party.go` is the common point after party changes. M8's file has the client and server map.
- Phase 8 reuses this for other players: keep the follower's data in `Avatar`, nothing about it local to the player's own client (D8).

## Files

`mic-core/internal/world/` (`party.go`, `warp.go`, `battle.go`, `follower.go`), `mic-core/internal/pokemon/` (`party.go`, `testteam.go`), `spa-pokeuniverse/src/game/firered/overworld.ts`, `firered/follower-sprite.ts`, `firered/stair-warp.ts`, `firered/battle/playback.ts`, `firered/battle/messages.ts`, `gba/sound.ts`.
