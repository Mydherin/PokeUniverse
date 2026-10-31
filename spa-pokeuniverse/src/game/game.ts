// Phaser runs the loop, scales the screen and owns Web Audio; the game draws a GBA-style
// 240×160 frame (src/game/gba) and the FireRed screens run on it (src/game/firered).
// Presentation stays decoupled: screens use asset IDs mapped by the FireRed manifest
// (tech-stack.md#decoupled-presentation).

import Phaser from "phaser";
import { h } from "../ui/dom";
import { FPS, Gba } from "./gba/gba";
import { Sound } from "./gba/sound";
import { touchControls } from "./gba/touch-controls";
import { HEIGHT, WIDTH } from "./gba/video";
import { fetchTrainer, startFireRed } from "./firered/boot";
import { Assets, SOUNDS } from "./firered/manifest";

const FRAME_MS = 1000 / FPS;
/** After a long pause (hidden tab, slow device), skip ahead instead of catching up. */
const MAX_CATCH_UP = 4;

class GbaScreen extends Phaser.Scene {
  private gba!: Gba;
  private image!: Phaser.GameObjects.Image;
  private texture!: Phaser.Textures.CanvasTexture;
  private pixels!: ImageData;
  private running = false;
  private destroyed = false;
  private elapsed = 0;

  constructor(
    private readonly overlay: HTMLElement,
    private readonly onGba: (gba: Gba) => void,
  ) {
    super("gba");
  }

  create(): void {
    const manager = this.sound as Phaser.Sound.WebAudioSoundManager;
    const ctx = manager.context ?? new AudioContext();
    this.cameras.main.setBackgroundColor("#000000");
    this.texture = this.textures.createCanvas("gba", WIDTH, HEIGHT)!;
    this.pixels = this.texture.context.createImageData(WIDTH, HEIGHT);
    this.image = this.add.image(0, 0, "gba");
    this.layout();
    this.scale.on("resize", () => this.layout());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => (this.destroyed = true));

    const trainer = fetchTrainer();
    void Assets.load().then(async (assets) => {
      const sound = new Sound(ctx, assets.soundManifest);
      await sound.load([...SOUNDS], Assets.soundUrl);
      if (this.destroyed) return;
      this.gba = new Gba(sound);
      this.onGba(this.gba);
      const start = () => {
        this.elapsed = 0;
        this.running = true;
        startFireRed(this.gba, assets, trainer);
      };
      if (ctx.state === "running") start();
      else this.waitForUnlock(ctx, start);
    });
  }

  /** Browsers start audio only after a tap or key press (ui.md#audio-unlock). */
  private waitForUnlock(ctx: AudioContext, start: () => void): void {
    const prompt = h(
      "button",
      { type: "button", class: "absolute inset-0 z-10 flex items-center justify-center bg-black font-display text-lg text-ink-soft" },
      h("span", { class: "animate-twinkle" }, "Tap or press any key to start"),
    );
    const events = ["keydown", "pointerdown"] as const;
    const stop = () => events.forEach((type) => window.removeEventListener(type, unlock, true));
    // Captured and stopped, so this first input isn't also a game button.
    const unlock = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      stop();
      prompt.remove();
      void ctx.resume().finally(start);
    };
    events.forEach((type) => window.addEventListener(type, unlock, true));
    this.events.once(Phaser.Scenes.Events.DESTROY, stop);
    this.overlay.append(prompt);
  }

  /** Integer scale when at least 2× fits, otherwise the largest fit; centered on black. */
  private layout(): void {
    const { width, height } = this.scale;
    const fit = Math.min(width / WIDTH, height / HEIGHT);
    const scale = fit >= 2 ? Math.floor(fit) : fit;
    this.image.setScale(scale).setPosition(Math.round(width / 2), Math.round(height / 2));
  }

  update(_time: number, delta: number): void {
    if (!this.running) return;
    this.elapsed = Math.min(this.elapsed + delta, FRAME_MS * MAX_CATCH_UP);
    let stepped = false;
    while (this.elapsed >= FRAME_MS) {
      this.elapsed -= FRAME_MS;
      this.gba.step();
      stepped = true;
    }
    if (!stepped) return;
    this.gba.video.render(this.pixels);
    this.texture.context.putImageData(this.pixels, 0, 0);
    this.texture.refresh();
  }
}

/**
 * Starts the game in `parent`: the screen, plus on-screen controls on touch devices
 * (below the game in portrait, at its sides in landscape).
 */
export function startGame(parent: HTMLElement): () => void {
  const screen = h("div", { class: "game-screen" });
  const left = h("div", { class: "game-left" });
  const right = h("div", { class: "game-right" });
  const layout = h("div", { class: "game-layout" }, screen, left, right);
  parent.append(layout);

  let gba: Gba | undefined;
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: screen,
    pixelArt: true,
    backgroundColor: "#000000",
    scale: { mode: Phaser.Scale.RESIZE, width: screen.clientWidth, height: screen.clientHeight },
    banner: false,
    scene: new GbaScreen(screen, (g) => {
      gba = g;
      const controls = touchControls(g.input);
      left.append(controls.left);
      right.append(controls.right);
    }),
  });
  // Follow the screen size (rotation, keyboard, browser bars), not only window resizes.
  const observer = new ResizeObserver(() => game.scale.refresh());
  game.events.once(Phaser.Core.Events.READY, () => observer.observe(screen));
  return () => {
    observer.disconnect();
    gba?.destroy();
    game.destroy(true);
    layout.remove();
  };
}
