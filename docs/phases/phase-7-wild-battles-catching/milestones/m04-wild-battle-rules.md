# M4 Wild Battle Rules ⬜

Part of [Phase 7](../phase-7-wild-battles-catching.md). **Needs:** M3. Rules: [context.md](context.md) D5, D6, D8, D11; [escape, Pickup](context.md#gen-4-rules-used-by-several-milestones).

**Done when:** a wild battle plays to every ending the rules allow (won, lost, ran, the foe blown away or teleported), RUN and escape items work with Gen 4's rules, stolen items and Pickup items are kept, Pay Day pays, and a restart of either server resumes at the last turn. The client can show it with the trainer screen's texts until M6.

## Resume Here

**Not started.** First step: read how Phase 5 M12 spends a turn on a bag item (`mic-battles/src/engine/choices.ts`, the `item` case, and where its result is applied): failed RUN and failed balls (M5) spend the turn the same way. Write here how it works before building.

## Tasks

### Contracts (`battle/v1`)

- [ ] `BattleAction.run` (check it exists; RUN is refused today in `choices.ts` ~71).
- [ ] Events: `Escaped { how: NORMAL | ITEM | ABILITY, item, ability }`, `EscapeFailed { reason: SPEED | TRAPPED, by_ability, battler }`, `WildFled` (the foe teleports or is blown away), `PickedUp` is not an event (outcome only).
- [ ] `SideOutcome`: `kept_items` (stolen with Thief / Covet, Trick: what each party slot holds after battle), `picked_up` (Pickup, per slot), `pay_day` (money).

### `mic-battles`

- [ ] **Wild start:** side 1 is one wild Pokémon with no trainer and no flags (random AI already); escape tries and turn count in the saved state (Timer and Quick Balls in M5 read the turn).
- [ ] **RUN** (D6), resolved before Showdown's turn as FireRed's `HandleAction_Run`:
  - Impossible (`IsRunningFromBattleImpossible` 3002): read our battler's `trapped` / `maybeTrapped` from Showdown (Gen 4's Shadow Tag, Arena Trap, Magnet Pull, Mean Look, Block, Spider Web, binding moves, Ingrain); Smoke Ball and Run Away override it. Refused with "Can't escape!" (or the ability's text, FireRed's `MULTISTRING_CHOOSER` 2) and the menu again, the turn not spent.
  - Roll (`TryRunFromBattle` 4229): the rule in context; tries counted even when faster. Success ends the battle (`BATTLE_RESULT_RAN`), failure spends the turn and the foe moves.
- [ ] **Poké Doll, Fluffy Tail:** new `BATTLE_USE_ESCAPE` in the item catalog; refused in trainer battles; check in `pokeheartgold` whether Gen 4 lets them work while trapped (grep `ITEM_POKE_DOLL`). Their script: `gBattlescriptsForRunningByItem` → `BattleScript_UseFluffyTail`.
- [ ] **Moves that end a wild battle** (Gen 4, single wild battle): Roar and Whirlwind by either side end it (the foe blown away, or the player's Pokémon); Teleport by the player escapes, by the foe flees; check each one's Gen 4 failure cases (trapped, Ingrain, Suction Cups, level check for Roar in Gen 4?) in `pokeheartgold`. Showdown fails them with no bench: hook them in our Gen 4 mod or in the log handling, and write which here.
- [ ] **Items:** Thief / Covet on the wild Pokémon: the item stays with our Pokémon after battle (Gen 4); Trick / Switcheroo and Knock Off in wild battles: find Gen 4's rule; consumed items stay consumed (as trainer battles).
- [ ] **Pay Day:** check whether Phase 5 pays it in trainer battles; same in wild ("<PLAYER> picked up ¥X!", `Cmd_givepaydaymoney` 7064).
- [ ] **Pickup** (D5): at the battle's end, each party Pokémon with Pickup and no held item: 10%, Gen 4 table by level band (grep `ABILITY_PICKUP` in `pokeheartgold`, write the table and file here). Runs after every won, ran or caught battle as Gen 4 does (check: FireRed runs it in `BattleScript_PayDayMoneyAndPickUpItems`, only on a win).
- [ ] **Exp:** check `exp.ts` gives wild battles ×1 and trainers ×1.5 (Gen 4).

### `mic-core`

- [ ] `BattleChoice`: RUN allowed in wild battles (refused in trainer battles as now); escape items spent from the bag.
- [ ] Outcome transaction (`world/battle.go` `finish`): `RAN` (party HP, status and PP kept, no money), kept items and Pickup items into the party's held items, Pay Day money; the follower comes back as after any battle.
- [ ] **Wild whiteout:** the same `WhiteOutLoss` and respawn (D11); the client's text differs (M6).
- [ ] Resume: the active wild battle restarts from Redis like a trainer one (M6 of Phase 5); a reload with the game closed drops it as D22 says.

## Play It

- RUN from a slower foe (escapes), from a faster one (sometimes fails, the foe moves), with Run Away, with Smoke Ball held, against Mean Look or an Arena Trap foe (refused). Poké Doll escapes; in the room trainer's battle it's refused.
- Roar from our side ends the battle; Thief on the wild held item keeps it after the battle.
- Pickup on a Pokémon (SQL) over ~20 battles gets something.
- Lose on purpose: money lost, healed, back at the respawn.
- `docker compose restart mic-battles` and `mic-core` mid wild battle: it resumes.

## Gotchas

- Showdown has no "do nothing" choice for an active Pokémon: reuse whatever M12 does for bag items rather than inventing a second way.
