# M5 Catching Rules ✅

Part of [Phase 7](../phase-7-wild-battles-catching.md). **Needs:** M4. Rules: [context.md](context.md) D6, D9, D10; [catch and balls](context.md#gen-4-rules-used-by-several-milestones).

**Done when:** every ball in the catalog can be thrown in a wild battle with Gen 4's formula and modifiers, the result (shakes, caught or not) comes as events, a catch is saved with the battle's outcome into the party or a box with its caught data, the Pokédex marks it caught, the nickname intent works, and trainer battles block balls. The client may show it with plain messages until M7.

## Resume Here

**Done 2026-11-09.** Every Play It line passed (session 2; results in step 5). Next: [M6](m06-wild-battle-screen.md). Not tested: Repeat Ball (spot-check skipped: Master and Quick passed), Dusk/Dive/Nest/Timer (formula only, from Findings). Gen 4 catch code found and written below (Findings). Contracts done (generated, `make contracts` passes): `BallThrown` (event 38), `BATTLE_RESULT_CAUGHT` 7, `BattleEnded.caught` (`CaughtPokemon`, `CaughtWhere`), `StartBattle.catch_facts` (`CatchFacts { species_caught[] by side-1 slot, night }`; cave and water come from `StartBattle.terrain`), `SideOutcome.caught_ball / caught_slot / caught`, `party.v1.NameCaughtPokemon { name }` (ClientMessage 37). Night: mic-core `world.night(t)` (`internal/world/party.go` 262). `mic-battles` done (`tsc --noEmit` passes): `src/engine/catch.ts` (`ballShakes`, `chooseBall`, `registerCatch` called from `registerExtras`; the `Ball` event, order 102 like bag items; our line `|ball|<user>|<ball>|<target>|<shakes>|caught/blocked`; `Extras.caught { slot, ball }` + `battle.tie()`), `engine/bag.ts` `isBall`, `engine/choices.ts` (item → `{ ball }` part, side 0 only), `protocol/views.ts` (`result` CAUGHT first; `monOutcome` helper; side 0's `caughtBall / caughtSlot / caught`, Heal Ball → max HP, no status), `protocol/events.ts` (`ball` → `ballThrown`). Pickup is `BattleWin` only in Gen 4 (`subscript_0004_BattleWin.s`): none after a catch (already so: `won` only). mic-core started (builds: `go build ./... && go vet ./internal/...` in `golang:1.27-alpine`, command in Gotchas): `pokedex.HasCaught` (`internal/pokedex/pokedex.go`), `battle.Caught(start, slot, out, ball, ot, mapID)` builds the saved Pokémon from side 1's `BattleMon` + `SideOutcome.caught` (`internal/battle/team.go`), `pokemon.StatsFrom` exported (was `statsFrom`).

**Exact next steps (mic-core, in order):**
1. ✅ `startWild` sets `start.CatchFacts`.
2. ✅ `battleChoice` refuses a ball with party and every box full (`throwsBall`, `errStorageFull`, `pokemon.StorageFull`).
3. ✅ Catch save (session 2): `finish` treats CAUGHT like RAN (not lost); `zone.caught` (`internal/world/battle.go`) builds it with `battle.Caught` (OT = new `Player.name` from `row.Name`) and marks the Pokédex before the transaction; `catch.add` runs `pokemon.AddCaught` inside `saveOutcome` (now returns `Placed{Place, Moved}`; box 1-14, proto `box` 0-13), box name from `LoadBoxes`, `saveNaming`; `BattleEnded.caught` filled; storage full = logged and dropped. Luxury Ball friendship already in `pokemon/item.go` 221.
4. ✅ Nickname (session 2): pending naming is a `trainers` column pair, not Redis (decision: saved in the catch's own transaction, so a crash can't lose it): migration `00017_add_trainer_naming.sql` (`naming_box` 0 = party / 1-14, `naming_slot`, both NULL = none), queries `UpdateTrainerNaming`, `UpdateBoxPokemonNickname`, `GetTrainer`/`PutTrainer` return them (PutTrainer clears). `internal/world/naming.go`: `askNaming` (join re-sends `BattleEnded{CAUGHT, caught.nickname_pending}`, no `battle_id`), `NameCaughtPokemon` → `nameCaught` (≤10 runes, valid UTF-8, no control chars; invalid = species name; party → `pokemon.Write` + `PartyChanged`, box → `UpdateBoxPokemonNickname`, no answer). Server has no charmap check anywhere (box names don't either): the client's naming screen limits the characters. Wired in `realtime.go`. Contract comment updated (`make contracts`).
5. Play It (session 2, in progress): passed so far: POKé BALL vs Rattata L3 broke free once (ball spent, turn spent), caught on the 2nd: result 7, party slot 4, ball, OT, met level/map, base friendship 70, `naming_box/slot` 0/4 ✓; `docker compose restart mic-core` re-sent `BattleEnded{CAUGHT, caught{species, pending, PARTY, slot 4}}` ✓; `NameCaughtPokemon{"RATTY"}` renamed it, cleared the column, sent `PartyChanged` ✓; Master Ball caught Wooper on the 1st throw ✓; empty name keeps the species name ✓; Quick Ball turn 1 caught Surskit into the current box (BOX5 slot 1, `BattleEnded.caught` BOX, box 4, its name, `box_full_before` false) ✓; box nickname "SKITTY" ✓; every box full (SQL fill): the ball is refused at once, stays in the bag (18), the foe doesn't move ✓; RUN after it: result 6 ✓. Test data restored (boxes, caught rows, pocket 3, naming, position 1F 10,5). ball in the 2F test trainer's battle: spent (5 → 4), the turn passes, Gengar stays (blocked) ✓ (the client shows no ball text until M7). Test data restored: party Snorlax 0 HP, Lucario, Charizard, Garchomp; 1F 10,5; no pocket-3 rows; test refresh token revoked.
   **Testing notes:** the browser pane is hidden in these sessions: reload `/play` with M3's recipe (rAF → setTimeout, fake ResizeObserver, re-import the bundle) and capture frames by wrapping rAF (`toDataURL` right after the frame). Sending a client message by hand: `NameCaughtPokemon` = bytes `aa 02 <len> 0a <n> <name>` on the open WebSocket (no seq needed).

**Build state:** `make sqlc`, `make contracts`, mic-core `go build ./... && go vet ./internal/...` pass; the stack runs with it (migration 17 applied).

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
- [x] Outcome `CAUGHT`: fill the caught data (ball, met level = its level, met location = the map's location, OT name / ID / gender = the player, friendship: species base, Luxury Ball's growth bonus noted for friendship gains, Heal Ball restores), then `pokemon.AddCaught` (party or box, D9); `pokedex.Catch` (and seen); one transaction with the rest of the outcome (party, items, money, Pickup).
- [x] **Nickname** (D10): the just-caught Pokémon's reference stays on the player's active battle record until the answer; `NameCaughtPokemon` validates the name like the naming screen's limits (10 characters, the charmap) and renames it where it is (party or box); a restart before the answer asks again; cancel = keep the species name.

## Play It

- Throw POKé BALLs at a full-HP foe until one catches; it lands in the party with its ball shown in the summary; the Pokédex marks it caught.
- With a full party: it goes to the current box (BILL'S PC shows it). With every box full (SQL): balls refused.
- Master Ball always catches; Quick Ball on turn 1 catches far more often; Repeat Ball on a caught species (spot-check, not every ball: [testing effort](../../../../AGENTS.md#testing)).
- A ball in the room trainer's battle: blocked.
- Restart `mic-core` at the nickname question: asked again, the Pokémon already saved.

## Gotchas

- Go isn't installed on the host: build with `docker run --rm -v "$PWD":/repo -v pokeuniverse-go-mod:/go/pkg/mod -v pokeuniverse-go-build:/root/.cache/go-build -w /repo/mic-core golang:1.27-alpine sh -c "go build ./... && go vet ./internal/..."`; mic-battles: `cd mic-battles && npx tsc --noEmit`.

- Shakes shown are capped at 3 even though Gen 4 rolls four checks: 3 shakes with no click = broke free on the fourth.

- The pending nickname points at a party slot or box slot: the client must not reorder the party or open the PC before answering (it doesn't in FireRed's flow); the server doesn't check it.
