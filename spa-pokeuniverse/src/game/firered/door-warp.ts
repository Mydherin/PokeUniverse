// FireRed's door and escalator warps (field_fadetransition.c Task_DoorWarp / Task_ExitDoor,
// field_effect.c's escalator warp out and in), shaped as stair-warp.ts: a Leaving* runs until the
// screen is black, an Arriving* until the player stands free on the next map.
//
// The only door so far is the Cable Club door (field_door.c, METATILE_PokemonCenter_CableClubDoor,
// DOOR_SIZE_1x2, sliding): on the Pokémon Center's tileset it is a map tile, elsewhere (the
// player's room, phase-9 M7) its closed frame is drawn over the map from that tileset's sheet.

import { Direction, TileBehavior, type ClientMap } from "@pokeuniverse/contracts/map/v1/map";
import { PALETTES_ALL } from "../gba/palette";
import { SIN } from "../gba/trig";
import { RGB_BLACK } from "../gba/video";
import type { Avatar } from "../world/avatar";
import { behaviorAt, TILE } from "../world/map";
import type { CharacterSheet, CharacterView, WorldView } from "../world/view";
import type { Flow } from "./flow";
import { Assets } from "./manifest";
import type { PlayerSprite } from "./player-sprite";
import { sheetOf } from "./player-sprite";

/** The door's two metatiles on the Pokémon Center's tileset (pokemon_center_2f's 9,0 and 9,1). */
const DOOR_TILESET = "pokemon_center";
const DOOR_TOP_TILE = 726;
const DOOR_TILE = 734;
/** sDoorAnimFrames_OpenLarge / CloseLarge: 4 frames each; -1 is the closed door. */
const FRAME_FRAMES = 4;
const OPEN = [-1, 0, 1, 2];
const CLOSE = [2, 1, 0, -1];

const sin = (i: number, a: number) => (SIN[i & 0xff] * a) >> 8;
const cos = (i: number, a: number) => (SIN[(i + 64) & 0xff] * a) >> 8;

let closedArt: Promise<HTMLImageElement> | null = null;

/** The tileset sheet the closed door is cut from, loaded once. */
function loadClosedArt(): Promise<HTMLImageElement> {
  if (!closedArt) {
    closedArt = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        closedArt = null;
        reject(new Error("door art"));
      };
      img.src = Assets.tilesetArt(DOOR_TILESET).below;
    });
  }
  return closedArt;
}

/** The door of a WARP_DOOR cell: closed, opening or closing. */
export class Door {
  private view: CharacterView | null = null;
  private frames: number[] = [];
  private t = 0;
  private shown = -1;
  private destroyed = false;
  /** Drawn closed too: the map's own tiles have no door. */
  private readonly overlay: boolean;

  constructor(
    world: WorldView,
    assets: Assets,
    map: ClientMap,
    readonly x: number,
    readonly y: number,
  ) {
    this.overlay = map.tileset !== DOOR_TILESET;
    const open = sheetOf("firered-door-cable-club", assets.get("doorCableClub").palette, [[assets.get("doorCableClub").image!, 0, 3]], TILE, 2 * TILE);
    void loadClosedArt()
      .catch(() => null)
      .then((img) => {
        if (this.destroyed) return;
        const sheet = doorSheet(open, img);
        this.view = world.addCharacter(sheet);
        this.view.setPosition(this.x * TILE, (this.y - 1) * TILE);
        this.show();
      });
  }

  /** The doors on a map: one per WARP_DOOR cell that has a warp. */
  static onMap(world: WorldView, assets: Assets, map: ClientMap): Door[] {
    const doors: Door[] = [];
    for (const w of map.warps) if (behaviorAt(map, w.x, w.y) === TileBehavior.WARP_DOOR) doors.push(new Door(world, assets, map, w.x, w.y));
    return doors;
  }

  get running(): boolean {
    return this.frames.length > 0;
  }

  open(): void {
    this.frames = OPEN.slice();
    this.t = 0;
  }

  close(): void {
    this.frames = CLOSE.slice();
    this.t = 0;
  }

  /** One frame (Task_AnimateDoor). */
  update(): void {
    if (!this.frames.length) return;
    this.shown = this.frames[0];
    if (++this.t > FRAME_FRAMES) {
      this.t = 0;
      this.frames.shift();
    }
    this.show();
  }

  destroy(): void {
    this.destroyed = true;
    this.view?.destroy();
  }

  private show(): void {
    if (!this.view) return;
    // Under whoever walks through it: it's the map's bottom layer in FireRed.
    this.view.setVisible(this.shown >= 0 || this.overlay);
    this.view.setFrame(this.shown + 1, false);
  }
}

