// A battle as the player sees it, the same for every art style (plans/battles M7): built from a
// BattleView, then changed by each BattleEvent as the screen plays it, and holding the request
// the player must answer. It decides nothing: mic-battles resolves, mic-core forwards.

import { clone } from "@bufbuild/protobuf";
import { BattlerInfoSchema, ConditionPhase, Weather, type BattleEvent, type Battler, type BattlerInfo } from "@pokeuniverse/contracts/battle/v1/event";
import { PartyBall, RequestKind, type BattleKind, type BattleRequest, type BattleTrainer, type BattleView, type PartyMember } from "@pokeuniverse/contracts/battle/v1/view";
import { Status } from "@pokeuniverse/contracts/pokemon/v1/pokemon";

/** One side of the field: its active Pokémon (null while one must be replaced) and its party's balls. */
export interface SideState {
  readonly foe: boolean;
  readonly active: (BattlerInfo | null)[];
  readonly balls: PartyBall[];
}

export class BattleState {
  readonly id: string;
  readonly kind: BattleKind;
  readonly trainer: BattleTrainer | undefined;
  /** The player's side, then the foe's. */
  readonly sides: readonly [SideState, SideState];
  weather: Weather;
  /** What the player must choose now; null while the server plays the last choice. */
  request: BattleRequest | null;

  constructor(view: BattleView) {
    this.id = view.battleId;
    this.kind = view.kind;
    this.trainer = view.trainer;
    const side = (foe: boolean): SideState => {
      const s = view.sides.find((x) => x.foe === foe);
      return { foe, active: s?.active.map((b) => clone(BattlerInfoSchema, b)) ?? [], balls: [...(s?.balls ?? [])] };
    };
    this.sides = [side(false), side(true)];
    this.weather = view.weather;
    this.request = view.request ?? null;
  }

  side(foe: boolean): SideState {
    return this.sides[foe ? 1 : 0];
  }

  /** The active Pokémon a Battler names, if it is still on the field. */
  battler(b: Battler | undefined): BattlerInfo | null {
    if (!b) return null;
    const mon = this.side(b.foe).active[b.position];
    return mon && mon.battler?.partySlot === b.partySlot ? mon : null;
  }

  /** The player's party as the battle has it now (HP, status, PP), from the last request. */
  get party(): readonly PartyMember[] {
    return this.request?.party ?? [];
  }

  /** The player must choose something (not WAIT). */
  get choosing(): boolean {
    const kind = this.request?.kind;
    return kind === RequestKind.ACTION || kind === RequestKind.SWITCH;
  }

  apply(e: BattleEvent): void {
    const k = e.kind;
    switch (k.case) {
      case "switchIn": {
        const info = k.value.pokemon;
        const b = info?.battler;
        if (!info || !b) return;
        this.side(b.foe).active[b.position] = clone(BattlerInfoSchema, info);
        return;
      }
      case "damage":
      case "heal":
      case "setHealth": {
        const mon = this.battler(k.value.battler);
        if (mon && k.value.health) mon.health = k.value.health;
        return;
      }
      case "faint": {
        const b = k.value.battler;
        if (!b) return;
        const side = this.side(b.foe);
        side.balls[b.partySlot] = PartyBall.FAINTED;
        const mon = this.battler(b);
        if (mon?.health) mon.health.hp = 0;
        side.active[b.position] = null;
        return;
      }
      case "statusSet": {
        const b = k.value.battler;
        const mon = this.battler(b);
        if (mon) mon.status = k.value.status;
        if (b) this.side(b.foe).balls[b.partySlot] = PartyBall.STATUS;
        return;
      }
      case "statusCured": {
        const b = k.value.battler;
        const mon = this.battler(b);
        if (mon) mon.status = Status.UNSPECIFIED;
        if (b) this.cureBall(this.side(b.foe), b.partySlot);
        return;
      }
      case "teamCured": {
        const b = k.value.battler;
        if (!b) return;
        const side = this.side(b.foe);
        side.balls.forEach((_, i) => this.cureBall(side, i));
        for (const mon of side.active) if (mon) mon.status = Status.UNSPECIFIED;
        return;
      }
      case "weatherChange":
        this.weather = k.value.phase === ConditionPhase.END ? Weather.UNSPECIFIED : k.value.weather;
        return;
    }
  }

  private cureBall(side: SideState, slot: number): void {
    if (side.balls[slot] === PartyBall.STATUS) side.balls[slot] = PartyBall.HEALTHY;
  }
}
