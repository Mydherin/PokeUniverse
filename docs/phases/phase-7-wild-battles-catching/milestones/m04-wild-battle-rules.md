# M4 Wild Battle Rules 🟡

Part of [Phase 7](../phase-7-wild-battles-catching.md). **Needs:** M3. Rules: [context.md](context.md) D5, D6, D8, D11; [escape, Pickup](context.md#gen-4-rules-used-by-several-milestones).

**Done when:** a wild battle plays to every ending the rules allow (won, lost, ran, the foe blown away or teleported), RUN and escape items work with Gen 4's rules, stolen items and Pickup items are kept, Pay Day pays, and a restart of either server resumes at the last turn. The client can show it with the trainer screen's texts until M6.

## Resume Here

**In progress: code written, not run yet.** `mic-battles`, `spa-pokeuniverse` (`npx tsc --noEmit`) and `mic-core` (`go build ./... && go vet` in `golang:1.27-alpine`, see Makefile `GO_CACHE`) build; `make contracts` and `make text` were run. Nothing is deployed or played.

**Next step:** rebuild and start the stack (`docker compose up -d --build mic-battles mic-core spa-pokeuniverse`, check the Makefile/compose names first), then do **Play It** in order. Browser helpers for the hidden pane: the shared notes `m3-playit-helpers.md` (start recipe, key sending, mirror canvas, SQL). Fix what fails, tick the tasks, then mark M4 ✅ and point Resume Here / **Now** at M5.

**How it's built (2026-11-09):**
- Turn spending: a bag item is an `event` action (`engine/bag.ts` `chooseBagItem`, order 102, answered by `registerBagItems`). RUN and escape items reuse it: `engine/wild.ts` `chooseRun` queues event `Run` (order 101) with `pokemon.m.run = {item}`; `registerExtras(battle, start, extras)` answers it (escape item → leaves; else `tryRun`; fail → our line `|escapefail|<mon>`). Registered in `createBattle` / `restoreBattle` (both now take `start, extras`).
- `Extras` (`runTries`, `left`, `payDay`) lives in `battles.ts` `Meta.extras` (JSON-saved; old battles get `newExtras()`); the listeners close over it.
- Leaving: `leave()` adds `|left|<mon>|<EscapeHow>|<item n>|<ability id>|<move n>` and calls `battle.tie()`; `protocol/views.ts` `result()` returns `RAN` when `extras.left`. `protocol/events.ts` turns `left` into `Escaped` (own side) or `WildFled` (other side), `escapefail` into `EscapeFailed`.
- `ModifyMove` listener: Pay Day (player side) wraps `onHit` to add level × 5; wild only: Teleport's `onTry` leaves unless `escapeBlock`, Roar/Whirlwind drop `forceSwitch` and their `onHit` runs `DragOut` + `whirlwindCheck` then leaves. `TakeItem` listener blocks Thief/Covet/Trick/Switcheroo by side 1 in trainer and wild battles (Gen 4 fix that also applies to trainer battles).
- `choices.ts` `toPart(battle, start, …)`: `run` refused unless wild and not `escapeBlock`; escape items (`bag.ts` `isEscapeItem`, catalog `BATTLE_USE_ESCAPE`) only in wild, no trap check. `applyChoice` now takes `start`.
- Request: `BattleRequest.escape` (`EscapeBlock {blocked, by_ability, foe}`) from `views.ts` `escapeOf`; the client (`battle/screen.ts` `chooseFor`) shows `sText_PreventsEscape` / `sText_CantEscape` and stays in the menu.
- Outcome: `SideOutcome.picked_up` (`wild.ts` `pickUp`, Pickup + Honey Gather, won only), `pay_day` (won only, × 2 with `double_prize`); `held_item` gives a knocked-off item back. `mic-core` `world/battle.go`: `checkAction` allows RUN / escape items only when `inBattle.wild()` (`Trainer == ""`); `finish`: `RAN` is neither won nor lost (no whiteout, no money), Pay Day added before the prize, `BattleEnded.pay_day`; `battle.Apply(…, wild, …)` keeps wild held items and gives Pickup finds.
- Client texts (M6 polishes the screen): `battle/messages.ts` cases `escaped`, `escapeFailed`, `wildFled`; 10 FireRed texts added to `texts.json` (escape, blown away, fled from battle, `sText_PkmnPickedUpItem` for M6's Pay Day message).

**Differences (reasons):** Pickup runs only after a won battle (Gen 4 `BattleWin` script, not "every battle" as context.md said); Pickup's TM56 / TM86 rolls give nothing (Gen 4 TMs not in our catalog); `EscapeFailed` has no `reason`: a trapped RUN is refused before the turn through the request (`EscapeBlock`), as FireRed refuses it in the menu; `kept_items` isn't a field: `MonOutcome.held_item` already carries it.

**Not done / to check in Play It:** `battle.tie()` called mid-move (Roar, Teleport) and mid-event (RUN): confirm no crash and the outcome arrives; the client's BattleEnded for `RAN` (fade back to the map); resume after `docker compose restart` (path is generic, untested for wild); Pay Day text on the client (M6).

**Files touched:** `lib-contracts/proto/pokeuniverse/battle/v1/{event,view,battle}.proto`, `item/v1/catalog.proto`; `mic-battles/src/{battles.ts,engine/wild.ts (new),engine/battle.ts,engine/choices.ts,engine/bag.ts,protocol/views.ts,protocol/events.ts}`; `mic-core/internal/{world/battle.go,battle/outcome.go}`; `spa-pokeuniverse/src/game/firered/{texts.json,battle/messages.ts,battle/screen.ts}`.

### Looked up (2026-11-09, don't re-read)

- **Escape roll** (`pokeheartgold` `src/battle/battle_util.c` `BattleTryRun` 2794): Smoke Ball (`HOLD_EFFECT_FLEE`) or Run Away escape; else faster or equal escapes, else `u8 run = speed·128/foeSpeed + tries·30` (**u8: wraps at 256**) `> rand % 256`; `runAttempts++` after every roll. Speeds are the stats without stages (Showdown `storedStats.spe`).
- **Can't escape** (`CantEscape` 2716): Smoke Ball, Run Away → never; else Shadow Tag (not on a Shadow Tag user), Arena Trap (grounded), Magnet Pull (Steel), then the moves. Showdown's `pokemon.trapped` already applies these; we only add the Smoke Ball / Run Away override and name the ability.
- **Poké Doll, Fluffy Tail** (`battle_controller_player.c` 1747): `BATTLE_SUBSCRIPT_ESCAPE_ITEM` with no trap check: they work while trapped.
- **Roar, Whirlwind** (`battle_command.c` `BtlCmd_TryWhirlwind` 3181, `battle_util.c` `WhirlwindCheck` 2621): in a wild battle they end it when `WhirlwindCheck` passes: attacker level ≥ target level, else `(rand & 0xFF)·(atkLv + defLv) >> 8) + 1 > defLv / 4`. Suction Cups and Ingrain still block (Showdown's `DragOut` event).
- **Teleport** (`BtlCmd_TryTeleport` 3750): fails when `CantEscape(attacker)`; trainer battles fail it. Showdown's Gen 4 Teleport is `onTry: false` (always fails).
- **Thief, Covet, Trick, Switcheroo** (`BtlCmd_TryStealItem` 3088, `BtlCmd_TrySwapItems` 3872): fail when the attacker is on side 1 outside link battles: a wild Pokémon (or an AI trainer's) never steals or swaps. The player's do, and in a wild battle what our Pokémon holds after it stays (Gen 4). Knock Off (Showdown sets `itemKnockedOff`): the item comes back after battle.
- **Pickup, Honey Gather** (`battle_command.c` `BtlCmd_GenerateEndOfBattleItem` 4745; tables in `asm/overlay_12_battle_command.s`): only in `subscript_0004_BattleWin.s` (a won battle, not ran or caught; FireRed's `BattleScript_PayDayMoneyAndPickUpItems` is also win only). Per party Pokémon with Pickup, no egg, no held item: `rand % 10 == 0`, `rnd = rand % 100`, `band = min((level − 1) / 10, 9)`; first `j` with `weights[j] > rnd` → `table1[band + j]`; `rnd` 98-99 → `table2[band + 99 − rnd]`. Weights `30 40 50 60 70 80 90 94 98`. table1: Potion, Antidote, Super Potion, Great Ball, Repel, Escape Rope, Full Heal, Hyper Potion, Ultra Ball, Revive, Rare Candy, Sun Stone, Moon Stone, Heart Scale, Full Restore, Max Revive, PP Up, Max Elixir. table2: Hyper Potion, Nugget, King's Rock, Full Restore, Ether, Iron Ball, TM56, Elixir, TM86, Leftovers, TM26. Honey Gather: no item, `rand % 100 < 5·band'` where band' = `ceil(level/10)` capped (5, 10 … 50) → Honey.
- **Pay Day** (FireRed `battle_script_commands.c` 2459, `Cmd_givepaydaymoney` 7064; HGSS `BtlCmd_AddPayDayMoney` in `BattleWin`): +level × 5 per hit by the player's side, paid on a win only, × the money multiplier (Amulet Coin: our `double_prize`). Not paid by Phase 5 before M4.
- **Exp**: `exp.ts` 198 gives ×1.5 to trainer battles only ✓.
- **mic-core `finish`** (`world/battle.go` 366): anything not won whited out; `battle.Apply` (`battle/outcome.go` 27) undoes held item changes except used up ones.

## Tasks

### Contracts (`battle/v1`)

- [x] `BattleAction.run` (check it exists; RUN is refused today in `choices.ts` ~71).
- [x] Events: `Escaped { how: NORMAL | ITEM | ABILITY, item, ability }`, `EscapeFailed { reason: SPEED | TRAPPED, by_ability, battler }`, `WildFled` (the foe teleports or is blown away), `PickedUp` is not an event (outcome only).
- [x] `SideOutcome`: `kept_items` (stolen with Thief / Covet, Trick: what each party slot holds after battle), `picked_up` (Pickup, per slot), `pay_day` (money).

### `mic-battles`

- [x] **Wild start:** side 1 is one wild Pokémon with no trainer and no flags (random AI already); escape tries and turn count in the saved state (Timer and Quick Balls in M5 read the turn).
- [x] **RUN** (D6), resolved before Showdown's turn as FireRed's `HandleAction_Run`:
  - Impossible (`IsRunningFromBattleImpossible` 3002): read our battler's `trapped` / `maybeTrapped` from Showdown (Gen 4's Shadow Tag, Arena Trap, Magnet Pull, Mean Look, Block, Spider Web, binding moves, Ingrain); Smoke Ball and Run Away override it. Refused with "Can't escape!" (or the ability's text, FireRed's `MULTISTRING_CHOOSER` 2) and the menu again, the turn not spent.
  - Roll (`TryRunFromBattle` 4229): the rule in context; tries counted even when faster. Success ends the battle (`BATTLE_RESULT_RAN`), failure spends the turn and the foe moves.
- [x] **Poké Doll, Fluffy Tail:** new `BATTLE_USE_ESCAPE` in the item catalog; refused in trainer battles; check in `pokeheartgold` whether Gen 4 lets them work while trapped (grep `ITEM_POKE_DOLL`). Their script: `gBattlescriptsForRunningByItem` → `BattleScript_UseFluffyTail`.
- [x] **Moves that end a wild battle** (Gen 4, single wild battle): Roar and Whirlwind by either side end it (the foe blown away, or the player's Pokémon); Teleport by the player escapes, by the foe flees; check each one's Gen 4 failure cases (trapped, Ingrain, Suction Cups, level check for Roar in Gen 4?) in `pokeheartgold`. Showdown fails them with no bench: hook them in our Gen 4 mod or in the log handling, and write which here.
- [x] **Items:** Thief / Covet on the wild Pokémon: the item stays with our Pokémon after battle (Gen 4); Trick / Switcheroo and Knock Off in wild battles: find Gen 4's rule; consumed items stay consumed (as trainer battles).
- [x] **Pay Day:** check whether Phase 5 pays it in trainer battles; same in wild ("<PLAYER> picked up ¥X!", `Cmd_givepaydaymoney` 7064).
- [x] **Pickup** (D5): at the battle's end, each party Pokémon with Pickup and no held item: 10%, Gen 4 table by level band (grep `ABILITY_PICKUP` in `pokeheartgold`, write the table and file here). Runs after every won, ran or caught battle as Gen 4 does (check: FireRed runs it in `BattleScript_PayDayMoneyAndPickUpItems`, only on a win).
- [x] **Exp:** check `exp.ts` gives wild battles ×1 and trainers ×1.5 (Gen 4).

### `mic-core`

- [x] `BattleChoice`: RUN allowed in wild battles (refused in trainer battles as now); escape items spent from the bag.
- [x] Outcome transaction (`world/battle.go` `finish`): `RAN` (party HP, status and PP kept, no money), kept items and Pickup items into the party's held items, Pay Day money; the follower comes back as after any battle.
- [x] **Wild whiteout:** the same `WhiteOutLoss` and respawn (D11); the client's text differs (M6).
- [ ] Resume: the active wild battle restarts from Redis like a trainer one (M6 of Phase 5); a reload with the game closed drops it as D22 says.

## Play It

- RUN from a slower foe (escapes), from a faster one (sometimes fails, the foe moves), with Run Away, with Smoke Ball held, against Mean Look or an Arena Trap foe (refused). Poké Doll escapes; in the room trainer's battle it's refused.
- Roar from our side ends the battle; Thief on the wild held item keeps it after the battle.
- Pickup on a Pokémon (SQL) over ~20 battles gets something.
- Lose on purpose: money lost, healed, back at the respawn.
- `docker compose restart mic-battles` and `mic-core` mid wild battle: it resumes.

## Gotchas

- Showdown has no "do nothing" choice for an active Pokémon: reuse whatever M12 does for bag items rather than inventing a second way.
