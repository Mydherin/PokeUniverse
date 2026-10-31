// The bouncing red arrows that say a list or a choice goes on (menu_indicators.c): a pair,
// up/down or left/right, each hidden while the value it watches is at its end.

import type { Sprite, SpriteTemplate } from "../gba/sprites";
import type { Task } from "../gba/tasks";
import { SIN } from "../gba/trig";
import type { Flow } from "./flow";

export const enum ScrollArrow {
  Left,
  Right,
  Up,
  Down,
}

/** Per arrow: its frame (flipped from the left and up ones), the bounce axis and speed. */
const ARROWS: Record<ScrollArrow, { anim: number; vertical: boolean; frequency: number }> = {
  [ScrollArrow.Left]: { anim: 0, vertical: false, frequency: 8 },
  [ScrollArrow.Right]: { anim: 1, vertical: false, frequency: -8 },
  [ScrollArrow.Up]: { anim: 2, vertical: true, frequency: 8 },
  [ScrollArrow.Down]: { anim: 3, vertical: true, frequency: -8 },
};
const BOUNCE = 2;

const S_STATE = 0;
const S_ANIM = 1;
const S_VERTICAL = 2;
const S_FREQUENCY = 3;
const S_SINE = 4;

/** SpriteCallback_ScrollIndicatorArrow: the arrow's frame, then a sine bounce of 2 pixels. */
function bounce(sprite: Sprite): void {
  const d = sprite.data;
  if (d[S_STATE] === 0) {
    sprite.startAnim(d[S_ANIM]);
    d[S_STATE]++;
    return;
  }
  const offset = Math.trunc((SIN[d[S_SINE] & 0xff] * BOUNCE) / 256);
  if (d[S_VERTICAL]) sprite.y2 = offset;
  else sprite.x2 = offset;
  d[S_SINE] += d[S_FREQUENCY];
}

const ARROW_TEMPLATE: Omit<SpriteTemplate, "sheet" | "palette"> = {
  width: 16,
  height: 16,
  priority: 0,
  anims: [
    [{ image: 0, duration: 30 }, "end"],
    [{ image: 0, duration: 30, hFlip: true }, "end"],
    [{ image: 4, duration: 30 }, "end"],
    [{ image: 4, duration: 30, vFlip: true }, "end"],
  ],
  callback: bounce,
};

export interface ScrollArrowsTemplate {
  first: ScrollArrow;
  firstX: number;
  firstY: number;
  second: ScrollArrow;
  secondX: number;
  secondY: number;
  /** The first arrow hides at this value, the second at `fullyDown`. */
  fullyUp: number;
  fullyDown: number;
  /** Sheet and palette tag. */
  tag: string;
}

/** AddScrollIndicatorArrowPair: the arrows follow `value` every frame from a task. */
export class ScrollArrowPair {
  private readonly first: Sprite | null;
  private readonly second: Sprite | null;
  private readonly task: Task;

  constructor(
    private readonly flow: Flow,
    private readonly t: ScrollArrowsTemplate,
    value: () => number,
  ) {
    const { gba, assets } = flow;
    gba.sprites.loadSheet(t.tag, assets.get("redArrowOther").tiles);
    gba.palettes.loadSpritePalette(t.tag, assets.get("redArrowPal").palette);
    this.first = this.addArrow(t.first, t.firstX, t.firstY);
    this.second = this.addArrow(t.second, t.secondX, t.secondY);
    this.task = gba.tasks.create(() => {
      const v = value();
      if (this.first) this.first.invisible = v === t.fullyUp;
      if (this.second) this.second.invisible = v === t.fullyDown;
    }, 0);
  }

  /** AddScrollIndicatorArrowPairParameterized with up/down arrows at `x`. */
  static vertical(flow: Flow, x: number, topY: number, bottomY: number, fullyDown: number, tag: string, value: () => number): ScrollArrowPair {
    const t = { first: ScrollArrow.Up, firstX: x, firstY: topY, second: ScrollArrow.Down, secondX: x, secondY: bottomY, fullyUp: 0, fullyDown, tag };
    return new ScrollArrowPair(flow, t, value);
  }

  private addArrow(arrow: ScrollArrow, x: number, y: number): Sprite | null {
    const sprite = this.flow.gba.sprites.create({ ...ARROW_TEMPLATE, sheet: this.t.tag, palette: this.t.tag }, x, y, 0);
    if (!sprite) return null;
    const a = ARROWS[arrow];
    sprite.invisible = true;
    sprite.data[S_ANIM] = a.anim;
    sprite.data[S_VERTICAL] = a.vertical ? 1 : 0;
    sprite.data[S_FREQUENCY] = a.frequency;
    return sprite;
  }

  /** RemoveScrollIndicatorArrowPair. */
  destroy(): void {
    const { gba } = this.flow;
    gba.sprites.freeSheet(this.t.tag);
    gba.palettes.freeSpritePalette(this.t.tag);
    gba.sprites.destroy(this.first);
    gba.sprites.destroy(this.second);
    gba.tasks.destroy(this.task);
  }
}
