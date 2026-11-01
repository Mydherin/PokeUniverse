// A Pokémon's icon (pokemon_icon.c): two 32×32 frames that alternate, faster the more HP it
// has (the party menu), or still. Its frames are copied in by hand (UpdateMonIconFrame) rather
// than by the sprite's own animation, so a callback can follow each frame change.

import { toTiles } from "../gba/assets";
import type { Sprite, SpriteTemplate } from "../gba/sprites";
import type { Flow } from "./flow";
import { HpBarLevel } from "./hp-bar";

/** sMonIconAnims: each frame's duration, by animation (fast to still); the still one shows frame 0 twice. */
const ANIMS: readonly (readonly [number, number, number])[] = [
  [0, 1, 6],
  [0, 1, 8],
  [0, 1, 14],
  [0, 1, 22],
  [0, 0, 29],
];

/** UpdateHPBar: the animation for an HP bar level. */
export function iconAnimForHp(level: HpBarLevel): number {
  switch (level) {
    case HpBarLevel.Full:
      return 0;
    case HpBarLevel.Green:
      return 1;
    case HpBarLevel.Yellow:
      return 2;
    case HpBarLevel.Red:
      return 3;
    default:
      return 4;
  }
}

const TILES_PER_FRAME = 16;

export class MonIcon {
  readonly sprite: Sprite;
  private anim = 0;
  private cmd = 0;
  private delay = 0;

  /** CreateMonIcon: the species' icon (its art loaded) and colors, its first frame shown; it animates each frame. */
  constructor(flow: Flow, species: number, x: number, y: number, subpriority: number, priority: number) {
    const { gba, assets } = flow;
    const art = assets.loadedPokemonArt(species);
    const tag = `monIcon${species}`;
    gba.sprites.loadSheet(tag, art ? toTiles(art.icon) : new Uint8Array(0));
    gba.palettes.loadSpritePalette(tag, art?.iconPalette ?? new Uint16Array(16));
    const template: SpriteTemplate = { sheet: tag, palette: tag, width: 32, height: 32, priority };
    this.sprite = gba.sprites.create(template, x, y, subpriority)!;
    this.sprite.animPaused = true;
    this.sprite.callback = () => this.update();
    this.update();
  }

  /** SetPartyHPBarSprite: starts an animation from its first frame. */
  setAnim(anim: number): void {
    this.anim = anim;
    this.cmd = 0;
    this.delay = 0;
  }

  /** The sprite's callback, given what UpdateMonIconFrame returned this frame. */
  set onFrame(fn: ((frameCmd: number) => void) | null) {
    this.sprite.callback = fn ? () => fn(this.update()) : () => this.update();
  }

  /**
   * UpdateMonIconFrame: shows the next frame once the last one's time is up; the command's
   * number then (1 or 2), or 0 when nothing changed (the jump back takes a frame of its own).
   */
  update(): number {
    if (this.delay > 0) {
      this.delay--;
      return 0;
    }
    if (this.cmd >= 2) {
      this.cmd = 0;
      return 0;
    }
    const anim = ANIMS[this.anim] ?? ANIMS[0];
    this.sprite.tileNum = anim[this.cmd] * TILES_PER_FRAME;
    this.delay = anim[2];
    return ++this.cmd;
  }

  destroy(flow: Flow): void {
    flow.gba.sprites.destroy(this.sprite);
  }
}
