// The box screen's hand (pokemon_storage_system_data.c): where it goes in each area, and how it
// gets there, carried over the screen's edges when it wraps.

import type { AnimCmd, Sprite, SpriteTemplate } from "../../gba/sprites";
import type { Flow } from "../flow";

export const enum Area {
  Party,
  Box,
  Title,
  Buttons,
}

export const BOX_COLUMNS = 6;
export const BOX_ROWS = 5;
export const BOX_SLOTS = BOX_COLUMNS * BOX_ROWS;
/** The party area's CLOSE BOX, after its six slots. */
export const PARTY_CLOSE = 6;
export const STORAGE_SPRITE_PALETTE = "storageMisc";

const STEPS = 6;
const STEPS_WRAPPING = 12;
const WRAP_DISTANCE = 192;
const MIN_X = 64;
const MAX_X = 256;
const MIN_Y = -16;
const MAX_Y = 176;

export const ANIM_BOUNCE = 0;
export const ANIM_STILL = 1;
/** The hand opening to take or let go of a Pokémon, and holding one. */
export const HAND_OPEN = 2;
export const HAND_FIST = 3;
/** MonPlaceChange_MoveCursorDown: how far the hand reaches down. */
const REACH = 8;
const CURSOR_ANIMS: AnimCmd[][] = [
  [{ image: 0, duration: 30 }, { image: 16, duration: 30 }, { jump: 0 }],
  [{ image: 0, duration: 5 }, "end"],
  [{ image: 32, duration: 5 }, "end"],
  [{ image: 48, duration: 5 }, "end"],
];

/** GetCursorCoordsByPos: the hand's place for a position (the buttons' is higher while it carries one). */
function target(area: Area, pos: number, holding: boolean): [number, number] {
  switch (area) {
    case Area.Box:
      return [24 * (pos % BOX_COLUMNS) + 100, 24 * Math.trunc(pos / BOX_COLUMNS) + 32];
    case Area.Party:
      if (pos === 0) return [104, 52];
      return pos === PARTY_CLOSE ? [152, 132] : [152, 24 * (pos - 1) + 4];
    case Area.Title:
      return [162, 12];
    case Area.Buttons:
      return [88 * pos + 120, holding ? 8 : 14];
  }
}

export interface CursorMove {
  area: Area;
  pos: number;
  /** The way round the screen: -1 or 1 on that axis. */
  wrapX?: number;
  wrapY?: number;
  /** The hand turns over halfway (moving between the box and the buttons). */
  flip?: boolean;
}

export class StorageCursor {
  area: Area;
  pos: number;
  /** sIsMonBeingMoved: the hand keeps its fist while it carries one. */
  holding = false;
  private readonly hand: Sprite;
  private readonly shadow: Sprite;
  private move: { to: CursorMove; x: number; y: number; dx: number; dy: number; steps: number; flipIn: number } | null = null;

  constructor(flow: Flow, area: Area, pos: number) {
    const { assets, gba } = flow;
    this.area = area;
    this.pos = pos;
    gba.sprites.loadSheet("storageCursor", assets.get("storageCursor").tiles);
    gba.sprites.loadSheet("storageCursorShadow", assets.get("storageCursorShadow").tiles);
    const [x, y] = target(area, pos, false);
    const hand: SpriteTemplate = { sheet: "storageCursor", palette: STORAGE_SPRITE_PALETTE, width: 32, height: 32, priority: 1, anims: CURSOR_ANIMS };
    const shadow: SpriteTemplate = { sheet: "storageCursorShadow", palette: STORAGE_SPRITE_PALETTE, width: 16, height: 16, priority: 2 };
    this.hand = gba.sprites.create(hand, x, y, 6)!;
    // FireRed's hand turns over through sprite->vFlip, which shows only when its animation runs:
    // a held Pokémon's fist never restarts, so it stays as it was.
    this.hand.latchFlip = true;
    this.shadow = gba.sprites.create(shadow, x, y + 20, 21)!;
    this.shadow.callback = (s) => {
      s.x = this.hand.x;
      s.y = this.hand.y + 20;
    };
    this.land();
    // CreateCursorSprites: the template's first animation, the bounce.
    this.hand.startAnim(ANIM_BOUNCE);
  }

