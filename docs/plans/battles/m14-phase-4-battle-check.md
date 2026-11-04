# M14 Phase 4 Battle Check ⬜

Part of the [battles plan](README.md). **Needs:** M4-M13. This file is enough to start; [context.md](context.md) only for a section a step needs.

Manual, **only when the user asks** ([AGENTS.md](../../../AGENTS.md#testing)). Fix what breaks, tick here. A task that needs a reference or code: read only that. Cheap sweeps in our game, no move-by-move ROM comparison.

## Tasks

- [ ] **Singles, normal teams:** play to win (see the defeat and prize text, back in the room) and to lose.
- [ ] **Items:** use a potion from the bag; M12's bag items and held-item messages.
- [ ] **M11:** exp bar, level up window, learning a move, evolution, Pokédex seen. The team is Lv. 50: lower a party member in the database or override (below).
- [ ] **Reload mid-battle:** drops the battle (D22), party as before it.
- [ ] **Restart mid-battle:** `mic-core`, then `mic-battles`: M6's restart-resume check, never run.
- [ ] **Party after a battle:** HP, PP, status, order.
- [ ] **Mobile:** start a battle on a phone viewport, touch input, frame rate on a real phone (the user's; the pane only emulates size).

**Already played (M13, desktop):** moves, switch, faint, replacement, SHIFT, doubles, a doubles loss (whiteout, −400, party healed), a doubles win saved with its prize. Don't redo these.

## How to run it, fast

- **Setup:** stack is up (`docker compose up --build -d spa-pokeuniverse mic-core mic-battles` if not). Pane at `localhost:8080/play`, already signed in as AA (account 2, money 2560; team: Garchomp, Pikachu, Charizard, Lucario, Gardevoir, Snorlax). The player stands at **8,6, facing `test_double_trainer` (9,6)**; `test_trainer` (singles) is at 9,4, so walk to 9,5 and face up. Holding an arrow ~260 ms per tile.
- **To a battle:** wait ~14 s after load, then Enter until the title and the CONTINUE menu (screenshot, the intro's length varies), `z`, 5 s, `z` ×4 with ~2.2 s gaps (doubles: then `z` for Yes), 9 s, `z`, ~14 s.
- **Keys:** dispatch keydown/keyup with `key` and `code` (`KeyZ` = A, `KeyX` = B, `Enter` = START, `Arrow…`) on window and document, held 80 ms. Menus need ~800 ms after opening. Page reload drops the helpers. Every "fainted" and "EXP" message waits for `z`.
- **⚠ Stop pressing at a battle's end:** `z` in the room talks to the trainer again and starts another battle. Before the last KO, one key at a time.
- **Winning:** the normal team can't reliably beat the max-EV trainers. **The user allowed `Level: 5`** in `mic-core/internal/battle/testdata.go` (never commit: `git checkout` and rebuild after); a win then pays 360 in doubles, 180 in singles. Garchomp's Earthquake KOs its partner in doubles; Gengar and Gyarados are immune.
- **Menus in doubles:** a target's default is the foe on the right (position 0); `ArrowLeft` moves to the other. Party menu opens on the first slot: `ArrowRight`, then `ArrowDown`. A move with no prompt (Earthquake) makes a blind third `z` open the next menu, and a blind arrow lands on BAG.
- **Helper:** classify the 240×160 frame, sampling x 128-232, y 128-152 **in a `requestAnimationFrame`** (the canvas reads black outside one): over 60% white = action menu; over 35% blue (`b>r+25 && b>=g+15 && r<90`) = message, press `z`; else party or move menu, stop and look. Crop: `w=min(c.width,c.height*1.5)`, `h=w/1.5`, centered (the pane's size changes).
- **Watching:** each JS call must end within 45 s. Screenshots miss short texts, so record into 240×160 canvases and draw a contact sheet on a fixed overlay canvas, one JS call before the screenshot (not in parallel), and remove it after. If the pane is hidden, wrap `requestAnimationFrame` with `setTimeout(16)`.
- **Saved data:** `docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}" -c "<query>"'`: `trainers` (`money`), `trainer_pokemon` (`slot, species, level, hp, exp, status`), `battle_outcomes` (`result` 1 win, 2 loss; `money`). Service warnings: `docker compose logs --since=5m mic-core mic-battles | grep -E '"level":"(WARN|ERROR)"'`; "invalid battle choice" means the same request came back to the client.
- **Temporary overrides (never commit):** the party is in the database, so don't touch `testteam.go`. Wrap the return of `NewStart` in `mic-core/internal/battle/team.go` with a temp `playtest(s)` in a new `zz_playtest.go`: replace `s.Sides[i].Pokemon[j].Moves` with `partyv1.Move{Move, Pp, MaxPp}` (`pokemon.MaxPP(id, 0)`) and `Hp` as needed. Rebuild `mic-core`. Remove with `rm zz_playtest.go`, `git checkout` the files, rebuild.
- **Builds:** SPA typecheck `cd spa-pokeuniverse && npx tsc --noEmit -p .`; bundle (Docker only) `docker run --rm -v "$PWD/..":/repo -w /repo/spa-pokeuniverse node:26-alpine sh -c "npx vite build --outDir /tmp/dist"` from `spa-pokeuniverse`.

## Progress

Not started. While 🚧: tasks ticked above, then here the exact next step, files touched, build state, gotchas.
