// Phaser only renders: it reads client state and sends player intents (tech-stack.md#decoupled-presentation).
// This is the empty game screen; the world arrives in Phase 3.

import Phaser from "phaser";
import { Species, frontSprite } from "../assets/sprites";

class EmptyWorldScene extends Phaser.Scene {
  private stars: Phaser.GameObjects.Rectangle[] = [];

  constructor() {
    super("empty-world");
  }

  preload(): void {
    this.load.setCORS("anonymous");
    this.load.image("pikachu", frontSprite(Species.pikachu));
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#0b0920");
    for (let i = 0; i < 90; i++) {
      const star = this.add.rectangle(0, 0, 2, 2, 0xf5f3ff, Phaser.Math.FloatBetween(0.2, 1));
      this.tweens.add({ targets: star, alpha: 0.15, duration: Phaser.Math.Between(1200, 3200), yoyo: true, repeat: -1 });
      this.stars.push(star);
    }
    // The layout moves the container; the tween only bounces the sprite inside it.
    const pikachu = this.add.image(0, 0, "pikachu");
    this.add.container(0, 0, [pikachu]).setName("hero");
    this.tweens.add({ targets: pikachu, y: -12, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.add
      .text(0, 0, "Kanto is on its way", { fontFamily: "Pixelify Sans Variable, monospace", fontSize: "28px", color: "#ffe36e" })
      .setOrigin(0.5)
      .setName("title");
    this.add
      .text(0, 0, "Connected. The world arrives in the next update.", { fontFamily: "Outfit Variable, sans-serif", fontSize: "16px", color: "#ada6d8" })
      .setOrigin(0.5)
      .setName("subtitle");

    this.layout();
    this.scale.on("resize", () => this.layout());
  }

  private layout(): void {
    const { width, height } = this.scale;
    for (const star of this.stars) star.setPosition(Phaser.Math.Between(0, width), Phaser.Math.Between(0, height));
    // Scale the sprite to the screen height so it fits short landscape phones.
    const scale = Phaser.Math.Clamp(Math.floor(height / 140), 1, 3);
    const spriteHeight = 64 * scale;
    const top = height / 2 - (spriteHeight + 70) / 2;
    (this.children.getByName("hero") as Phaser.GameObjects.Container).setPosition(width / 2, top + spriteHeight / 2).setScale(scale);
    (this.children.getByName("title") as Phaser.GameObjects.Text).setPosition(width / 2, top + spriteHeight + 24);
    (this.children.getByName("subtitle") as Phaser.GameObjects.Text).setPosition(width / 2, top + spriteHeight + 56);
  }
}

export function startGame(parent: HTMLElement): () => void {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    pixelArt: true,
    backgroundColor: "#0b0920",
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
    banner: false,
    scene: EmptyWorldScene,
  });
  // Follow the stage size (rotation, keyboard, browser bars), not only window resizes.
  const observer = new ResizeObserver(() => game.scale.refresh());
  game.events.once(Phaser.Core.Events.READY, () => observer.observe(parent));
  return () => {
    observer.disconnect();
    game.destroy(true);
  };
}
