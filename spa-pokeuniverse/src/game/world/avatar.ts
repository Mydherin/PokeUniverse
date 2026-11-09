// The player as the client predicts it: FireRed's walking on foot, one frame at a time
// (field_player_avatar.c), the same for every art style. Every step is sent to mic-core, which
// checks it and corrects the client when it disagrees; the player then goes back where the server says.

import { Direction, TileBehavior, type ClientMap } from "@pokeuniverse/contracts/map/v1/map";
import { behaviorAt, elevationAt, TILE, warpAt } from "./map";
import { checkStep, Collision, DELTAS, elevationAfter } from "./rules";

/** Frames per action at 59.73 fps: a step walking (1 px a frame) or running (2), turning in place, bumping. */
export const WALK_FRAMES = 16;
export const RUN_FRAMES = 8;
const TURN_FRAMES = 8;
const BUMP_FRAMES = 32;

export type ActionKind = "walk" | "run" | "turn" | "bump" | "walkInPlace";

/** What the player is doing; `foot` is which half of the step animation it starts with. */
export interface Action {
  kind: ActionKind;
  t: number;
  frames: number;
  foot: number;
}

/** The buttons the player uses this frame. */
export interface AvatarInput {
  /** The held direction (up, then down, left, right win), or UNSPECIFIED. */
  direction: Direction;
  /** B held. */
  run: boolean;
  /** A pressed this frame. */
  check: boolean;
  /** START pressed this frame. */
  menu: boolean;
  /** SELECT pressed this frame. */
  select: boolean;
}

/** What the avatar tells the server, and the sounds it makes. */
export interface AvatarLink {
  move(step: number, direction: Direction, run: boolean, x: number, y: number): void;
  turn(direction: Direction): void;
  /** Going the way of the stair warp the player stands on. */
  warp(direction: Direction, x: number, y: number): void;
  interact(walkInto: boolean): void;
  /** START, standing still between steps: the START menu opens. */
  openMenu(): void;
  /** SELECT, standing still between steps: the item registered to it is used. */
  useRegistered(): void;
  bump(): void;
}

/** FireRed's runningState: a different direction turns in place only when not already moving. */
const enum Running {
  Still,
  Turning,
  Moving,
}

export class Avatar {
  x: number;
  y: number;
  facing: Direction;
  action: Action | null = null;
  /** Waiting for the server's answer to an interaction. */
  waiting = false;
  private elevation: number;
  /** The last elevation other than 0 and 15 (previousElevation): decides how the player is drawn. */
  private layerElevation: number;
  private running = Running.Still;
  private foot = 0;
  private step = 0;

  constructor(
    private readonly map: ClientMap,
    x: number,
    y: number,
    facing: Direction,
    private readonly canRun: boolean,
    private readonly link: AvatarLink,
  ) {
    this.x = x;
    this.y = y;
    this.facing = facing;
    this.elevation = this.layerElevation = elevationAt(map, x, y);
  }

  /**
   * Drawn over the tiles that cover characters (sElevationToPriority: sprite priority 1 or 0,
   * over BG1): on elevations 4, 6, 8, 10, 12, 13 and 14, e.g. beside a bed.
   */
  get overTiles(): boolean {
    const e = this.layerElevation;
    return (e >= 4 && e <= 12 && e % 2 === 0) || e === 13 || e === 14;
  }

  /** The world pixel of the cell the sprite is drawn on (its top-left), mid-step included. */
  get pixelX(): number {
    return this.x * TILE - DELTAS[this.facing][0] * this.remaining;
  }

  get pixelY(): number {
    return this.y * TILE - DELTAS[this.facing][1] * this.remaining;
  }

  /** Pixels left to walk to the current cell. */
  private get remaining(): number {
    const a = this.action;
    if (!a || (a.kind !== "walk" && a.kind !== "run")) return 0;
    return ((a.frames - a.t) * TILE) / a.frames;
  }

