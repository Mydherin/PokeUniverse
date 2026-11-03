# M13 Options, Doubles and Polish ✅

Part of the [battles plan](README.md). **Needs:** M12. This file is enough to resume; [context.md](context.md) only for a section a step needs.

- **D27:** doubles are one step per side's whole choice. The client collects both positions and sends one `BattleChoice` (`action`, `partner`); `BattleRequest.positions` says who must choose, and the engine fills in locked and fainted Pokémon. Singles requests and choices don't change.
- **D26:** SHIFT is emulated in `mic-battles` (done).
- **SPA typecheck:** `cd spa-pokeuniverse && npx tsc --noEmit -p .`
- **SPA bundle (Docker only):** `cd spa-pokeuniverse && docker run --rm -v "$PWD/..":/repo -w /repo/spa-pokeuniverse node:26-alpine sh -c "npx vite build --outDir /tmp/dist"`
- **`mic-core`:** `docker run --rm -v "$PWD":/repo -w /repo/mic-core -v pokeuniverse-go-mod:/go/pkg/mod -v pokeuniverse-go-build:/root/.cache/go-build golang:1.27-alpine sh -c "go build ./... && go vet ./..."`
- **Assets:** `make text`, `make graphics`.

- [x] **SHIFT:** engine, server, client code. Engine checked by a one-off; not seen in the game.
- [x] **Doubles, engine, AI, `mic-core`:** checked by a one-off.
- [x] **Doubles, client code:** layout, choices, targets, send-outs, party order, playback, animation battlers. Typechecks and bundles; **not seen in the game**.
- [x] **Double prize:** `Trainer.Prize`.
- [x] **Doubles animations:** partner slides, `invisible`/`monbg` on partners, partner palette selectors, all-battler shake, Heat Wave and rain shakes on partners, hail landing spots. Spread moves checked by reading their scripts, not played.
- [x] **Field condition texts:** Trick Room, Gravity (expansion's strings, `GEN4_BATTLE_STRINGS` in `infra/text/extract.mjs`), Mud Sport, Water Sport (FireRed's).
- [x] **Multi-hit and two-turn review:** found and fixed: a multi-hit move now replays its animation per strike with the next `animTurn` (`plan`'s `restrikes`), and Shadow Force has its charge text. Strikes on a substitute don't replay (no `damage` event).
- [x] **Performance, by reading:** battle art, sounds and animations are prefetched when a trainer's script starts (`prepareBattle`), art loads per battle and per move, `/firered/` is runtime-cached network first. **Frame rate on a phone isn't measured:** moved to M14.
- [x] **Close:** `make text`, `make maps`, committed. Play check moved to [M14](m14-phase-4-battle-check.md).

## Progress

**State (2026-11-04):** all code done and committed. SPA tsc ✅, vite ✅, `make text` ✅, `make maps` ✅ (`test_double_trainer` compiled); `mic-core` and `mic-battles` builds passed earlier in this milestone and weren't touched since. The game has not been run.

**Left as is:** `AnimTask_SporeDoubleBattle` (BG priority only); `AnimTask_PositionFissureBgOnBattler` ignores partner values (Fissure is single target); `splitbgprio` and `teamattack_*` do nothing. `make text` encodes `B_*_MON2_NAME` as 0x07/0x08 via the charmap, matching `text.ts`.

### How the client works now

- **Indexes:** `scene.mon(spot)`, `healthbox(spot)`, `removeMon(spot)`, `spot(spot)` take `Spot` (`{foe, position}`, in `scene.ts`); arrays by `battlerId` = `position*2 + (foe?1:0)`, so singles stay `[0]`/`[1]`. `BattleScene` takes `doubles`.
- **`Healthbox(flow, foe, doubles, position)`:** `detailed` (HP numbers and exp bar) is the singles player only; `moveExp` does nothing otherwise (FireRed's `Task_GiveExpToMon`).
- **Choices (`screen.ts`):** `requestJob` loops over `positionsAsked(r)`, with `chooseFor` (ACTION) or `chooseReplacement` (SWITCH); B on the second returns null and goes back. `send(kind, partner)`. Cursors per position.
- **Targets (`menus.ts`):** `chooseMove` takes `confirm`, which runs `askTarget` with the menu still up; `chooseTarget` is HandleInputChooseTarget. Curse asks only for a Ghost.
- **Party:** `order` keeps each active at its position's index; `sentOut(slot, position)` swaps. The menu mode takes `inBattle(i)` and `selected` (partner's pick, `gText_PkmnAlreadySelected`). It still draws the singles layout, not FireRed's double one.
- **Send-outs (`playback.ts`):** `play` groups two same-side switch-ins while `starting` (`sentTogether`); `switchIn(...events)` then `comeOut` for each. After the intro: `sText_GoPkmn2` always in doubles.
- **Spread moves:** `plan` no longer drops the animation when one target is immune (`hitsAnother`). The move's animation plays once, then each target's hit in turn, as FireRed.
- **`across(spot)`:** the Pokémon opposite, or the other foe. Used where the real source isn't known (Leech Seed drain, Future Sight, Thief).

### Known gaps (accepted for now)

- `trapped` isn't read by the client, singles included: a refused switch comes back as the same request.
- Two items chosen in one step aren't subtracted in the bag screen: `mic-core`'s `enoughInBag` refuses, and the step comes back.

### Gotchas

- **One-off engine checks:** put a temporary `mic-battles/src/oneoff.ts` driving `Battles` with an in-memory store (`load`, `save`), bundle it with esbuild in Docker (`node:26-alpine`, with the `createRequire` banner from `package.json`'s build), run it, delete it.
- **Never import the `Species` enum as a value in `mic-battles`:** esbuild then renames Showdown's class to `Species2`, its saved refs no longer restore, and the battle crashes at the first faint. Check with `grep -E '(var|class) (Species|Item|Ability|DataMove|Condition)[0-9]+'` on the bundle if contract imports change. Use `SpeciesSchema` or numbers. (The SPA can import enums.)
- **SHIFT:** `shift_style` is set after `Active.Start` is marshalled, so a start redone from `Active.Start` plays as SET. Harmless. Showdown's forced switches sort by speed, so the player's action gets a lower `order`.
- **Doubles start:** Showdown sends out the first two even if fainted, hence `leadsFirst` and `mic-core` refusing a party with fewer than two able (`battleFailed`).
- **Showdown refuses a selectable move with no target in doubles**, even with the ally gone: `chooseTarget` then sends the empty spot, which is a valid location.
- **AI:** spread moves can hit its partner, as in FireRed.
