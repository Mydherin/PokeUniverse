# M4 Battle Engine in `mic-battles` ⬜

Part of the [battles plan](README.md). **Needs:** M3 ✅. Shared rules and context: [context.md](context.md).

**Read:** `mic-battles/src/{main,handlers,rules,config,log}.ts` (the small skeleton), `src/engine/ids.ts` (exports only: generated tables), `lib-contracts/proto/pokeuniverse/battle/v1/battle.proto`, `compose.yaml` (redis, mic-battles), `infra/` Redis ACL setup, `@pkmn/sim`'s `Battle` / `State` (serialize) and the request JSON.

- [ ] Contracts from [Contracts](#contracts-draft) (NATS and realtime); `make generate`.
- [ ] Redis user `mic-battles` limited to `battle:*` (compose, `.env.example`), and a Redis client in `mic-battles` (`redis` npm).
- [ ] `engine/`: create from `StartBattle` (teams from our enums via `ids.ts`, the seed), serialize with Showdown's own state serializer, play a turn from choices, and our `gen4customgame` mod for bag items (D12, write the chosen hook here).
- [ ] `protocol/`: Showdown log (with `|split|` per side) → `BattleEvent`s per side (D5); `|request|` → `BattleRequest` (moves with PP and disabled flags, trapped, force switch, can't-run).
- [ ] `store.ts`: Lua compare-and-set on `turn`; return the saved reply for a repeated turn.
- [ ] Handlers `battles.start`, `battles.turn`, `battles.forfeit`; the outcome when the battle ends; `exp.ts` (Gen 4: `floor(base_exp × level_fainted / 7)` × 1.5 trainer, split between participants; Exp. Share later).
- [ ] Temporary: a random AI for the NPC side until M5.
- **Done when:** a scripted NATS client (one-off, not committed) plays a whole battle, and replaying a turn returns the same reply.

## Contracts Draft

Field lists are the minimum.

- ✅ (M2, D16) `pokeuniverse.party.v1` (`party.proto`): `Pokemon`, `Party` (in `WorldSnapshot`), `SwapPartySlots`, `GivePartyItem`, `TakePartyItem`, `PartyChanged`; `pokemon/v1/pokemon.proto`: `Gender`, `Status`; `ItemOutcome` GIVEN, SWAPPED, TAKEN, NOT_HOLDING, REMOVE_MAIL.
- `pokeuniverse.battle.v1`:
  - NATS: `StartBattle{battle_id, kind, sides[{side, trainer (class, name text id), team[BattleMon full: species, level, nature, ability, item, ivs, evs, moves+pp, hp, status, gender, shiny, personality]}, ai_flags], seed}`; `StartReply`; `TurnRequest{battle_id, turn, choices[{side, action}]}`; `TurnReply{battle_id, turn, per_side[{events, request}], outcome?}`; `Forfeit{battle_id, side}`.
  - Client (in the realtime envelope): `BattleStarted{view, events, request}`, `BattleTurn{turn, events, request}`, `BattleEnded{outcome view}`; intent `BattleChoice{battle_id, turn, oneof action{move{slot (1-4), target}, switch{party_slot}, item{item, party_slot, move_slot}, run}}`.
  - `BattleEvent` oneof (singles first; every event has `side` and `slot` where relevant): `SendOut`, `Withdraw`, `MoveUsed{move, target, miss?}`, `Damage{hp | hp_bar, from (move, status, weather, item, ability, recoil, hazard…)}`, `Heal`, `Faint`, `Effectiveness{super, not_very, immune}`, `Critical`, `Status{status}`, `CureStatus`, `StatChange{stat, stages}`, `Volatile{kind, start/end}` (confusion, substitute, leech seed, …), `Weather{kind, start/upkeep/end}`, `SideCondition{kind, start/end}` (Stealth Rock, Spikes, Toxic Spikes, Reflect, Light Screen, Tailwind, Safeguard, Mist, Lucky Chant), `FieldCondition` (Trick Room, Gravity), `AbilityShown{ability}`, `ItemShown{item, consumed?}`, `Cant{reason}`, `Fail`, `Message{id, args}` (rare one-off texts by ID), `Exp{party_slot, gained}`, `LevelUp{party_slot, level, stats}`, `Money{amount}`, `TurnStart{turn}`.
- Every event maps to one **text template** (FireRed's `gBattleStringsTable` / expansion's Gen 4 strings), one **animation** (move, general or status anim) and **sounds**. The table lives in the client (`firered/battle/event-presentation.ts`), keyed by enums, never sent.

## Progress

Not started. While 🚧: tasks ticked above, then here the exact next step, files touched, build state, gotchas.
