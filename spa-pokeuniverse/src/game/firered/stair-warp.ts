// FireRed's stair transition (field_fadetransition.c): the sprite climbs or descends off its cell
// walking in place while the world fades to black (Task_StairWarp), and arrives the same way
// while the world fades in (Task_ExitStairs). Only the sprite moves; the camera stays put.

import { TileBehavior } from "@pokeuniverse/contracts/map/v1/map";
import { PALETTES_ALL } from "../gba/palette";
import { RGB_BLACK } from "../gba/video";
import type { Avatar } from "../world/avatar";
import type { Flow } from "./flow";
import type { PlayerSprite } from "./player-sprite";

/** Leaving: frames before the fade starts, and before the sprite starts moving up. */
const FADE_AT = 12;
const RISE_AFTER = 6;
/** Arriving: frames the sprite takes to reach its cell. */
const ARRIVE_FRAMES = 16;
/** Offsets are kept in 1/32 of a pixel. */
const OFFSET_SHIFT = 5;

/** GetStairsMovementDirection: the sprite's speed on a stair tile. */
function stairSpeed(behavior: TileBehavior): readonly [x: number, y: number] {
  switch (behavior) {
    case TileBehavior.UP_RIGHT_STAIR_WARP:
      return [16, -10];
    case TileBehavior.UP_LEFT_STAIR_WARP:
      return [-17, -10];
    case TileBehavior.DOWN_RIGHT_STAIR_WARP:
      return [17, 3];
    case TileBehavior.DOWN_LEFT_STAIR_WARP:
      return [-17, 3];
    default:
      return [0, 0];
  }
}

/** Task_StairWarp: SE_EXIT, over the tiles, walking in place until the screen is black. */
export class LeavingStairs {
  private readonly speed: readonly [number, number];
  private offX = 0;
  private offY = 0;
  private timer = 0;
  private fading = false;

  constructor(
    private readonly flow: Flow,
    private readonly avatar: Avatar,
    private readonly sprite: PlayerSprite,
    behavior: TileBehavior,
  ) {
    this.speed = stairSpeed(behavior);
    flow.play("se_exit");
    sprite.forceOver = true;
    avatar.walkInPlace(false);
  }

  /** One frame; true once the screen is black. */
  update(): boolean {
    const { palettes } = this.flow.gba;
    if (this.fading && !palettes.fadeActive) return true;
    const [speedX, speedY] = this.speed;
    if (speedY > 0 || this.timer > RISE_AFTER) this.offY += speedY;
    this.offX += speedX;
    this.timer++;
    this.sprite.offsetX = this.offX >> OFFSET_SHIFT;
    this.sprite.offsetY = this.offY >> OFFSET_SHIFT;
    if (!this.avatar.action) this.avatar.walkInPlace(false);
    if (this.timer === FADE_AT) {
      palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
      this.fading = true;
    }
    return false;
  }
}

/** Task_ExitStairs: one fast walk in place into the cell; the world fades in meanwhile. */
export class ArrivingStairs {
  private readonly speed: readonly [number, number];
  private offX: number;
  private offY: number;
  private frames = ARRIVE_FRAMES;

  constructor(
    private readonly flow: Flow,
    avatar: Avatar,
    private readonly sprite: PlayerSprite,
    behavior: TileBehavior,
  ) {
    this.speed = stairSpeed(behavior);
    this.offX = this.speed[0] * ARRIVE_FRAMES;
    this.offY = this.speed[1] * ARRIVE_FRAMES;
    this.apply();
    avatar.walkInPlace(true);
  }

  /** One frame; true once the sprite is on its cell and the fade ended. */
  update(): boolean {
    if (this.frames > 0) {
      this.frames--;
      this.offX -= this.speed[0];
      this.offY -= this.speed[1];
      this.apply();
    }
    return this.frames === 0 && !this.flow.gba.palettes.fadeActive;
  }

  private apply(): void {
    this.sprite.offsetX = this.offX >> OFFSET_SHIFT;
    this.sprite.offsetY = this.offY >> OFFSET_SHIFT;
  }
}