/** Frame 0 the closed door (from the tileset's sheet), 1-3 the opening frames. */
function doorSheet(open: CharacterSheet, closed: HTMLImageElement | null): CharacterSheet {
  const canvas = document.createElement("canvas");
  canvas.width = 4 * TILE;
  canvas.height = 2 * TILE;
  const ctx = canvas.getContext("2d")!;
  if (closed) {
    for (const [tile, y] of [
      [DOOR_TOP_TILE, 0],
      [DOOR_TILE, TILE],
    ])
      ctx.drawImage(closed, (tile % 16) * TILE, Math.floor(tile / 16) * TILE, TILE, TILE, 0, y, TILE, TILE);
  }
  ctx.drawImage(open.image, TILE, 0);
  return { key: `firered-door-cable-club-${closed ? "closed" : "open"}`, image: canvas, frameWidth: TILE, frameHeight: 2 * TILE, ahead: -1 };
}

/** Task_DoorWarp: SE and the door opens, the player walks in, the door closes behind them, fade out. */
export class LeavingDoor {
  private state = 0;
  private walked = 0;

  constructor(
    private readonly flow: Flow,
    private readonly avatar: Avatar,
    private readonly sprite: PlayerSprite,
    private readonly door: Door | undefined,
  ) {
    flow.play("se_sliding_door");
    door?.open();
  }

  update(): boolean {
    const { palettes } = this.flow.gba;
    switch (this.state) {
      case 0: // The door opens.
        if (this.door?.running) return false;
        this.avatar.walkInPlace(false);
        this.state = 1;
        return false;
      case 1: // MOVEMENT_ACTION_WALK_NORMAL_UP, drawn as a walk off the cell (the server has the warp).
        this.sprite.offsetY = -++this.walked;
        if (this.walked < TILE) return false;
        this.sprite.visible = false;
        this.door?.close();
        this.state = 2;
        return false;
      case 2: // The door closes, then the screen fades out.
        if (this.door?.running) return false;
        palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
        this.state = 3;
        return false;
      default:
        return !palettes.fadeActive;
    }
  }
}

/** Task_ExitDoor: hidden behind the door as the map fades in; 25 frames on, SE and it opens, the player walks down, it closes. */
export class ArrivingDoor {
  private state = 0;
  private t = 0;

  constructor(
    private readonly flow: Flow,
    private readonly avatar: Avatar,
    private readonly sprite: PlayerSprite,
    private readonly door: Door | undefined,
  ) {
    sprite.visible = false;
  }

  update(): boolean {
    switch (this.state) {
      case 0:
        if (++this.t < 25) return false;
        this.flow.play("se_sliding_door");
        this.door?.open();
        this.state = 1;
        return false;
      case 1:
        if (this.door?.running) return false;
        this.sprite.visible = true;
        this.avatar.forceWalk(Direction.SOUTH);
        this.t = 0;
        this.state = 2;
        return false;
      case 2:
        if (++this.t === 14) {
          this.door?.close();
          this.state = 3;
        }
        return false;
      default:
        return !this.door?.running && this.avatar.action === null && !this.flow.gba.palettes.fadeActive;
    }
  }
}

/** The sprite's way along an escalator: Cos/Sin of these angles times the distance. */
function escalatorAngles(behavior: TileBehavior): readonly [number, number] {
  return behavior === TileBehavior.DOWN_ESCALATOR ? [0x7c, 0x76] : [0x84, 0x94];
}

/** EscalatorWarpEffect: SE_ESCALATOR, the sprite rides off one pixel every 2 frames; past 3 the screen fades out. */
export class LeavingEscalator {
  private readonly angles: readonly [number, number];
  private d = 0;
  private t = 0;
  private fading = false;

  constructor(
    private readonly flow: Flow,
    private readonly sprite: PlayerSprite,
    behavior: TileBehavior,
  ) {
    this.angles = escalatorAngles(behavior);
    sprite.forceOver = true;
    flow.play("se_escalator");
  }

  update(): boolean {
    const { palettes } = this.flow.gba;
    this.sprite.offsetX = cos(this.angles[0], this.d);
    this.sprite.offsetY = sin(this.angles[1], this.d);
    if (++this.t & 1) this.d++;
    if (this.fading) return !palettes.fadeActive;
    if (this.d > 3) {
      palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
      this.fading = true;
    }
    return false;
  }
}

/** EscalatorWarpInEffect: facing east, the sprite rides in from 16 away as the map fades in, then walks one step east. */
export class ArrivingEscalator {
  private readonly angles: readonly [number, number];
  private d = 16;
  private t = 0;
  private walked = false;

  constructor(
    private readonly flow: Flow,
    private readonly avatar: Avatar,
    private readonly sprite: PlayerSprite,
    behavior: TileBehavior,
  ) {
    this.angles = escalatorAngles(behavior);
    avatar.facing = Direction.EAST;
    this.apply();
  }

  update(): boolean {
    if (this.d > 0) {
      if (++this.t & 1) this.d--;
      this.apply();
      return false;
    }
    if (!this.walked) {
      this.walked = true;
      this.avatar.forceWalk(Direction.EAST);
      return false;
    }
    return this.avatar.action === null && !this.flow.gba.palettes.fadeActive;
  }

  private apply(): void {
    this.sprite.offsetX = cos(this.angles[0], this.d);
    this.sprite.offsetY = sin(this.angles[1], this.d);
  }
}
