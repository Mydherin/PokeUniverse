# M14 Phase 4 Battle Check 🚧

Part of the [battles plan](README.md). **Needs:** M4-M13. This file is enough to resume; [context.md](context.md) only for a section a step needs.

Manual, **only when the user asks** ([AGENTS.md](../../../AGENTS.md#testing)). Fix what breaks, tick here. A task that needs a reference or code: read only that. Cheap sweeps in our game, no move-by-move ROM comparison.

## Resume Here

**Next step:** in the running battle or a new one, finish **Items** (below), then the tasks in order. Stack is up with the temporary overrides. When every task is ticked, do **Clean Up** and mark M14 ✅.

## Tasks

- [x] **Singles win:** defeat text, ₽180, back in the room, saved (exp, moves, money).
- [ ] **Singles loss:** whiteout from singles. The one-foe override can't lose: remove it first or let a Lv. 1 lead with the rest fainted (`hp=0`) take SURF.
- [ ] **Items:** done: Potion heals (33→39), LEFTOVERS refused in battle (OAK's message). Left: an item that fails with no effect, Antidote or Full Heal, Revive, Ether on a used move, X Attack, Dire Hit; held-item message (LEFTOVERS is on slot 0: take a hit, end of turn).
- [x] **Level up:** exp gain, bar, level up window (+ then totals).
- [x] **Learning:** free slot (no prompt), full moveset (forget SCRATCH, "1, 2, and… Poof!"), HM refused ("HM moves can't be forgotten now.").
- [ ] **Learning left:** answer No to "Delete a move?" then give up on it.
- [x] **Evolution:** evolves, saved; B **held** through the cycle stops it (a tap does nothing, as in FireRed); evolves at the next level up.
- [ ] **Pokédex seen:** an evolved species shows in the Pokédex.
- [x] **Reload mid-battle:** drops the battle (D22), party and bag as before it (Potion back to 3).
- [ ] **Restart mid-battle:** `mic-core`, then `mic-battles`: M6's restart-resume check, never run.
- [ ] **Party after a battle:** HP, status, order. PP can't be judged with `Heals` (below).
- [ ] **Mobile:** start a battle on a phone viewport, touch input, frame rate on a real phone (the user's; the pane only emulates size).

**Not tested, not built, all in [Phase 8](../../phases/phase-8-pokemon-party.md) (the user, 2026-11-04):** TM/HM teaching, items used on a Pokémon outside battle (Rare Candy, potions, stones), Exp. Share's effect.

**Already played (M13, desktop):** moves, switch, faint, replacement, SHIFT, doubles, a doubles loss (whiteout, −400, party healed), a doubles win saved with its prize. Don't redo these.

## Bugs Found

Fixed and seen working, **not committed**: commit only `water.ts`, `video.ts`, `healthbox.ts`, `gba/text.ts`, `battle/scene.ts` and these docs when the user asks.

- **SURF, MUDDY WATER:** blue over the wave. FireRed blends BG1 by scanline (`AnimTask_SurfWaveScanlineEffect`); ours by frame showed the map's wrapped water rows. Now `video.alphaLines` (per-line BLDALPHA). Seen from both sides. **Other moves checked in code:** that task is FireRed's only per-line BLDALPHA in `battle_anim*.c`, the other scanline effects shift a battler's BG1/BG2, and `fadetobg` backgrounds are whole-screen BG3; no others affected, not swept on screen.
- **Party balls at the battle's start:** wrong colors, drawn with the healthbox palette; FireRed uses the healthbar one.
- **Prompt arrow in battle:** blue with a red edge; battle uses the sheet's other arrow (`useAlternateDownArrow`, x 64), red with a dark shadow. `PrinterTemplate.alternateDownArrow`, set by the battle scene's `print` (so the evolution scene too). Bag and field text keep the normal arrow.
- **Send-out arc (fixed, tsc passes, not seen yet, not committed: `pokeball.ts`, `battle/playback.ts`):** battles used the Oak and trade release (`CreatePokeballSpriteToReleaseMon`), flying the Pokémon in an arc. Now `PokeBalls.releaseInBattle` (`SpriteCB_ReleaseMonFromBall`, `HandleBallAnimEnd`): it stays at its X and rises 16 px as it grows. Ball at Y + 24, foe's after 16 frames, right-hand ball 25 later in a double intro; the terrain flashes white (palettes 1-3, mask 14). Oak keeps `release`.
- **Recall (fixed, tsc passes, not seen yet, not committed: `pokeball.ts`, `battle/playback.ts`, `battle/scene.ts`):** used the trade's `takeBack`, with a ball on screen. Now `Special_SwitchOutPlayerMon`: `PokeBalls.switchOutEffect` (sparkles at spot Y + 32, palette to the ball's color, terrain flash) and, 10 frames in, the shrink with its feet on the ground (`switchOut` in `playback.ts`). Oak keeps `takeBack`. A transformed Pokémon's Y delta uses `info.species`, not checked against `transformSpecies`.
- **Open, not fixed:** the player's throw is approximate (`throwBall`: from 32,72, no slowdown; FireRed: from 48,70, 25 frames, arc -30, slower mid-flight).

## How to run it, fast

- **Setup:** stack is up (`docker compose up --build -d spa-pokeuniverse mic-core mic-battles` if not). Pane at `localhost:8080/play`, already signed in as AA (account 2). The player stands at **9,5, facing `test_trainer` (9,4)**; `test_double_trainer` is at 9,6.
- **Scenarios:** `infra/playtest/scenario.sh save|restore|learn|free-slot|next-level|bag|unbag|show` writes the party or bag to the database, **then reload the page** (the server loads them on connect). `learn`, `free-slot`: Charmander Lv. 15 one exp short of Lv. 16 (evolves there, offers DRAGON RAGE; a win gives 213 exp). `next-level`: Lv. 16, one short of Lv. 17, holding LEFTOVERS. Add a case for a new state.
- **The one-foe override:** `mic-core/internal/battle/zz_playtest.go` makes `test_trainer` one Lv. 5 Scizor with only SURF, no items; two SURFs win (rebuild `mic-core` when changed).
- **`Heals`:** the test trainer heals the party at the start (HP and PP), so a scenario's low HP doesn't reach the battle; take a hit first.
- **To a battle, ~50 s:** one JS call: inject the helper (below), wait 14 s, Enter, 2.5 s, Enter, 2.5 s, Enter, 3 s, `z`, 6 s, tap `ArrowUp` (face), 0.6 s, `z`, 5 s, then `z` ×4 with 1.5 s gaps. Next call: 9 s, `z`, 14 s: the action menu. At 8.5 s the intro shows the balls and "would like to battle!".
- **Helper (a reload drops it):** `tap(k, hold=80)` dispatches keydown, then keyup after `hold`, with `key` and `code` (`KeyZ` = A, `KeyX` = B, `Enter` = START, `Arrow…`, `bubbles: true`) on window and document. Hold B: keydown, 12 s, keyup, sent 2.5 s after the `z` that ends the prize text.
- **After a KO (level up with a free slot):** with ~3.5 s gaps: `z` gained, `z` grew, `z` window, `z` totals, `z` learned, `z` defeated, `z` defeat text, `z` prize, `z` evolving. Keep screenshots at `scale` 0.3 in `browser_batch` (tap, wait, screenshot).
- **Bag in battle:** menu `ArrowRight`, `z`; list LEFTOVERS, LIGHT BALL, then POTION, FULL RESTORE, ANTIDOTE, REVIVE, ETHER, X ATTACK, DIRE HIT. `z` on an item opens the party; `z` picks. After a refusal: `z`, then `x` leaves; the menu's cursor stays on BAG.
- **⚠ Stop pressing at a battle's end:** `z` in the room talks to the trainer again and starts another battle. Before the last KO, one key at a time.
- **Menus in doubles:** a target's default is the foe on the right (position 0); `ArrowLeft` moves to the other. Party menu opens on the first slot: `ArrowRight`, then `ArrowDown`. A move with no prompt (Earthquake) makes a blind third `z` open the next menu, and a blind arrow lands on BAG.
- **Watching:** each JS call must end within 45 s. Screenshots miss short effects: inside `requestAnimationFrame` (the canvas reads black outside one), copy the frame every N to 240×160 canvases (crop: `w=min(c.width,c.height*1.5)`, `h=w/1.5`, centered), draw them on a fixed overlay canvas, one JS call before the screenshot, and remove it after. If the pane is hidden, wrap `requestAnimationFrame` with `setTimeout(16)`.
- **Saved data:** `docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}" -c "<query>"'`: `trainers` (`money`), `trainer_pokemon` (`slot, species, level, hp, exp, status, held_item, moves, pp`), `trainer_items` (`pocket, slot, item, quantity`), `battle_outcomes` (`result` 1 win, 2 loss; `money`). Service warnings: `docker compose logs --since=5m mic-core mic-battles | grep -E '"level":"(WARN|ERROR)"'` (none so far); "invalid battle choice" means the same request came back to the client.
- **Builds:** SPA typecheck `cd spa-pokeuniverse && npx tsc --noEmit -p .`; rebuild `docker compose up --build -d spa-pokeuniverse` (or `mic-core`).

## Clean Up (the user: the script and overrides are never committed, removed at the end)

1. `infra/playtest/scenario.sh restore` (the party, from table `playtest_party_backup`, which it drops), `infra/playtest/scenario.sh unbag`.
2. Money back: `UPDATE trainers SET money=2560 WHERE account_id=2`.
3. `rm -r infra/playtest mic-core/internal/battle/zz_playtest.go`, then `docker compose up --build -d mic-core`.

## Progress

**State now:** the fixes above and the two temporary files are in the working tree, uncommitted; `mic-core` and the SPA run them; typecheck clean. AA's slot 0 is the `next-level` Charmander, the bag has the `bag` items, and the pane is at a battle's intro.
