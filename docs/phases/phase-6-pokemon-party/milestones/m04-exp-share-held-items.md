# M4 Exp. Share and Held Items ⬜

Part of [Phase 6](../phase-6-pokemon-party.md). Rules: [context.md](context.md).

**Done when:** an Exp. Share holder gains its share in battle, and held items that matter outside battle work.

## Resume Here

Not started. First step: read FireRed's `HOLD_EFFECT_` uses outside battle (below) and write the list here.

## Tasks

- [ ] **Exp. Share:** in `mic-battles/src/exp.ts`: participants split half, holders split half (Gen 4; check Showdown or the references for the exact rounding). No holder: unchanged. The bench holder's EVs, exp bar message and level up already exist from M11.
- [ ] **Held items outside battle:** make the list, then build each that has a system today. Known: Soothe Bell in `pokemon/battle.go:98` (friendship gain, covered for battles); friendship from walking needs checking; Everstone done in M11.
- [ ] **Play it,** then the [regression check](context.md#playing-a-milestone).

## Play It

- Give Exp. Share to a benched Pokémon, win: "<Pokémon> gained X EXP. Points!" for it, half and half. Two holders; holder in battle; holder fainted: no exp.
- With no Exp. Share, the same battle's numbers don't change.
- A held-item effect from the list, for each one built.

## What's Known

- `exp.ts`: line 140 `participants` are those who faced the foe and still stand; line 147 `award(side, slot, foeSide, foeSlot, participants)`; line 171 the Gen 4 formula; Lucky Egg at 174, Macho Brace at 157. `ExpTracker` per battle.
- **Cleanse Tag** goes to Phase 7: it acts on wild encounters only (`wild_encounter.c:655`).
- To list the rest: `grep -n "HOLD_EFFECT_\|ITEM_" references/pokefirered/src/pokemon.c`, and any other `HOLD_EFFECT` user outside `battle*.c` (only `pokemon.c` and `wild_encounter.c` use them).

## Files

`mic-battles/src/exp.ts`, `mic-core/internal/pokemon/battle.go`, `mic-core/internal/world/` (if walking matters).
