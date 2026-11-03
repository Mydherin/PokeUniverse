// Gen 4 experience, levels and EVs, which Showdown doesn't have. Like FireRed's
// gSentPokesToOpponent, each Pokémon on the field records which foes faced it; when it faints,
// those still standing share its experience and each gets its full EV yield, inside Showdown's
// own Faint event: a level up changes the Pokémon there and then, so what follows in the turn
// plays with its new stats. Its events go after the faint's line (translate.ts). A new move goes
// to a free slot, or waits for the player's answer: the battle doesn't go on, nor end, before it.
// mic-core checks and saves it all with the outcome.

import { create, getOption, type MessageInitShape } from "@bufbuild/protobuf";
import type { Battle } from "@pkmn/sim";
import { BattleEventSchema, type BattleEvent, type BattlerSchema } from "@pokeuniverse/contracts/battle/v1/event";
import type { BattleMon, StartBattle } from "@pokeuniverse/contracts/battle/v1/battle";
import { BattleKind } from "@pokeuniverse/contracts/battle/v1/view";
import { SpeciesSchema, info, type SpeciesInfo } from "@pokeuniverse/contracts/species/v1/catalog";
import { learnMove, moveSlotFree, partySlot, pokemonAt, setLevel, statsOf, type Pokemon } from "./engine/battle.ts";
import { moveNumber } from "./engine/lookup.ts";
import { expAt, MAX_LEVEL } from "./growth.ts";
import { parseIdent, parseLine } from "./protocol/line.ts";

const INFOS: SpeciesInfo[] = [];
for (const v of SpeciesSchema.values) if (v.number) INFOS[v.number] = getOption(v, info);

/** Six EVs in Stats order: HP, Attack, Defense, Speed, Sp. Atk, Sp. Def. */
export type Evs = [number, number, number, number, number, number];

/** Gen 4's EV caps: per stat and in all. */
const MAX_STAT_EV = 255;
const MAX_TOTAL_EV = 510;

/** A move waiting for the player's answer (RequestKind.LEARN_MOVE). */
export type PendingMove = { slot: number; move: number };

/** Saved with the battle (its meta). */
export type ExpState = {
  /** Party slots by side and position. */
  active: (number | null)[][];
  /** "side:slot" of a Pokémon → the other side's party slots that faced it. */
  faced: Record<string, number[]>;
  /** By side and party slot. */
  gains: { exp: number; evs: Evs }[][];
  /** Moves waiting for the player's answer, in the order they came. */
  pending: PendingMove[];
};

export function newExpState(start: StartBattle): ExpState {
  return {
    active: start.sides.map(() => []),
    faced: {},
    gains: start.sides.map((team) => team.pokemon.map(() => ({ exp: 0, evs: [0, 0, 0, 0, 0, 0] }))),
    pending: [],
  };
}

/** Wild and trainer battles give the player's side experience; PvP gives none. */
function gainsExp(start: StartBattle, side: number): boolean {
  return side === 0 && (start.kind === BattleKind.TRAINER || start.kind === BattleKind.WILD);
}

const key = (side: number, slot: number) => `${side}:${slot}`;

/** A Pokémon's total experience now. */
export function totalExp(start: StartBattle, state: ExpState, side: number, slot: number): number {
  return start.sides[side].pokemon[slot].exp + state.gains[side][slot].exp;
}

/** Its level's span, for the party view. */
export function levelSpan(mon: BattleMon, level: number): { levelExp: number; nextLevelExp: number } {
  const rate = INFOS[mon.species].growthRate;
  return { levelExp: expAt(rate, level), nextLevelExp: expAt(rate, Math.min(level + 1, MAX_LEVEL)) };
}

/** The species the other side has sent out, for the Pokédex. */
export function seenBy(start: StartBattle, state: ExpState, side: number): number[] {
  const other = 1 - side;
  return start.sides[other].pokemon.filter((_, slot) => key(other, slot) in state.faced).map((mon) => mon.species);
}

/** The experience of one battle object: created for each load, and it listens to that battle only. */
export class ExpTracker {
  /** Read so far of the log (cleared with each step's save). */
  private logRead = 0;
  /** Events waiting for the faint's line, by "side:slot" of the one who fainted. */
  private readonly awards = new Map<string, BattleEvent[]>();

  constructor(
    private readonly battle: Battle,
    private readonly start: StartBattle,
    readonly state: ExpState,
  ) {
    battle.onEvent("Faint", battle.format, (fainted: Pokemon) => this.faint(fainted));
  }

  /** The events a log line brings for a side: what its Pokémon earned from this faint. */
  after(line: string, side: number): BattleEvent[] {
    const parsed = parseLine(line);
    if (parsed.cmd !== "faint") return [];
    const id = parseIdent(parsed.args[0]);
    if (!id || 1 - id.side !== side) return [];
    const k = key(id.side, id.slot);
    const events = this.awards.get(k) ?? [];
    this.awards.delete(k);
    return events;
  }

  /** Everything the log says up to now about who is on the field. Call it before saving. */
  sync(): void {
    const { log } = this.battle;
    for (; this.logRead < log.length; this.logRead++) {
      const line = parseLine(log[this.logRead]);
      if (line.cmd === "switch" || line.cmd === "drag") this.switchedIn(line.args[0]);
    }
  }

  private switchedIn(ident: string | undefined): void {
    const id = parseIdent(ident);
    if (!id) return;
    const { active, faced } = this.state;
    const other = 1 - id.side;
    active[id.side][id.position] = id.slot;
    const facing = active[other].filter((s): s is number => s !== null);
    faced[key(id.side, id.slot)] = [...facing];
    for (const foe of facing) {
      const list = (faced[key(other, foe)] ??= []);
      if (!list.includes(id.slot)) list.push(id.slot);
    }
  }

