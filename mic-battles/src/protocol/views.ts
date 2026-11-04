// The live battle as one side sees it: its request, the whole view (start, reconnect) and the
// outcome mic-core saves.

import type { MessageInitShape } from "@bufbuild/protobuf";
import type { Battle } from "@pkmn/sim";
import type { BattleOutcomeSchema, StartBattle } from "@pokeuniverse/contracts/battle/v1/battle";
import type { BattlerInfoSchema, HealthSchema } from "@pokeuniverse/contracts/battle/v1/event";
import { BattleResult, PartyBall, RequestKind, type BattleRequestSchema, type BattleViewSchema } from "@pokeuniverse/contracts/battle/v1/view";
import type { ShiftOffer } from "../engine/choices.ts";
import { moveOptions, partySlot, pokemonAt, positionsToChoose, statsOf, type Pokemon, type Side } from "../engine/battle.ts";
import { selfItemsWithNoEffect } from "../engine/bag.ts";
import { itemNumber, moveNumber, statusNumber, weatherNumber } from "../engine/lookup.ts";
import { levelSpan, seenBy, totalExp, type ExpState } from "../exp.ts";

/** Showdown keeps a fainted Pokémon's status; FireRed clears it. */
const status = (p: Pokemon) => statusNumber(p.fainted ? "" : p.status);

/** Exact HP for the viewer's own Pokémon; FireRed's 48-pixel bar for a foe's. */
export function health(pokemon: Pokemon, viewer: number): MessageInitShape<typeof HealthSchema> {
  if (pokemon.side.n === viewer) return { hp: pokemon.hp, maxHp: pokemon.maxhp };
  return { hp: pokemon.hp ? Math.floor((48 * pokemon.hp) / pokemon.maxhp) || 1 : 0, maxHp: 48 };
}

export function request(battle: Battle, start: StartBattle, exp: ExpState, side: number, step: number, shift?: ShiftOffer): MessageInitShape<typeof BattleRequestSchema> {
  const s = battle.sides[side];
  const req = s.activeRequest;
  const party = [...s.pokemon].sort((a, b) => partySlot(a) - partySlot(b)).map((p) => ({
    partySlot: partySlot(p),
    health: health(p, side),
    status: status(p),
    heldItem: itemNumber(p.item),
    pp: p.baseMoveSlots.map((m) => m.pp),
    active: p.isActive,
    level: p.level,
    exp: totalExp(start, exp, side, partySlot(p)),
    ...levelSpan(start.sides[side].pokemon[partySlot(p)], p.level),
    stats: statsOf(p),
    moves: p.baseMoveSlots.map((m) => moveNumber(m.id)),
    maxPp: p.baseMoveSlots.map((m) => m.maxpp),
  }));
  const pending = side === 0 ? exp.pending[0] : undefined;
  if (pending) return { kind: RequestKind.LEARN_MOVE, step, party, learn: { partySlot: pending.slot, move: pending.move } };
  if (shift && side === 0 && !battle.ended) return { kind: RequestKind.SHIFT, step, party, nextFoe: battlerInfo(start, pokemonAt(battle, 1, shift.slot), side) };
  if (!req || req.wait || battle.ended) return { kind: RequestKind.WAIT, step, party };
  const choosing = positionsToChoose(battle, s);
  if (req.forceSwitch) return { kind: RequestKind.SWITCH, step, party, positions: start.doubles ? choosing.map((position) => ({ position })) : [] };
  const positions = start.doubles ? choosing.map((position) => ({ position, ...moveChoice(s, position) })) : [];
  return { kind: RequestKind.ACTION, step, ...moveChoice(s, choosing[0] ?? 0), party, positions };
}

/** One active Pokémon's moves for FIGHT. */
function moveChoice(s: Side, position: number) {
  const options = moveOptions(s, position);
  const allowed = options?.moves ?? [];
  const struggle = allowed.length === 1 && allowed[0].id === "struggle";
  const moves = s.active[position].moveSlots.map((m) => ({
    move: moveNumber(m.id),
    pp: m.pp,
    maxPp: m.maxpp,
    disabled: struggle || m.pp === 0 || !!allowed.find((a: { id: string; disabled?: unknown }) => a.id === m.id)?.disabled,
  }));
  return { moves, trapped: !!(options?.trapped || options?.maybeTrapped), noEffectItems: selfItemsWithNoEffect(s.active[position]) };
}

export function battlerInfo(start: StartBattle, pokemon: Pokemon, viewer: number): MessageInitShape<typeof BattlerInfoSchema> {
  const side = pokemon.side.n;
  const mon = start.sides[side].pokemon[partySlot(pokemon)];
  return {
    battler: { foe: side !== viewer, partySlot: partySlot(pokemon), position: pokemon.position },
    species: mon.species,
    nickname: mon.nickname,
    level: pokemon.level,
    gender: mon.gender,
    shiny: mon.shiny,
    personality: mon.personality,
    health: health(pokemon, viewer),
    status: status(pokemon),
  };
}

export function view(battle: Battle, start: StartBattle, exp: ExpState, viewer: number, step: number, shift?: ShiftOffer): MessageInitShape<typeof BattleViewSchema> {
  const order = [viewer, ...start.sides.map((_, s) => s).filter((s) => s !== viewer)];
  return {
    battleId: start.battleId,
    kind: start.kind,
    doubles: start.doubles,
    sides: order.map((side) => ({
      foe: side !== viewer,
      active: battle.sides[side].active.filter((p) => p && !p.fainted).map((p) => battlerInfo(start, p, viewer)),
      balls: start.sides[side].pokemon.map((_, slot) => ball(pokemonAt(battle, side, slot))),
    })),
    weather: weatherNumber(battle.field.weather),
    request: request(battle, start, exp, viewer, step, shift),
  };
}

function ball(p: Pokemon): PartyBall {
  if (p.fainted || p.hp === 0) return PartyBall.FAINTED;
  return p.status ? PartyBall.STATUS : PartyBall.HEALTHY;
}

/** What each side keeps after the battle (D14), once it has ended. */
export function outcome(battle: Battle, start: StartBattle, exp: ExpState, forfeit?: number): MessageInitShape<typeof BattleOutcomeSchema> {
  return {
    sides: start.sides.map((team, side) => ({
      result: result(battle, side, forfeit),
      seen: seenBy(start, exp, side),
      pokemon: team.pokemon.map((_, slot) => {
        const p = pokemonAt(battle, side, slot);
        const gain = exp.gains[side][slot];
        const [hp, attack, defense, speed, spAttack, spDefense] = gain.evs;
        return {
          hp: p.hp,
          status: status(p),
          pp: p.baseMoveSlots.map((m) => m.pp),
          heldItem: itemNumber(p.item),
          exp: gain.exp,
          evs: { hp, attack, defense, speed, spAttack, spDefense },
          moves: p.baseMoveSlots.map((m) => moveNumber(m.id)),
        };
      }),
    })),
  };
}

function result(battle: Battle, side: number, forfeit?: number): BattleResult {
  if (forfeit !== undefined) return side === forfeit ? BattleResult.FORFEITED : BattleResult.FORFEIT_WON;
  if (!battle.winner) return BattleResult.TIE;
  return battle.winner === battle.sides[side].name ? BattleResult.WON : BattleResult.LOST;
}
