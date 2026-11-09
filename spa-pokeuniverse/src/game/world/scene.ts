// The world drawn by Phaser under the GBA screen: the map's tile layers, a camera on the
// 240×160 screen and the screen's fade. Pixel-perfect: one texel per screen pixel, scaled.

import Phaser from "phaser";
import type { ClientMap } from "@pokeuniverse/contracts/map/v1/map";
import { HEIGHT, WIDTH } from "../gba/video";
import { fitScreen } from "../screen";
import { TILE, tileAt } from "./map";
import type { CharacterSheet, CharacterView, TilesetArt, WorldView } from "./view";

/** Border cells drawn past each edge: a whole screen, wherever the camera goes. */
const MARGIN_X = WIDTH / TILE;
const MARGIN_Y = HEIGHT / TILE;

/** Drawing order: tiles below the characters, the characters, tiles above them, characters over those (by elevation), the fade. */
const DEPTH_CHARACTERS = 1;
const DEPTH_ABOVE = 2;
const DEPTH_CHARACTERS_OVER = 3;
const DEPTH_FADE = 4;
const DEPTH_OVER_FADE = 5;
/** A character's y as a fraction of its layer's depth: any map's pixels stay under 1. */
const Y_SORT_OFFSET = 1 << 10;
const Y_SORT_SCALE = 1 << 20;

export class WorldScene extends Phaser.Scene implements WorldView {
  private tilemaps: Phaser.Tilemaps.Tilemap[] = [];
  private characters = new Set<Phaser.GameObjects.Sprite>();
  private fade!: Phaser.GameObjects.Rectangle;
  private resolveReady!: () => void;
  private readonly ready = new Promise<void>((r) => (this.resolveReady = r));

  constructor() {
    super({ key: "world", active: true });
  }

  create(): void {
    this.cameras.main.setRoundPixels(true).setVisible(false);
    // Covers the camera's view, so the fade also follows it.
    this.fade = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0, 0).setOrigin(0).setDepth(DEPTH_FADE);
    this.layout();
    this.scale.on("resize", () => this.layout());
    this.resolveReady();
  }

  async show(map: ClientMap, art: TilesetArt): Promise<void> {
    await this.ready;
    const sheets = [art.below, art.above];
    await this.loadImages(sheets);
    this.clear();
    const data = Array.from({ length: map.height + 2 * MARGIN_Y }, (_, y) =>
      Array.from({ length: map.width + 2 * MARGIN_X }, (_, x) => tileAt(map, x - MARGIN_X, y - MARGIN_Y)),
    );
    sheets.forEach((sheet, i) => {
      const tilemap = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
      tilemap
        .createLayer(0, tilemap.addTilesetImage(sheet, sheet, TILE, TILE)!, -MARGIN_X * TILE, -MARGIN_Y * TILE)!
        .setDepth(i === 0 ? 0 : DEPTH_ABOVE);
      this.tilemaps.push(tilemap);
    });
    this.cameras.main.setVisible(true);
  }

  hide(): void {
    this.clear();
    this.cameras.main.setVisible(false);
  }

  addCharacter(sheet: CharacterSheet): CharacterView {
    if (!this.textures.exists(sheet.key))
      this.textures.addSpriteSheet(sheet.key, sheet.image as unknown as HTMLImageElement, { frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight });
    const sprite = this.add.sprite(0, 0, sheet.key, 0).setOrigin(0);
    this.characters.add(sprite);
    let layer = DEPTH_CHARACTERS;
    let overFade = false;
    // Within a layer, the lower on the map is in front (FireRed's subpriority by y): by the feet, as
    // frames of different heights (a 64×64 follower beside a 16×32 trainer) stand on their cells.
    const sort = () => sprite.setDepth((overFade ? DEPTH_OVER_FADE : layer) + (sprite.y + sheet.frameHeight + (sheet.ahead ?? 0) + Y_SORT_OFFSET) / Y_SORT_SCALE);
    sort();
    return {
      setPosition: (x, y) => {
        sprite.setPosition(x, y);
        sort();
      },
      setFrame: (frame, hFlip) => sprite.setFrame(frame).setFlipX(hFlip),
      setOverTiles: (over) => {
        layer = over ? DEPTH_CHARACTERS_OVER : DEPTH_CHARACTERS;
        sort();
      },
      setOverFade: (over) => {
        overFade = over;
        sort();
      },
      setVisible: (visible) => sprite.setVisible(visible),
      destroy: () => {
        this.characters.delete(sprite);
        sprite.destroy();
      },
    };
  }

  setTile(x: number, y: number, tile: number): void {
    for (const tilemap of this.tilemaps) tilemap.putTileAt(tile, x + MARGIN_X, y + MARGIN_Y, false, 0);
  }

  setCamera(x: number, y: number): void {
    // Centered: Phaser culls the tiles around the camera's center.
    this.cameras.main.centerOn(x + WIDTH / 2, y + HEIGHT / 2);
    this.fade.setPosition(x, y);
  }

  setFade(y: number, color: number): void {
    const rgb = ((color & 31) << 19) | (((color >> 5) & 31) << 11) | (((color >> 10) & 31) << 3);
    this.fade.setFillStyle(rgb, Math.min(y, 16) / 16);
  }

  private clear(): void {
    for (const tilemap of this.tilemaps) tilemap.destroy();
    this.tilemaps = [];
    for (const sprite of this.characters) sprite.destroy();
    this.characters.clear();
  }

  /** Loads images not loaded yet, keyed by URL. */
  private loadImages(urls: string[]): Promise<void> {
    const missing = urls.filter((url) => !this.textures.exists(url));
    if (!missing.length) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const fail = (file: Phaser.Loader.File) => reject(new Error(`image ${file.src}: failed`));
      this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, fail);
      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, fail);
        resolve();
      });
      for (const url of missing) this.load.image(url, url);
      this.load.start();
    });
  }

  private layout(): void {
    const { scale, left, top } = fitScreen(this.scale.width, this.scale.height);
    this.cameras.main.setViewport(left, top, Math.round(WIDTH * scale), Math.round(HEIGHT * scale)).setZoom(scale);
  }
}
