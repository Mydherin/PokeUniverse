// The movement rules the client predicts with: the same as mic-core's
// (mic-core/internal/world/rules.go), which checks every step. Keep both in step.
// FireRed on foot: field_player_avatar.c, CheckForObjectEventCollision.

import { Direction, TileBehavior, type ClientMap } from "@pokeuniverse/contracts/map/v1/map";
import { behaviorAt, elevationAt, isWalkable, npcAt } from "./map";

export const enum Collision {
  None,
  /** A wall, the map's edge, a one-way tile or another elevation: the player bumps. */
  Blocked,
  /** On a stair warp's tile, going its way: the player takes the warp, or only turns if the tile has none. */
  StairWarp,
}

export const DELTAS: Record<Direction, [number, number]> = {
  [Direction.UNSPECIFIED]: [0, 0],
  [Direction.NORTH]: [0, -1],
  [Direction.SOUTH]: [0, 1],
  [Direction.WEST]: [-1, 0],
  [Direction.EAST]: [1, 0],
};

const OPPOSITE: Record<Direction, Direction> = {
  [Direction.UNSPECIFIED]: Direction.UNSPECIFIED,
  [Direction.NORTH]: Direction.SOUTH,
  [Direction.SOUTH]: Direction.NORTH,
  [Direction.WEST]: Direction.EAST,
  [Direction.EAST]: Direction.WEST,
};

const IMPASSABLE: Partial<Record<Direction, TileBehavior>> = {
  [Direction.NORTH]: TileBehavior.IMPASSABLE_NORTH,
  [Direction.SOUTH]: TileBehavior.IMPASSABLE_SOUTH,
  [Direction.WEST]: TileBehavior.IMPASSABLE_WEST,
  [Direction.EAST]: TileBehavior.IMPASSABLE_EAST,
};

/** What stops a step from (x, y) in direction d, at the player's elevation. NPCs block their cell. */
export function checkStep(map: ClientMap, x: number, y: number, elevation: number, d: Direction): Collision {
  const here = behaviorAt(map, x, y);
  if (isStairWarp(here, d)) return Collision.StairWarp;
  const [dx, dy] = DELTAS[d];
  const tx = x + dx;
  const ty = y + dy;
  if (
    !isWalkable(map, tx, ty) ||
    npcAt(map, tx, ty) ||
    here === IMPASSABLE[d] ||
    behaviorAt(map, tx, ty) === IMPASSABLE[OPPOSITE[d]] ||
    elevationMismatch(elevation, elevationAt(map, tx, ty))
  )
    return Collision.Blocked;
  return Collision.None;
}

/** The elevation after stepping from one cell to the next: elevation 15 cells keep the previous one. */
export function elevationAfter(map: ClientMap, elevation: number, fx: number, fy: number, tx: number, ty: number): number {
  const cur = elevationAt(map, tx, ty);
  const prev = elevationAt(map, fx, fy);
  return cur !== 15 && prev !== 15 ? cur : elevation;
}

/** Elevations 0 and 15 connect to every elevation. */
function elevationMismatch(current: number, target: number): boolean {
  return current !== 0 && target !== 0 && target !== 15 && target !== current;
}

function isStairWarp(b: TileBehavior, d: Direction): boolean {
  if (d === Direction.WEST) return b === TileBehavior.UP_LEFT_STAIR_WARP || b === TileBehavior.DOWN_LEFT_STAIR_WARP;
  if (d === Direction.EAST) return b === TileBehavior.UP_RIGHT_STAIR_WARP || b === TileBehavior.DOWN_RIGHT_STAIR_WARP;
  return false;
}
