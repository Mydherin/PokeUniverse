# M13 Options, Doubles and Polish ✅

Part of the [battles plan](README.md). Cut down to what later milestones use.

- **D27:** doubles are one step per side's whole choice. The client collects both positions and sends one `BattleChoice` (`action`, `partner`); `BattleRequest.positions` says who must choose, and the engine fills in locked and fainted Pokémon. Singles requests and choices don't change.
- **D26:** SHIFT is emulated in `mic-battles`.

**Built:** SHIFT; doubles in engine, AI, `mic-core` and client; double prize (`Trainer.Prize`); partner animations; field condition texts (Trick Room, Gravity, Mud Sport, Water Sport); a multi-hit move replays per strike (`plan`'s `restrikes`; strikes on a substitute don't, no `damage` event); Shadow Force's charge text; battle assets prefetched by `prepareBattle`.

**Played (browser pane):** singles moves, switch, faint, replacement, abilities; SHIFT prompt with its frame, Yes and No; Double Slap per strike; doubles send-outs, both positions, targets, B back, forced turns; Earthquake, Rock Slide, Heat Wave, Surf, Discharge; Dark Void, Gravity, Trick Room, Shadow Force; faints and replacing; Aura Sphere's target prompt; doubles loss (whiteout, −400, party healed); doubles win saved with the double prize (+360 at Level 5).

**Closed by the user without seeing:** a doubles win's last screens (defeat and prize text, back in the room). Dark Void's partner slide wasn't checked frame by frame.

**Left as is:** `AnimTask_SporeDoubleBattle` (BG priority only); `AnimTask_PositionFissureBgOnBattler` ignores partner values (Fissure is single target); `splitbgprio` and `teamattack_*` do nothing. `make text` encodes `B_*_MON2_NAME` as 0x07/0x08 via the charmap, matching `text.ts`.

## How the client works now

- **Indexes:** `scene.mon(spot)`, `healthbox(spot)`, `removeMon(spot)`, `spot(spot)` take `Spot` (`{foe, position}`, in `scene.ts`); arrays by `battlerId` = `position*2 + (foe?1:0)`, so singles stay `[0]`/`[1]`. `BattleScene` takes `doubles`.
- **`Healthbox(flow, foe, doubles, position)`:** `detailed` (HP numbers and exp bar) is the singles player only; `moveExp` does nothing otherwise (FireRed's `Task_GiveExpToMon`).
- **Choices (`screen.ts`):** `requestJob` loops over `positionsAsked(r)`, with `chooseFor` (ACTION) or `chooseReplacement` (SWITCH); B on the second returns null and goes back. `send(kind, partner)`. Cursors per position, reset on switch-in (`sentOut`).
- **Targets (`menus.ts`):** `chooseMove` takes `confirm`, which runs `askTarget` with the menu still up; `chooseTarget` is HandleInputChooseTarget. `choosesTarget` must match Showdown's `targetTypeChoices` (normal, any, adjacent ally, ally or self, adjacent foe). Curse asks only for a Ghost.
- **Party:** `order` keeps each active at its position's index; `sentOut(slot, position)` swaps. The menu mode takes `inBattle(i)` and `selected` (partner's pick, `gText_PkmnAlreadySelected`). It still draws the singles layout, not FireRed's double one.
- **Send-outs (`playback.ts`):** `play` groups two same-side switch-ins while `starting` (`sentTogether`); `switchIn(...events)` then `comeOut` for each. After the intro: `sText_GoPkmn2` always in doubles.
- **Spread moves:** `plan` no longer drops the animation when one target is immune (`hitsAnother`). The move's animation plays once, then each target's hit in turn, as FireRed.
- **`across(spot)`:** the Pokémon opposite, or the other foe. Used where the real source isn't known (Leech Seed drain, Future Sight, Thief).

## Known gaps (accepted for now)

- `trapped` isn't read by the client, singles included: a refused switch comes back as the same request.
- Two items chosen in one step aren't subtracted in the bag screen: `mic-core`'s `enoughInBag` refuses, and the step comes back.

## Gotchas

- **One-off engine checks:** put a temporary `mic-battles/src/oneoff.ts` driving `Battles` with an in-memory store (`load`, `save`), bundle it with esbuild in Docker (`node:26-alpine`, with the `createRequire` banner from `package.json`'s build), run it, delete it.
- **Never import the `Species` enum as a value in `mic-battles`:** esbuild then renames Showdown's class to `Species2`, its saved refs no longer restore, and the battle crashes at the first faint. Check with `grep -E '(var|class) (Species|Item|Ability|DataMove|Condition)[0-9]+'` on the bundle if contract imports change. Use `SpeciesSchema` or numbers. (The SPA can import enums.)
- **SHIFT:** `shift_style` is set after `Active.Start` is marshalled, so a start redone from `Active.Start` plays as SET. Harmless. Showdown's forced switches sort by speed, so the player's action gets a lower `order`.
- **Doubles start:** Showdown sends out the first two even if fainted, hence `leadsFirst` and `mic-core` refusing a party with fewer than two able (`battleFailed`).
- **Showdown refuses a selectable move with no target in doubles**, even with the ally gone: `chooseTarget` then sends the empty spot, which is a valid location.
- **AI:** spread moves can hit its partner, as in FireRed. It also switches a lot with weak moves or low HP.
- **Spread move text order:** a target's faint and exp come before the next target's Focus Sash text (per target, as FireRed's loop). Left as is.
