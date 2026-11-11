// The machine the screens run on: video, palettes, tasks, sprites, input and sound,
// stepped one frame at a time like the games' main loop.

import { Input } from "./input";
import { GradualBlends, Palettes } from "./palette";
import type { Sound } from "./sound";
import { Sprites } from "./sprites";
import { Tasks } from "./tasks";
import { Video } from "./video";

/** The GBA's frame rate. */
export const FPS = 59.7275;

export class Gba {
  readonly video = new Video();
  readonly palettes = new Palettes();
  readonly tasks = new Tasks();
  readonly sprites = new Sprites(this.palettes);
  readonly blends = new GradualBlends(this.tasks, this.palettes);
  readonly input = new Input();
  /** Step counter of the running main callback (the games' gMain.state). */
  state = 0;
  private main: () => void = () => {};
  private vblank: (() => void) | null = null;
  /** Runs every frame whatever the screen, like the games' main loop counters (play time). */
  onFrame: (() => void) | null = null;

  constructor(readonly sound: Sound) {}

  /** The main callback running now. */
  get currentMain(): () => void {
    return this.main;
  }

  /** Runs `fn` from the next frame on, with the state counter back at 0. */
  setMain(fn: () => void): void {
    this.main = fn;
    this.state = 0;
  }

  /** What runs at the end of each frame; null while a screen is being set up. */
  setVBlank(fn: (() => void) | null): void {
    this.vblank = fn;
  }

  /** The usual main callback: tasks, sprites, then the palette fade. */
  readonly runFrame = (): void => {
    this.tasks.run();
    this.sprites.animate();
    this.sprites.buildOam();
    this.palettes.updateFade();
  };

  /** The usual VBlank: shows the sprites and the faded palettes. */
  readonly standardVBlank = (): void => {
    this.video.objs = this.sprites.oam;
    this.palettes.transfer(this.video);
  };

  /** One frame: read the buttons, run the screen, then VBlank. */
  step(): void {
    this.input.update();
    this.main();
    this.onFrame?.();
    this.vblank?.();
    this.sound.update();
  }

  /** Clears tasks, sprites, palettes and the screen, as each screen does on setup. */
  reset(): void {
    this.tasks.reset();
    this.sprites.reset();
    this.palettes.reset();
    this.video.reset();
  }

  destroy(): void {
    this.input.destroy();
    this.sound.stopAll();
  }
}
