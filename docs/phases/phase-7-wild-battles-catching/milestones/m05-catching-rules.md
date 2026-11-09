# M5 Catching Rules 🟨

Part of [Phase 7](../phase-7-wild-battles-catching.md). **Needs:** M4. Rules: [context.md](context.md) D6, D9, D10; [catch and balls](context.md#gen-4-rules-used-by-several-milestones).

**Done when:** every ball in the catalog can be thrown in a wild battle with Gen 4's formula and modifiers, the result (shakes, caught or not) comes as events, a catch is saved with the battle's outcome into the party or a box with its caught data, the Pokédex marks it caught, the nickname intent works, and trainer battles block balls. The client may show it with plain messages until M7.

## Resume Here

**In progress (session 1 stopped at the context guard; nothing committed, everything builds).** Do mic-core steps 3-4 below, then the Play It. Gen 4 catch code found and written below (Findings). Contracts done (generated, `make contracts` passes): `BallThrown` (event 38), `BATTLE_RESULT_CAUGHT` 7, `BattleEnded.caught` (`CaughtPokemon`, `CaughtWhere`), `StartBattle.catch_facts` (`CatchFacts { species_caught[] by side-1 slot, night }`; cave and water come from `StartBattle.terrain`), `SideOutcome.caught_ball / caught_slot / caught`, `party.v1.NameCaughtPokemon { name }` (ClientMessage 37). Night: mic-core `world.night(t)` (`internal/world/party.go` 262). `mic-battles` done (`tsc --noEmit` passes): `src/engine/catch.ts` (`ballShakes`, `chooseBall`, `registerCatch` called from `registerExtras`; the `Ball` event, order 102 like bag items; our line `|ball|<user>|<ball>|<target>|<shakes>|caught/blocked`; `Extras.caught { slot, ball }` + `battle.tie()`), `engine/bag.ts` `isBall`, `engine/choices.ts` (item → `{ ball }` part, side 0 only), `protocol/views.ts` (`result` CAUGHT first; `monOutcome` helper; side 0's `caughtBall / caughtSlot / caught`, Heal Ball → max HP, no status), `protocol/events.ts` (`ball` → `ballThrown`). Pickup is `BattleWin` only in Gen 4 (`subscript_0004_BattleWin.s`): none after a catch (already so: `won` only). mic-core started (builds: `go build ./... && go vet ./internal/...` in `golang:1.27-alpine`, command in Gotchas): `pokedex.HasCaught` (`internal/pokedex/pokedex.go`), `battle.Caught(start, slot, out, ball, ot, mapID)` builds the saved Pokémon from side 1's `BattleMon` + `SideOutcome.caught` (`internal/battle/team.go`), `pokemon.StatsFrom` exported (was `statsFrom`).

**Exact next steps (mic-core, in order):**
1. ✅ `startWild` sets `start.CatchFacts`.
2. ✅ done (`throwsBall`, `errStorageFull`, `pokemon.StorageFull`): `battleChoice`: if the action is a ball (`item.Info(id).GetBattleUse() == BATTLE_USE_BALL`) and `len(p.party) == pokemon.PartySize`, check storage inside the `z.ask` goroutine before `Turn` (new `pokemon.StorageFull(ctx, q, accountID)` from `freeBoxSlot` returning box 0) → refuse. Ball spending already goes through `Spent` / `keepSpent` like any bag item (nothing to add; trainer-blocked balls are spent, as FireRed).
3. `finish` (~375): result CAUGHT = not won, not lost (add to the `lost` exclusion like RAN; HP / status / PP stay). Build `battle.Caught(start (unmarshal b.Start), side.CaughtSlot, side.Caught, side.CaughtBall, OT {name: GetTrainer row.Name, p.trainerID, p.gender}, z.m.ID)`; Luxury Ball's friendship bonus: check `ChangeFriendship*` handles `Ball == LUXURY_BALL` (grep `LUXURY`). In `saveOutcome` after `pokemon.Write`: `pokemon.AddCaught` (change it to also return the box name and `box != current` for `box_full_before`); `p.pokedex = p.pokedex.Catch(species)` before `savePokedex`; full → shouldn't happen (refused at the throw), log and drop. Fill `BattleEnded.Caught` (`new_in_pokedex` = `!dex.HasCaught` before). Keep the caught Pokémon's place (party slot or box + slot) on `p.battle`-like state for the nickname: add `Active.Naming *{Box, Slot int}` kept in Redis (don't `ClearActive` until answered? simpler: a separate small Redis key or a `trainers` column — decide; D10 says "held in the player's active battle record until answered"). A restart (join) with a pending naming re-sends `BattleEnded.caught.nickname_pending`.
4. `NameCaughtPokemon` handler (`realtime` dispatch: grep `EvolvePokemon` in `mic-core/internal/` for the wiring): validate ≤10 chars and the charmap (grep the naming screen's server check, e.g. `RenameBox`'s validation), rename in the party (`pokemon.Write`) or the box (new sqlc query `UpdateBoxPokemonNickname` in `queries/pokemon.sql`, `make sqlc`), clear the pending naming.


## Findings (Gen 4, `pokeheartgold`)

- **Formula:** `BattleSystem_CalculateBallShakes`, `src/battle/battle_command.c` 7180-7376; called from the get-Pokémon task ~6716. Integer math, left to right: `catchRate` = species base (Safari: stage table); `ball` in tenths (×1 = 10); `a = ((catchRate·ball / 10) · (3·maxHP − 2·HP)) / (3·maxHP)`; then sleep/freeze `a·2`, burn/para/psn/tox `a·15/10` (separate ifs). `a ≥ 255` → 4 checks passed; else `b = 0xFFFF0 / isqrt(isqrt(0xFF0000 / a))` (integer square roots, floor), checks `rand16 < b` stop at the first failure, at most 4 (`BALL_SHAKE_MAX` 4, `include/constants/battle.h` 649). 4 = caught. Master Ball forces 4. Animation shows `min(shakes, 3)` shakes, then the click only when 4. Guard `a = 0` as 1 (HGSS can't reach it with real data).
- **Ball multipliers (tenths):** standard table `sStandardBallCatchRates` for item ids 2-5: Ultra 20, Great 15, Poké 10, Safari 15. Net 30 (Water or Bug, either type); Dive 35 (terrain water); Nest `40 − level` when level < 40, at least 10; Repeat 30 (species caught in the Pokédex); Timer `totalTurns + 10`, at most 40; Dusk 35 (night / late night or terrain cave); Quick 40 when `totalTurns < 1` (the first turn only); Premier, Luxury, Heal and the rest 10. Apricorn balls (HGSS only) skipped: not in our catalog.
- **Substitute / Fly / Dig:** no check in Gen 4's code: the ball reaches the Pokémon behind a Substitute or in a semi-invulnerable turn.
- **Trainer battle:** `BATTLE_TYPE_TRAINER` → deflect animation (state `CHECK_IF_TRAINER` ~6698), no shake roll.
- **FireRed ball use:** `BattleUseFunc_PokeBallEtc` (`src/item_use.c` 737): `IsPlayerPartyAndPokemonStorageFull` → bag message `gText_BoxFull` "The BOX is full." (`src/strings.c` 201), ball kept; else the ball is removed from the bag before the action, so a trainer-blocked ball is spent. `BattleScript_TrainerBallBlock` (`data/battle_scripts_2.s` 116): STRINGID_TRAINERBLOCKEDBALL, STRINGID_DONTBEATHIEF, `finishaction` (the turn is spent).
- **Heal Ball:** `MonSetCatchData` (`src/pokemon.c` 3709): full HP and no status (PP untouched). Friend Ball sets friendship 200 (not ours).

## mic-core map (looked up, don't re-read)

- `internal/world/battle.go`: `startWild` 90 (set `start.CatchFacts` here: `night(time.Now())` from `party.go` 262; `species_caught` from `p.pokedex`), `launch` 118, `battleChoice` 166 (sync `checkAction` 200, then `z.ask` goroutine with ctx → `Turn`), `usableInBattle` 298, `keepSpent` 311, `played` 322, `finish` 375, `saveOutcome` 451 (the outcome transaction).
- `internal/pokemon/box.go`: `AddCaught` 106 (unused so far; box 1-14, 0 = party; `freeBoxSlot` 133 starts at the current box, so `box != current` = FireRed's "BOX was full" variant), `LoadBoxes` (names), `ViewBox` 72. Box rows: queries in `mic-core/queries/pokemon.sql` (sqlc, `make sqlc`); no rename query yet (add `UpdateBoxPokemonNickname`).
- Party full + every box full check needs the DB: do it in `battleChoice`'s `z.ask` goroutine before `Turn` (refuse like `refuseChoice`). The client's "The BOX is full." text (FireRed `gText_BoxFull`) waits for M7 (no flag in the request yet).

## Tasks

### Contracts

- [x] `battle/v1` events: `BallThrown { ball, shakes (0-3), caught, blocked }` (blocked: a trainer's Pokémon; FireRed's `BattleScript_TrainerBallBlock` "The TRAINER blocked the BALL!" "Don't be a thief!").
- [x] `BattleResult.CAUGHT` (7); `BattleEnded.caught { species, nickname_pending, where: PARTY | BOX, box, box_full_before (FireRed's "BOX was full" variant), new_in_pokedex }`.
- [x] `BattleStart` facts the formula needs that `mic-battles` can't know: whether the wild species is already caught (Repeat Ball), night (Dusk Ball: the server's game clock, check what Phase 5 M11 uses for Eevee's day / night), cave terrain (from M3's terrain), water encounter (Dive Ball).
- [x] `party/v1` (or `world/v1`): `NameCaughtPokemon { name }` intent and its answer (D10).

### `mic-battles` (`src/catch.ts`, new)

- [x] Ball choice (the `item` action with a `BATTLE_USE_BALL` item), resolved before Showdown's turn (D6): `a` with the wild Pokémon's current HP, max HP, status and the species' catch rate; the ball's modifier (Master always catches); the four checks; `BallThrown`. Not caught: the turn is spent (M4's way) and the foe moves. Caught: the battle ends `CAUGHT` with the Pokémon's state (HP, status, PP, held item, D9).
- [x] Gen 4 checks to confirm in `pokeheartgold` (answers in Findings): four shake checks, Quick Ball's turn 1 only, Timer's turn count, Nest Ball under level 30, Dusk Ball's cave rule, Dive Ball's water rule, Heal Ball heals on catch, Substitute (can a ball catch behind one in Gen 4?), a semi-invulnerable target (Fly, Dig: Gen 4 still catches?). Write each answer here.
- [x] Trainer battles: `blocked` event, the ball spent or not as FireRed (check `BattleScript_TrainerBallBlock` and `PokeBallBattleUseFunc`; FireRed keeps the item? find it).

### `mic-core`

- [x] `BattleChoice`: a ball is refused when the party and every box are full (FireRed's bag text for it: grep `IsPlayerPartyAndPokemonStorageFull` in `src/item_use.c` and its string); balls spent from the bag, kept spent across a restart (`keepSpent`).
- [ ] Outcome `CAUGHT`: fill the caught data (ball, met level = its level, met location = the map's location, OT name / ID / gender = the player, friendship: species base, Luxury Ball's growth bonus noted for friendship gains, Heal Ball restores), then `pokemon.AddCaught` (party or box, D9); `pokedex.Catch` (and seen); one transaction with the rest of the outcome (party, items, money, Pickup).
- [ ] **Nickname** (D10): the just-caught Pokémon's reference stays on the player's active battle record until the answer; `NameCaughtPokemon` validates the name like the naming screen's limits (10 characters, the charmap) and renames it where it is (party or box); a restart before the answer asks again; cancel = keep the species name.

## Play It

- Throw POKé BALLs at a full-HP foe until one catches; it lands in the party with its ball shown in the summary; the Pokédex marks it caught.
- With a full party: it goes to the current box (BILL'S PC shows it). With every box full (SQL): balls refused.
- Master Ball always catches; Quick Ball on turn 1 catches far more often; Repeat Ball on a caught species (spot-check, not every ball: [testing effort](../../../../AGENTS.md#testing)).
- A ball in the room trainer's battle: blocked.
- Restart `mic-core` at the nickname question: asked again, the Pokémon already saved.

## Gotchas

- Go isn't installed on the host: build with `docker run --rm -v "$PWD":/repo -v pokeuniverse-go-mod:/go/pkg/mod -v pokeuniverse-go-build:/root/.cache/go-build -w /repo/mic-core golang:1.27-alpine sh -c "go build ./... && go vet ./internal/..."`; mic-battles: `cd mic-battles && npx tsc --noEmit`.

- Shakes shown are capped at 3 even though Gen 4 rolls four checks: 3 shakes with no click = broke free on the fourth.