  private faint(fainted: Pokemon): void {
    this.sync();
    const { battle, start, state } = this;
    const side = fainted.side.n;
    const slot = partySlot(fainted);
    const other = 1 - side;
    state.active[side][fainted.position] = null;
    // A fainted Pokémon gains nothing from the foes it faced.
    for (const [k, list] of Object.entries(state.faced)) {
      if (k.startsWith(`${other}:`)) state.faced[k] = list.filter((s) => s !== slot);
    }
    if (!gainsExp(start, other)) return;
    const participants = (state.faced[key(side, slot)] ?? []).filter((s) => pokemonAt(battle, other, s).hp > 0);
    const events: BattleEvent[] = [];
    for (const s of participants) events.push(...this.award(other, s, side, slot, participants.length));
    this.awards.set(key(side, slot), events);
  }

  /** Gen 4: ⌊⌊base exp × level ÷ 7⌋ ÷ participants⌋, × 1.5 traded, × 1.5 trainer, × 1.5 Lucky Egg. */
  private award(side: number, slot: number, foeSide: number, foeSlot: number, participants: number): BattleEvent[] {
    const { battle, start, state } = this;
    const foe = start.sides[foeSide].pokemon[foeSlot];
    const mon = start.sides[side].pokemon[slot];
    const pokemon = pokemonAt(battle, side, slot);
    const item = pokemon.item;
    const species = INFOS[foe.species];
    const gain = state.gains[side][slot];

    const y = species.evYield;
    const factor = item === "machobrace" ? 2 : 1;
    const startEvs = mon.evs;
    const evs = [startEvs?.hp, startEvs?.attack, startEvs?.defense, startEvs?.speed, startEvs?.spAttack, startEvs?.spDefense].map((v) => v ?? 0);
    let total = evs.reduce((a, b) => a + b, 0) + gain.evs.reduce((a, b) => a + b, 0);
    [y?.hp, y?.attack, y?.defense, y?.speed, y?.spAttack, y?.spDefense].forEach((v, i) => {
      const add = Math.min((v ?? 0) * factor, MAX_STAT_EV - evs[i] - gain.evs[i], MAX_TOTAL_EV - total);
      if (add > 0) {
        gain.evs[i] += add;
        total += add;
      }
    });

    // FireRed gives a Pokémon at level 100 no experience, and no message.
    if (pokemon.level >= MAX_LEVEL) return [];
    let exp = Math.floor(Math.floor((species.baseExp * foe.level) / 7) / participants);
    if (mon.traded) exp = Math.floor(exp * 1.5);
    if (start.kind === BattleKind.TRAINER) exp = Math.floor(exp * 1.5);
    if (item === "luckyegg") exp = Math.floor(exp * 1.5);
    exp = Math.max(exp, 1);
    return this.give(side, slot, exp, pokemon, mon);
  }

  /** The bar in stretches, one per level (Task_GiveExpWithExpBar), each level up with its moves. */
  private give(side: number, slot: number, amount: number, pokemon: Pokemon, mon: BattleMon): BattleEvent[] {
    const { state } = this;
    const gain = state.gains[side][slot];
    const rate = INFOS[mon.species].growthRate;
    const before = mon.exp + gain.exp;
    const top = expAt(rate, MAX_LEVEL);
    const after = Math.min(before + amount, top);
    gain.exp = after - mon.exp;
    const battler: MessageInitShape<typeof BattlerSchema> = { partySlot: slot, position: Math.max(0, state.active[side].indexOf(slot)) };
    const out: BattleEvent[] = [];
    const add = (kind: NonNullable<MessageInitShape<typeof BattleEventSchema>["kind"]>) => out.push(create(BattleEventSchema, { kind }));

    let shown = amount;
    for (;;) {
      const levelExp = expAt(rate, pokemon.level);
      const nextLevelExp = expAt(rate, pokemon.level + 1);
      const reaches = pokemon.level < MAX_LEVEL && after >= nextLevelExp;
      add({ case: "exp", value: { battler, amount: shown, exp: reaches ? nextLevelExp : after, levelExp, nextLevelExp } });
      shown = 0;
      if (!reaches) break;
      const was = statsOf(pokemon);
      setLevel(this.battle, pokemon, pokemon.level + 1, this.evsNow(mon, gain.evs));
      add({
        case: "levelUp",
        value: { battler, level: pokemon.level, health: { hp: pokemon.hp, maxHp: pokemon.maxhp }, before: was, stats: statsOf(pokemon) },
      });
      for (const lm of INFOS[mon.species].levelMoves) {
        if (lm.level !== pokemon.level || pokemon.baseMoveSlots.some((m) => moveNumber(m.id) === lm.move)) continue;
        if (moveSlotFree(pokemon)) {
          learnMove(pokemon, lm.move);
          add({ case: "moveLearned", value: { battler, move: lm.move } });
        } else state.pending.push({ slot, move: lm.move });
      }
      if (pokemon.level >= MAX_LEVEL) break;
    }
    return out;
  }

  private evsNow(mon: BattleMon, gained: Evs) {
    const s = mon.evs;
    return {
      hp: (s?.hp ?? 0) + gained[0],
      atk: (s?.attack ?? 0) + gained[1],
      def: (s?.defense ?? 0) + gained[2],
      spe: (s?.speed ?? 0) + gained[3],
      spa: (s?.spAttack ?? 0) + gained[4],
      spd: (s?.spDefense ?? 0) + gained[5],
    };
  }
}
