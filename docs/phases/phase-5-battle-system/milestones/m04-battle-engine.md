# M4 Battle Engine in `mic-battles` ✅

Part of [Phase 5](../phase-5-battle-system.md). Shared rules and context: [context.md](context.md). Done 2026-11-01; this file keeps what later milestones use.

## What Exists

| Piece | Where | Notes |
|---|---|---|
| Contracts | `lib-contracts/proto/pokeuniverse/battle/v1/`: `battle.proto` (NATS), `event.proto` (`BattleEvent`), `view.proto` (view, request, actions, client messages) | Realtime: client `battle_choice = 21`; server `battle_started = 12`, `battle_turn = 13`, `battle_ended = 14`; `WorldSnapshot.battle = 8` |
| Redis | `compose.yaml`: user `mic-battles` (`~battle:*`, no `@dangerous`), `REDIS_MIC_BATTLES_PASSWORD` (`.env.example`, `make env`) | Existing `.env` files need the variable (compose fails loudly without it) |
| Orchestration | `mic-battles/src/battles.ts` (start, turn, forfeit, view), `store.ts` (Lua save on `step`), `handlers.ts` | TTL: a week active, an hour once over |
| Engine | `src/engine/`: `battle.ts` (create, restore, serialize, `pokemonAt`, `moveOptions`), `choices.ts` (`applyChoice`, `advance`), `bag.ts` (D12 hook), `lookup.ts` (numbers ⇄ Showdown IDs, statuses, stats, weather, types) | |
| Protocol | `src/protocol/`: `line.ts` (parse), `effects.ts` (names → `Effect`), `events.ts` (lines → events), `translate.ts` (`|split|` per side), `views.ts` (request, view, outcome), `warn.ts` | |
| Exp | `src/exp.ts` | Gen 4: ⌊⌊base exp × L ÷ 7⌋ ÷ participants⌋ × 1.5 traded × 1.5 trainer × 1.5 Lucky Egg; full EV yield each (× 2 Macho Brace) |
| AI | `src/ai/random.ts` | Temporary: random usable move / random switch, from the battle's PRNG. **M5 replaces it** (called from `advance` in `choices.ts`) |

## Conventions (for M5-M7)

- **Showdown names = party slots** ("0"-"5"): idents (`p2a: 3`) give the party slot directly. Never switch by name (`switch 3` is a position): use `pokemon.position + 1`.
- **Sides:** 0 = the player who started, 1 = the opponent. Events are per side and relative: `Battler.foe`, `party_slot` (as the battle started), `position`.
- **HP:** own exact; foe's `Health{hp, max_hp: 48}` (FireRed's pixels, Showdown's Gen 4 `shared` HP).
- **`step`** (not the turn): each `BattleRequest` carries it; `TurnRequest.step` must match; `step - 1` answers the saved reply.
- **`BattleEvent.silent`:** Showdown's `[silent]`: update state, show nothing.
- **Request kinds:** WAIT, ACTION (moves with PP and `disabled`; all disabled → FIGHT is Struggle), SWITCH (forced). `party` carries every member's HP, status, item and PP each time: the client's battle party never drifts.
- **AI sides** = `BattleTeam.ai_flags` not empty. `advance` chooses for them and for locked moves; the AI chooses as soon as its request appears (it doesn't see the player's choice).
- **Unknown log lines/effects** log `battle log: …` once per process (`warnOnce`): the list of gaps.

## Checked

A one-off script (deleted) played whole battles through `Battles` with an in-memory store: carried-over HP, status and a fainted lead; Toxic, Sitrus Berry, Levitate, full paralysis, stat caps, Outrage locked and fatigue; exp split between two participants (610 each for a Lv 30 Gengar) and EVs; loss → LOST/WON; a repeated start and step return identical bytes; an invalid choice returns the same step with no events. The Lua save and the ACL were checked on a throwaway Redis (stale save → 0, other keys and FLUSHALL refused). **Not run:** the NATS round trip (mic-core uses it first in M6).

## Left for Later

- **M5:** real AI. **M6:** mic-core calls the subjects; decide the outcome rules (Toxic → poison after battle? Knock Off'd items back?).
- **M11:** `LevelUp` event, levels and stats changing mid-battle (Showdown keeps the start level). **M12:** bag item effects (`EFFECTS` in `bag.ts` is empty, so every item is refused for now), Exp. Share, Power items.
- Choice errors and unknown battles get no reply (mic-core times out): add an error reply if M6 needs one.