  get moving(): boolean {
    return this.move !== null;
  }

  /** InitCursorMove: wrapping takes twice as long, and adds a screen to the distance. */
  moveTo(to: CursorMove): void {
    const [x, y] = target(to.area, to.pos, this.holding);
    const steps = to.wrapX || to.wrapY ? STEPS_WRAPPING : STEPS;
    const distX = x - this.hand.x + (to.wrapX ?? 0) * WRAP_DISTANCE;
    const distY = y - this.hand.y + (to.wrapY ?? 0) * WRAP_DISTANCE;
    this.move = {
      to,
      x: this.hand.x * 256,
      y: this.hand.y * 256,
      dx: Math.trunc((distX * 256) / steps),
      dy: Math.trunc((distY * 256) / steps),
      steps,
      // The hand stays turned over on the buttons; SetUpShowPartyMenu turns it back on the way
      // to the party (cursorFlipTimer = 1 while vFlip).
      flipIn: to.flip || (to.area === Area.Party && this.hand.vFlip) ? steps / 2 : 0,
    };
    if (!this.holding) this.hand.startAnim(ANIM_STILL);
    this.shadow.invisible = !(this.area === Area.Box && to.area === Area.Box);
  }

  /** UpdateCursorPos, each frame; true on the frame it arrives. */
  update(): boolean {
    const m = this.move;
    if (!m) return false;
    if (--m.steps === 0) {
      const [x, y] = target(m.to.area, m.to.pos, this.holding);
      this.hand.x = x;
      this.hand.y = y;
      this.area = m.to.area;
      this.pos = m.to.pos;
      this.move = null;
      this.land();
      return true;
    }
    m.x += m.dx;
    m.y += m.dy;
    if (m.x < MIN_X * 256) m.x += (MAX_X - MIN_X) * 256;
    else if (m.x > MAX_X * 256) m.x -= (MAX_X - MIN_X) * 256;
    if (m.y < MIN_Y * 256) m.y += (MAX_Y - MIN_Y) * 256;
    else if (m.y > MAX_Y * 256) m.y -= (MAX_Y - MIN_Y) * 256;
    this.hand.x = m.x >> 8;
    this.hand.y = m.y >> 8;
    if (m.flipIn && --m.flipIn === 0) this.hand.vFlip = !this.hand.vFlip;
    return false;
  }

  setHand(anim: number): void {
    this.hand.startAnim(anim);
  }

  /** MonPlaceChange_MoveCursorDown, each frame; false once it's down. */
  reachDown(): boolean {
    if (this.hand.y2 === REACH) return false;
    this.hand.y2++;
    return true;
  }

  /** MonPlaceChange_MoveCursorUp, each frame; false once it's up. */
  reachUp(): boolean {
    if (this.hand.y2 === 0) return false;
    this.hand.y2--;
    return true;
  }

  /** SpriteCB_HeldMon: where the held Pokémon's icon goes. */
  holdPoint(): [number, number] {
    return [this.hand.x, this.hand.y + this.hand.y2 + 4];
  }

  /** SpriteCB_ItemIcon_SetPosToCursor: where the held item's icon goes, and its priority. */
  itemPoint(): [number, number, number] {
    return [this.hand.x + 4, this.hand.y + this.hand.y2 + 8, this.hand.priority];
  }

  /** GetMonIconPriorityByCursorArea: under the hand in the box, over the party panel. */
  get iconPriority(): number {
    return this.area === Area.Box ? 2 : 1;
  }

  private land(): void {
    const inBox = this.area === Area.Box;
    // DoCursorNewPosUpdate: the still frame again, unless it carries one (the fist stays).
    if (!this.holding) this.hand.startAnim(ANIM_STILL);
    this.hand.priority = inBox ? 2 : 1;
    this.shadow.invisible = !inBox;
  }
}
