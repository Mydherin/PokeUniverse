// The other players on the map as the client draws them, the same for every art style: no
// prediction, only what mic-core says (ZoneEvents). Each player keeps a queue of what it did and
// plays it one step at a time from where it stands, with FireRed's walk and run (phase 8 D8);
// its following Pokémon steps onto the tile it left, as the own player's does (D10).

import type { Direction, ClientMap } from "@pokeuniverse/contracts/map/v1/map";
import type { Gender } from "@pokeuniverse/contracts/trainer/v1/trainer";
import type { Follower, OtherPlayer, ZoneEvents } from "@pokeuniverse/contracts/world/v1/world";
import { RUN_FRAMES, WALK_FRAMES, type Action } from "./avatar";
import { FollowerModel } from "./follower";
import { elevationAt, TILE } from "./map";
import { DELTAS, elevationAfter } from "./rules";

/** What a player did, in the order mic-core sent it. */
type Queued =
  | { kind: "move"; x: number; y: number; facing: Direction; run: boolean }
  | { kind: "turn"; facing: Direction }
  | { kind: "follower"; follower: Follower | undefined };

/** More steps than this waiting: they play at running speed to catch up. */
const CATCH_UP = 2;

/** What the art style does as the players come, step and go. */
export interface OthersListener {
  joined(p: OtherPlayerModel): void;
  left(p: OtherPlayerModel): void;
  /** `p` started a step from (fromX, fromY); its follower already follows. */
  stepped(p: OtherPlayerModel, fromX: number, fromY: number): void;
  /** `p` (and its follower) are somewhere new without a step: joined, placed or a new follower. */
  placed(p: OtherPlayerModel): void;
  /** A line in the zone's chat, the own player's included; `name` is unset for the own player
   *  and for someone not on the map. */
  chat(id: bigint, name: string | undefined, text: string): void;
}

export class OtherPlayerModel {
  readonly id: bigint;
  readonly name: string;
  readonly gender: Gender;
  x: number;
  y: number;
  facing: Direction;
  /** In a battle (kept for Phase 9's social menu; drawn standing as anyone, D9). */
  inBattle: boolean;
  action: Action | null = null;
  readonly follower: FollowerModel;
  private readonly queue: Queued[] = [];
  private foot = 0;
  private elevation: number;
  private layerElevation: number;

  constructor(
    private readonly map: ClientMap,
    p: OtherPlayer,
  ) {
    this.id = p.id;
    this.name = p.name;
    this.gender = p.gender;
    this.x = p.x;
    this.y = p.y;
    this.facing = p.facing;
    this.inBattle = p.inBattle;
    this.follower = new FollowerModel(p.follower);
    this.elevation = this.layerElevation = elevationAt(map, p.x, p.y);
  }

  /** The same rule as the own player's (Avatar.overTiles). */
  get overTiles(): boolean {
    const e = this.layerElevation;
    return (e >= 4 && e <= 12 && e % 2 === 0) || e === 13 || e === 14;
  }

  get pixelX(): number {
    return this.x * TILE - DELTAS[this.facing][0] * this.remaining;
  }

  get pixelY(): number {
    return this.y * TILE - DELTAS[this.facing][1] * this.remaining;
  }

  private get remaining(): number {
    const a = this.action;
    if (!a || (a.kind !== "walk" && a.kind !== "run")) return 0;
    return ((a.frames - a.t) * TILE) / a.frames;
  }

  push(q: Queued): void {
    this.queue.push(q);
  }

  /** One frame: the step under way goes on, or the next queued ones start. */
  update(listener: OthersListener): void {
    this.follower.update();
    if (this.action && ++this.action.t >= this.action.frames) this.action = null;
    while (!this.action && this.queue.length) {
      const moves = this.queue.reduce((n, q) => n + (q.kind === "move" ? 1 : 0), 0);
      const q = this.queue.shift()!;
      switch (q.kind) {
        case "turn":
          this.facing = q.facing;
          break;
        case "follower":
          this.follower.set(q.follower);
          listener.placed(this);
          break;
        case "move":
          this.move(q, moves > CATCH_UP, listener);
      }
    }
  }

  private move(q: Extract<Queued, { kind: "move" }>, fast: boolean, listener: OthersListener): void {
    const dx = q.x - this.x;
    const dy = q.y - this.y;
    const d = (Object.keys(DELTAS).map(Number) as Direction[]).find((k) => k !== 0 && DELTAS[k][0] === dx && DELTAS[k][1] === dy);
    if (d === undefined) {
      // Not a neighbor (a correction, a long gap): placed there.
      this.x = q.x;
      this.y = q.y;
      this.facing = q.facing;
      this.elevation = this.layerElevation = elevationAt(this.map, q.x, q.y);
      listener.placed(this);
      return;
    }
    const { x: fromX, y: fromY } = this;
    this.facing = d;
    this.elevation = elevationAfter(this.map, this.elevation, fromX, fromY, q.x, q.y);
    if (this.elevation !== 0 && this.elevation !== 15) this.layerElevation = this.elevation;
    this.x = q.x;
    this.y = q.y;
    const run = q.run || fast;
    this.action = { kind: q.run ? "run" : "walk", t: 0, frames: run ? RUN_FRAMES : WALK_FRAMES, foot: this.foot };
    this.foot ^= 1;
    this.follower.follow(fromX, fromY, run);
    listener.stepped(this, fromX, fromY);
  }
}

/** Everyone else in the zone. */
export class Others {
  readonly players = new Map<bigint, OtherPlayerModel>();

  constructor(
    private readonly map: ClientMap,
    /** The own trainer's ID: its events are skipped (D7). */
    private readonly self: bigint,
    private readonly listener: OthersListener,
  ) {}

  /** A snapshot or a warp: they replace everyone. */
  fromSnapshot(others: OtherPlayer[]): void {
    this.clear();
    for (const p of others) this.join(p);
  }

  apply(z: ZoneEvents): void {
    for (const { event: e } of z.events) {
      if (!e.case) continue;
      // Chat comes back to its sender too (M5): read before the own player's events are skipped.
      if (e.case === "chat") {
        this.listener.chat(e.value.id, this.players.get(e.value.id)?.name, e.value.text);
        continue;
      }
      const id = e.case === "joined" ? e.value.player?.id : e.value.id;
      if (id === undefined || id === this.self) continue;
      const p = this.players.get(id);
      switch (e.case) {
        case "joined":
          this.join(e.value.player!);
          break;
        case "left":
          if (p) this.remove(p);
          break;
        case "moved":
          p?.push({ kind: "move", x: e.value.x, y: e.value.y, facing: e.value.facing, run: e.value.run });
          break;
        case "turned":
          p?.push({ kind: "turn", facing: e.value.facing });
          break;
        case "follower":
          p?.push({ kind: "follower", follower: e.value.follower });
          break;
        case "battle":
          if (p) p.inBattle = e.value.inBattle;
      }
    }
  }

  /** One frame for everyone, apart from the own player's. */
  update(): void {
    for (const p of this.players.values()) p.update(this.listener);
  }

  clear(): void {
    for (const p of [...this.players.values()]) this.remove(p);
  }

  private join(o: OtherPlayer): void {
    if (o.id === this.self) return;
    const old = this.players.get(o.id);
    if (old) this.remove(old);
    const p = new OtherPlayerModel(this.map, o);
    this.players.set(o.id, p);
    this.listener.joined(p);
    this.listener.placed(p);
  }

  private remove(p: OtherPlayerModel): void {
    this.players.delete(p.id);
    this.listener.left(p);
  }
}
