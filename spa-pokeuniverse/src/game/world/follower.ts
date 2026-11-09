// The Pokémon walking behind the player as the client predicts it, the same for every art style:
// HeartGold's following Pokémon (map_object_follow.c), decided by mic-core (world/follower.go).
// Each predicted player step moves it onto the tile the player left, at the player's speed;
// a Correction, Warped or FollowerChanged puts it where the server says.

import type { Direction } from "@pokeuniverse/contracts/map/v1/map";
import type { Follower } from "@pokeuniverse/contracts/world/v1/world";
import { RUN_FRAMES, WALK_FRAMES } from "./avatar";
import { TILE } from "./map";
import { DELTAS } from "./rules";

export class FollowerModel {
  /** National Pokédex number; 0: no follower. */
  species = 0;
  shiny = false;
  x = 0;
  y = 0;
  facing = 0 as Direction;
  /** On the player's tile, not drawn until the player's next step. */
  hidden = true;
  /** The step under way: frames done of `frames`; null standing. */
  step: { t: number; frames: number; run: boolean } | null = null;

  constructor(f: Follower | undefined) {
    this.set(f);
  }

  /** Where mic-core has it; unset: no follower. */
  set(f: Follower | undefined): void {
    this.species = f?.species ?? 0;
    this.shiny = f?.shiny ?? false;
    this.x = f?.x ?? 0;
    this.y = f?.y ?? 0;
    this.facing = f?.facing ?? this.facing;
    this.hidden = f?.hidden ?? true;
    this.step = null;
  }

  /** The player started a step from (x, y): FollowPlayerMovement_StartFollowMonStep. */
  follow(x: number, y: number, run: boolean): void {
    if (this.x !== x || this.y !== y) {
      const dx = Math.sign(x - this.x);
      const dy = Math.sign(y - this.y);
      const d = (Object.keys(DELTAS).map(Number) as Direction[]).find((k) => DELTAS[k][0] === dx && DELTAS[k][1] === dy);
      if (d !== undefined) this.facing = d;
      this.x = x;
      this.y = y;
      this.step = { t: 0, frames: run ? RUN_FRAMES : WALK_FRAMES, run };
    }
    this.hidden = false;
  }

  /** One frame. */
  update(): void {
    if (this.step && ++this.step.t >= this.step.frames) this.step = null;
  }

  /** The world pixel of the cell it's drawn on (its top-left), mid-step included. */
  get pixelX(): number {
    return this.x * TILE - (DELTAS[this.facing]?.[0] ?? 0) * this.remaining;
  }

  get pixelY(): number {
    return this.y * TILE - (DELTAS[this.facing]?.[1] ?? 0) * this.remaining;
  }

  private get remaining(): number {
    return this.step ? ((this.step.frames - this.step.t) * TILE) / this.step.frames : 0;
  }
}
