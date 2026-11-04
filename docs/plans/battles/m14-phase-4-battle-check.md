# M14 Phase 4 Battle Check 🚧

Part of the [battles plan](README.md). **Needs:** M4-M13. This file is enough to resume; [context.md](context.md) only for a section a step needs.

Manual, **only when the user asks** ([AGENTS.md](../../../AGENTS.md#testing)). Fix what breaks, tick here. A task that needs a reference or code: read only that. Cheap sweeps in our game, no move-by-move ROM comparison.

## Resume Here

**Next step:** **Learning left**, **Pokédex seen**, **Singles loss**, **Restart mid-battle**, **Mobile**, each in its own battle, with "How to run it". When all are ticked, do **Clean Up**, mark M14 ✅.

## Tasks

Left, cheapest route first:

- [ ] **Learning left:** `scenario.sh learn`, reload, battle, two SURFs; at the prompt answer No to "Delete a move?", then give up on it.
- [ ] **Pokédex seen:** an evolved species gets marked. Seen: CHARMELEON in the list, but AA had all 151 seen, so it proves nothing. Clear Charmeleon's bit in `trainers.pokedex_seen` first (bytea, grep `mic-core` for its bit order), evolve into it (`learn` evolves at Lv. 16), recheck the bit.
- [ ] **Singles loss:** `scenario.sh loss`, reload, battle, take one SURF: whiteout from singles, then money and party.
- [ ] **Restart mid-battle:** in a battle, `docker compose restart mic-core`, then `mic-battles`: M6's restart-resume check, never run.
- [ ] **Mobile:** battle in the pane's mobile preset (`resize_window`, reload), touch controls show and work; frame rate on a real phone is the user's, ask them.

Done:

- [x] **Singles win:** defeat text, ₽180, back in the room, saved (exp, moves, money).
- [x] **Items:** refused with no effect (Antidote on a healthy Pokémon, LEFTOVERS), Potion, Antidote, Full Restore, Revive (half HP), Ether (10 → 15), X Attack, Dire Hit; LEFTOVERS and poison messages; quantities saved.
- [x] **Level up:** exp gain, bar, level up window (+ then totals), also on the bench.
- [x] **Learning:** free slot (no prompt), full moveset (forget SCRATCH, "1, 2, and… Poof!"), HM refused ("HM moves can't be forgotten now.").
- [x] **Evolution:** evolves, saved; B **held** through the cycle stops it (a tap does nothing, as in FireRed); evolves at the next level up; a bench Pokémon evolves too.
- [x] **Reload mid-battle:** drops the battle (D22), party and bag as before it.
- [x] **Party after a battle:** HP, status, PP (SURF 15 → 14), revived partner's HP, split exp, money saved; order unchanged after a switch (slot 0 stays first; not compared with the ROM).
- [x] **Send-out and recall:** seen in the game: grows where it stands, no arc; recall has no ball.

**Not tested, not built, all in [Phase 8](../../phases/phase-8-pokemon-party.md) (the user, 2026-11-04):** TM/HM teaching, items used on a Pokémon outside battle (Rare Candy, potions, stones), Exp. Share's effect.

**Already played (M13, desktop):** moves, switch, faint, replacement, SHIFT, doubles, a doubles loss (whiteout, −400, party healed), a doubles win saved with its prize. Don't redo these.

## Bugs Found

**Committed (`1bacfee`), seen working:** SURF and MUDDY WATER's per-line blend (`video.alphaLines`; other moves checked in code only), party balls' palette, battle's prompt arrow, send-out (`PokeBalls.releaseInBattle`), recall (`switchOutEffect`, `switchOut` in `playback.ts`).

**Also committed:**

- **Dire Hit froze the battle:** `addVolatile` outside an event stored the format as `sourceEffect`, which `State` can't serialize; every turn failed (`mic-battles` WARN "Unsupported type Format"), the client sat on an empty box. `bag.ts` passes the condition. Seen working. Guard Spec.'s side condition doesn't store it, safe.
- **"is getting pumped!" missing:** for Dire Hit and the move Focus Energy. `messages.ts`, `texts.json` (`gBattleText_GetPumped`). Seen working. Same for Mist's start (`gBattleText_MistShroud`), **not seen**.
- **Ether's move picker covered:** the message box hid part of the list. `party-menu.ts` now uses FireRed's `sWhichMoveMsgWindowTemplate` and fixed `sMoveSelectWindowTemplate`. Typecheck passes, built, **not seen**: check it when next using an Ether (bag, ETHER, Pokémon, "Restore which move?").

**Open, minor, not fixed:**

- The player's throw is approximate (`throwBall`: from 32,72, no slowdown; FireRed: from 48,70, 25 frames, arc -30, slower mid-flight).
- A transformed Pokémon's recall uses `info.species` for its Y delta, not checked against `transformSpecies`.
- A failed `battles.turn` leaves the client on an empty box with no error (seen with Dire Hit).

## How to run it, fast

- **Setup:** stack is up with all the fixes (`docker compose up --build -d spa-pokeuniverse mic-core mic-battles` if not; rebuilding drops a running battle). Pane at `localhost:8080/play`, already signed in as AA (account 2), not open in a new session: `preview_start` with that URL. The player stands at **9,5, facing `test_trainer` (9,4)**; `test_double_trainer` is at 9,6.
- **Helper:** read `infra/playtest/helper.js`, paste it with `javascript_tool` after each load (a reload drops it). Then `await toBattle1()`, next call `await toBattle2()`: the action menu. A JS call must end within 45 s. Page text can't read the canvas: use `screenshot` at `scale` 0.3 in `browser_batch` (tap, wait, screenshot).
- **Scenarios:** `infra/playtest/scenario.sh learn|free-slot|next-level|items|loss|healed|bag|unbag|show` writes the party or bag to the database, **then reload the page**. `learn`, `free-slot`: Charmander Lv. 15 one exp short of Lv. 16 (evolves, offers DRAGON RAGE; a win gives 213 exp). `items`: lead hurt and poisoned, PP spent, partner fainted. `healed`: back to the backup's HP and PP. Add a case for a new state.
- **The overrides:** `mic-core/internal/battle/zz_playtest.go` makes `test_trainer` one Lv. 5 Scizor with only SURF, no items, and **no `Heals`**, so saved HP, status and PP reach the battle (rebuild `mic-core` when changed). SURF hits a Charmander for ~8.
- **Turns:** a full turn takes ~14 s to the menu; send nothing before the menu shows (early keys are lost). Action menu and bag **remember their cursor** in a battle: look before pressing.
- **Bag in battle:** list LEFTOVERS, LIGHT BALL, POTION, FULL RESTORE, ANTIDOTE, REVIVE, ETHER, X ATTACK, DIRE HIT, CANCEL. `z` opens USE; `z` opens the party (X items, Dire Hit go straight on). Party opens on the first slot; `ArrowRight` reaches the next. After a refusal: `z`, then `x` leaves.
- **After a KO:** ~3 s per `z`: gained, grew, window, totals, next gained, "Player defeated", defeat text, prize, evolving (~26 s), then `z` once to the room (the trainer's "Tch!", `Enter` closes it). Hold B to stop an evolution: keydown, 12 s, keyup, 2.5 s after the `z` that ends the prize text.
- **⚠ Stop pressing at a battle's end:** `z` in the room talks to the trainer again and starts another battle.
- **Menus in doubles:** a target's default is the foe on the right (position 0); `ArrowLeft` moves to the other. Party menu opens on the first slot: `ArrowRight`, then `ArrowDown`. A move with no prompt (Earthquake) makes a blind third `z` open the next menu, and a blind arrow lands on BAG.
- **Watching:** each JS call must end within 45 s. Screenshots miss short effects: inside `requestAnimationFrame` (the canvas reads black outside one), copy the frame every N to 240×160 canvases (crop: `w=min(c.width,c.height*1.5)`, `h=w/1.5`, centered), draw them on a fixed overlay canvas, one JS call before the screenshot, and remove it after. If the pane is hidden, wrap `requestAnimationFrame` with `setTimeout(16)`.
- **Pokédex:** `Enter`, `z`, `z`: the list. Stored in `trainers.pokedex_seen` and `pokedex_caught`.
- **Saved data:** `docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}" -c "<query>"'`: `trainers` (`money`), `trainer_pokemon` (`slot, species, level, hp, exp, status, held_item, moves, pp`), `trainer_items` (`pocket, slot, item, quantity`), `battle_outcomes` (`result` 1 win, 2 loss; `money`). Service warnings: `docker compose logs --since=5m mic-core mic-battles | grep -E '"level":"(WARN|ERROR)"'` (none so far); "invalid battle choice" means the same request came back to the client.
- **Builds:** SPA typecheck `cd spa-pokeuniverse && npx tsc --noEmit -p .`; rebuild `docker compose up --build -d spa-pokeuniverse` (or `mic-core`).

## Clean Up (the user: the script and overrides are never committed, removed at the end)

1. `infra/playtest/scenario.sh restore` (the party, from table `playtest_party_backup`, which it drops), `infra/playtest/scenario.sh unbag`.
2. Money back: `UPDATE trainers SET money=2560 WHERE account_id=2`.
3. `rm -r infra/playtest mic-core/internal/battle/zz_playtest.go`, then `docker compose up --build -d mic-core`.

## Progress

**State now:** all fixes committed, typechecks clean, built and running (`make text` run). `infra/playtest/` and `zz_playtest.go` are in the tree, never commit them. AA's slot 0 is a Charmeleon Lv. 17 at 23 HP with LEFTOVERS, Pikachu at 50 HP, money 3280, the bag has the `bag` items, in the room with the Pokédex list open.
