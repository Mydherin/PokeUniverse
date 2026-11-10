// FLDEFF_TALL_GRASS (field_effect_helpers.c FldEff_TallGrass, UpdateTallGrassFieldEffect): the
// grass drawn over the feet of the player and the follower (HeartGold's follower has it too) in a
// tall_grass cell. A step into one starts a blade that rustles, then stays over the feet; it goes
// once its walker left both that cell and the one it stepped from, its animation done.

import { TileBehavior, type ClientMap } from "@pokeuniverse/contracts/map/v1/map";
import { behaviorAt, TILE } from "../world/map";
import type { CharacterSheet, CharacterView, WorldView } from "../world/view";
import type { Assets } from "./manifest";
import { sheetOf } from "./player-sprite";

/** "player", "follower", or another player's: "other:<id>", "other-follower:<id>". */
export type Walker = string;

interface Cell {
  x: number;
  y: number;
}

interface Blade extends Cell {
  walker: Walker;
  /** Frames since it started. */
  t: number;
  view: CharacterView;
}

/** sAnim_TallGrass: frames 1, 2, 3, 4, then 0 (the grass at rest), 10 frames each, then it ends. */
const FRAME_FRAMES = 10;
const RUSTLE = [1, 2, 3, 4, 0];
const ANIM_FRAMES = RUSTLE.length * FRAME_FRAMES;
/** SeekSpriteAnim(sprite, 4): standing there from the start shows the grass at rest. */
const AT_REST = 4 * FRAME_FRAMES;

export class TallGrass {
  /** Drawn over the screen's fade, as the player is during Sweet Scent's. */
  overFade = false;
  private blades: Blade[] = [];
  private cachedSheet: CharacterSheet | null = null;
  private readonly at = new Map<Walker, { now: Cell | null; before: Cell | null }>();

  constructor(
    private readonly world: WorldView,
    private readonly assets: Assets,
    private readonly map: ClientMap,
  ) {}

  /**
   * GetGroundEffectFlags_TallGrassOnBeginStep: `walker` starts a step into (x, y). `spawned`
   * (OnSpawn): it stands there from the start, the grass at rest.
   */
  enter(walker: Walker, x: number, y: number, spawned = false): void {
    let at = this.at.get(walker);
    if (!at) this.at.set(walker, (at = { now: null, before: null }));
    at.before = spawned ? null : at.now;
    at.now = { x, y };
    if (behaviorAt(this.map, x, y) !== TileBehavior.TALL_GRASS) return;
    const view = this.world.addCharacter(this.sheet());
    view.setPosition(x * TILE, y * TILE);
    this.blades.push({ walker, x, y, t: spawned ? AT_REST : 0, view });
  }

  /** Gone from the map (a warp, a correction, no follower any more): its blades go. */
  forget(walker: Walker): void {
    this.at.delete(walker);
    this.blades = this.blades.filter((b) => b.walker !== walker || (b.view.destroy(), false));
  }

  /** One frame. */
  update(): void {
    this.blades = this.blades.filter((b) => {
      if (b.t < ANIM_FRAMES) b.t++;
      const { now, before } = this.at.get(b.walker) ?? { now: null, before: null };
      const left = !same(now, b) && !same(before, b);
      if (left && b.t >= ANIM_FRAMES) {
        b.view.destroy();
        return false;
      }
      b.view.setFrame(RUSTLE[Math.min(Math.floor(b.t / FRAME_FRAMES), RUSTLE.length - 1)], false);
      b.view.setOverFade(this.overFade);
      return true;
    });
  }

  destroy(): void {
    for (const b of this.blades) b.view.destroy();
    this.blades = [];
  }

  private sheet(): CharacterSheet {
    if (this.cachedSheet) return this.cachedSheet;
    const sheet = sheetOf("firered-tall-grass", this.assets.get("fxGeneral1Pal").palette, [[this.assets.get("fxTallGrass").image!, 0, RUSTLE.length]], TILE, TILE);
    // Over the feet of whoever stands on its cell.
    sheet.ahead = 1;
    return (this.cachedSheet = sheet);
  }
}

function same(a: Cell | null, b: Cell): boolean {
  return a !== null && a.x === b.x && a.y === b.y;
}
