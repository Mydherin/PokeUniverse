// The Pokémon following the player, drawn the FireRed way with pokeemerald-expansion's Gen 3-style
// sheets (`make pokemon`: <nnn>/overworld.png): square frames of 32 or 64 px, feet on its cell.
// Frames (sAnimTable_Following): south 0-1, north 2-3, west 4-5, east 4-5 flipped; an 8-frame sheet
// (sAnimTable_Following_Asym) has its own east 6-7. Like HeartGold's, it keeps stepping in place standing.

import { Direction } from "@pokeuniverse/contracts/map/v1/map";
import type { FollowerModel } from "../world/follower";
import type { CharacterView, WorldView } from "../world/view";
import type { Assets, FollowerArt } from "./manifest";
import { sheetOf } from "./player-sprite";

/** Face frame per direction; the step frame is the next one. */
const FACE: Record<number, number> = { [Direction.SOUTH]: 0, [Direction.NORTH]: 2, [Direction.WEST]: 4, [Direction.EAST]: 4 };
/** sAnim_GoSouth2F: face, step, step, face, 6 frames each walking; running twice as fast, standing half. */
const CYCLE = [0, 1, 1, 0];
const CMD_FRAMES = 6;

export class FollowerSprite {
  private view: CharacterView | null = null;
  /** Frame side (32 or 64) and count (6, or 8 with its own east frames). */
  private size = 32;
  private frames = 6;
  /** The species and colors drawn (or loading): "<species>:<shiny>". */
  private shown = "";
  private t = 0;

  constructor(
    private readonly world: WorldView,
    private readonly assets: Assets,
  ) {}

  /** One frame: loads the species' sheet when it changes, then draws it on its cell. */
  update(f: FollowerModel, overTiles: boolean): void {
    const key = `${f.species}:${f.shiny}`;
    if (key !== this.shown) this.load(f, key);
    if (!this.view) return;
    this.t += f.step ? (f.step.run ? 2 : 1) : 0.5;
    const size = this.size;
    const eastOwn = f.facing === Direction.EAST && this.frames >= 8;
    const face = eastOwn ? 6 : (FACE[f.facing] ?? 0);
    this.view.setVisible(!f.hidden);
    this.view.setPosition(f.pixelX + 8 - size / 2, f.pixelY + 16 - size);
    this.view.setFrame(face + CYCLE[Math.floor(this.t / CMD_FRAMES) % 4], f.facing === Direction.EAST && !eastOwn);
    this.view.setOverTiles(overTiles);
  }

  destroy(): void {
    this.view?.destroy();
    this.view = null;
    this.shown = "";
  }

  /** The sheet loads in the background (only species on the map are fetched); nothing drawn meanwhile. */
  private load(f: FollowerModel, key: string): void {
    this.destroy();
    this.shown = key;
    if (!f.species) return;
    const { species, shiny } = f;
    void this.assets.followerArt(species).then(
      (art: FollowerArt) => {
        if (this.shown !== key) return;
        this.size = art.image.height;
        this.frames = art.image.width / this.size;
        this.view = this.world.addCharacter(sheetOf(`firered-follower-${key}`, shiny ? art.shinyPalette : art.palette, [[art.image, 0, this.frames]], this.size, this.size));
      },
      () => {},
    );
  }
}