  /** One frame. While `locked` (a message, the connection down), the player stands still. */
  update(input: AvatarInput, locked: boolean): void {
    let arrived = false;
    if (this.action && ++this.action.t >= this.action.frames) {
      arrived = this.action.kind === "walk" || this.action.kind === "run";
      this.action = null;
    }
    if (this.action) return;
    if (locked || this.waiting) {
      this.running = Running.Still;
      return;
    }
    if (arrived && this.walkIntoSignpost(input.direction)) return;
    if (input.check) {
      this.waiting = true;
      this.link.interact(false);
      return;
    }
    if (input.menu) {
      this.running = Running.Still;
      this.link.openMenu();
      return;
    }
    if (input.select) {
      this.running = Running.Still;
      this.link.useRegistered();
      return;
    }
    this.decide(input);
  }

  /** The server put the player somewhere else (a correction, or a fresh snapshot). */
  snap(x: number, y: number, facing: Direction): void {
    this.x = x;
    this.y = y;
    this.facing = facing;
    this.elevation = this.layerElevation = elevationAt(this.map, x, y);
    this.action = null;
    this.running = Running.Still;
  }

  /** A step's animation on the spot: normal speed, or fast (a turn's), as the stairs do. */
  walkInPlace(fast: boolean): void {
    if (fast) this.start("turn", TURN_FRAMES);
    else this.start("walkInPlace", WALK_FRAMES);
  }

  /** CheckMovementInputNotOnBike and what follows it. */
  private decide({ direction: d, run }: AvatarInput): void {
    if (d === Direction.UNSPECIFIED) {
      this.running = Running.Still;
      return;
    }
    if (d !== this.facing && this.running !== Running.Moving) {
      this.running = Running.Turning;
      this.face(d);
      this.start("turn", TURN_FRAMES);
      return;
    }
    this.running = Running.Moving;
    switch (checkStep(this.map, this.x, this.y, this.elevation, d)) {
      case Collision.StairWarp:
        if (d === this.facing && warpAt(this.map, this.x, this.y)) {
          this.running = Running.Still;
          this.link.warp(d, this.x, this.y);
        } else this.face(d);
        return;
      case Collision.Blocked:
        this.face(d);
        this.link.bump();
        this.start("bump", BUMP_FRAMES);
        return;
      case Collision.None: {
        const running = run && this.canRun;
        this.facing = d;
        this.link.move(++this.step >>> 0, d, running, this.x, this.y);
        const [dx, dy] = DELTAS[d];
        this.elevation = elevationAfter(this.map, this.elevation, this.x, this.y, this.x + dx, this.y + dy);
        if (this.elevation !== 0 && this.elevation !== 15) this.layerElevation = this.elevation;
        this.x += dx;
        this.y += dy;
        this.start(running ? "run" : "walk", running ? RUN_FRAMES : WALK_FRAMES);
      }
    }
  }

  /** Walking up (or down) to a signpost reads it without A (TrySetUpWalkIntoSignpostScript). */
  private walkIntoSignpost(held: Direction): boolean {
    const d = this.facing;
    if ((d !== Direction.NORTH && d !== Direction.SOUTH) || (held !== Direction.UNSPECIFIED && held !== d)) return false;
    const [dx, dy] = DELTAS[d];
    if (behaviorAt(this.map, this.x + dx, this.y + dy) !== TileBehavior.SIGNPOST) return false;
    this.waiting = true;
    this.link.interact(true);
    return true;
  }

  private face(d: Direction): void {
    if (d === this.facing) return;
    this.facing = d;
    this.link.turn(d);
  }

  private start(kind: ActionKind, frames: number): void {
    this.action = { kind, t: 0, frames, foot: this.foot };
    // The walk animation alternates feet; a bump plays it whole and ends where it began.
    if (kind !== "bump") this.foot ^= 1;
  }
}
