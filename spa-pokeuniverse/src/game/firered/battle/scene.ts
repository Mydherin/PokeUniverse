// The battle screen's video (battle_bg.c, battle_gfx_sfx_util.c): BG0 holds the textbox with its
// three pages (messages at the top, the action menu 160 pixels down, the move menu 320 down),
// BG3 and BG2 the terrain (its top and bottom halves, which slide in apart in the intro), and the
// sprites are the Pokémon, the trainers and the healthboxes. Everything can be drawn again from
// the battle's state, back from the bag or the party menu or after a reconnect.

import type { Battler, BattlerInfo } from "@pokeuniverse/contracts/battle/v1/event";
import { Gender } from "@pokeuniverse/contracts/trainer/v1/trainer";
import type { IndexedImage } from "../../gba/assets";
import { Button } from "../../gba/input";
import type { Sprite, SpriteTemplate } from "../../gba/sprites";
import { FontId, Window, type Text, type WindowTemplate } from "../../gba/text";
import { Layer, rgb, RGB_BLACK, type Background } from "../../gba/video";
import type { BattleState } from "../../battle/state";
import { initBg } from "../common";
import type { Flow } from "../flow";
import { TRAINER_PICS, userFrame, type Graphic } from "../manifest";
import { copyTiles } from "../menu";
import { textSpeedDelay } from "../options";
import { MON_AFFINE_ANIMS } from "../pokeball";
import { Healthbox, type HealthboxMon } from "./healthbox";

/** The textbox's pages: gBattle_BG0_Y. */
export const enum Page {
  Message = 0,
  Action = 160,
  Moves = 320,
}

/** sStandardBattleWindowTemplates (the ones singles use). */
export const WINDOWS = {
  msg: { left: 1, top: 15, width: 28, height: 4, palette: 0, baseBlock: 0x090 },
  actionPrompt: { left: 1, top: 35, width: 14, height: 4, palette: 0, baseBlock: 0x1c0 },
  actionMenu: { left: 17, top: 35, width: 12, height: 4, palette: 5, baseBlock: 0x190 },
  moveName1: { left: 2, top: 55, width: 8, height: 2, palette: 5, baseBlock: 0x300 },
  moveName2: { left: 11, top: 55, width: 8, height: 2, palette: 5, baseBlock: 0x310 },
  moveName3: { left: 2, top: 57, width: 8, height: 2, palette: 5, baseBlock: 0x320 },
  moveName4: { left: 11, top: 57, width: 8, height: 2, palette: 5, baseBlock: 0x330 },
  pp: { left: 21, top: 55, width: 3, height: 2, palette: 5, baseBlock: 0x290 },
  moveType: { left: 21, top: 57, width: 8, height: 2, palette: 5, baseBlock: 0x296 },
  ppRemaining: { left: 24, top: 55, width: 5, height: 2, palette: 5, baseBlock: 0x2a6 },
  // One at a time: they share their tiles, past the message's.
  yesNo: { left: 25, top: 9, width: 4, height: 4, palette: 5, baseBlock: 0x100 },
  levelUp: { left: 19, top: 8, width: 10, height: 11, palette: 5, baseBlock: 0x100 },
} satisfies Record<string, WindowTemplate>;
export type WindowId = keyof typeof WINDOWS;

/** sTextOnWindowsInfo_Normal: fill, font, position and [background, text, shadow] of each window. */
const STYLES: Record<WindowId, { fill: number; font: FontId; x: number; y: number; letterSpacing?: number; lineSpacing: number; colors: [number, number, number] }> = {
  msg: { fill: 15, font: FontId.Normal, x: 2, y: 2, lineSpacing: 2, colors: [15, 1, 6] },
  actionPrompt: { fill: 15, font: FontId.Normal, x: 2, y: 2, lineSpacing: 2, colors: [15, 1, 6] },
  actionMenu: { fill: 14, font: FontId.NormalCopy1, x: 0, y: 2, lineSpacing: 2, colors: [14, 13, 15] },
  moveName1: { fill: 14, font: FontId.Small, x: 0, y: 1, lineSpacing: 0, colors: [14, 13, 15] },
  moveName2: { fill: 14, font: FontId.Small, x: 0, y: 1, lineSpacing: 0, colors: [14, 13, 15] },
  moveName3: { fill: 14, font: FontId.Small, x: 0, y: 1, lineSpacing: 0, colors: [14, 13, 15] },
  moveName4: { fill: 14, font: FontId.Small, x: 0, y: 1, lineSpacing: 0, colors: [14, 13, 15] },
  pp: { fill: 14, font: FontId.Small, x: 0, y: 2, lineSpacing: 0, colors: [14, 12, 11] },
  moveType: { fill: 14, font: FontId.Small, x: 0, y: 2, lineSpacing: 0, colors: [14, 13, 15] },
  ppRemaining: { fill: 14, font: FontId.NormalCopy1, x: 10, y: 2, lineSpacing: 2, colors: [14, 12, 11] },
  yesNo: { fill: 14, font: FontId.Normal, x: 0, y: 2, letterSpacing: 1, lineSpacing: 2, colors: [14, 13, 15] },
  levelUp: { fill: 14, font: FontId.Normal, x: 0, y: 0, lineSpacing: 0, colors: [14, 13, 15] },
};

/** sBattlerCoords: where each battler's Pokémon stands, and its subpriority (GetBattlerSpriteSubpriority), by battler ID. */
const MON_COORDS: readonly (readonly [number, number])[] = [[72, 80], [176, 40]];
const MON_COORDS_DOUBLES: readonly (readonly [number, number])[] = [[32, 80], [200, 40], [90, 88], [152, 32]];
const MON_SUBPRIORITY = [30, 40, 20, 50];

/** A place on the field: a side and a position. */
export type Spot = Pick<Battler, "foe" | "position">;

/** The game's battler ID: player left, foe left, player right, foe right. */
export function battlerId(b: Spot): number {
  return b.position * 2 + (b.foe ? 1 : 0);
}

/** Where the trainers stand: the player's back pic, the foe's front pic. */
export const TRAINER_COORDS = { player: [80, 80], foe: [176, 40] } as const;

/** sAnimCmd_Red_1 / Leaf_1: the throw, frames of 64 tiles. */
const BACK_PIC_ANIMS: SpriteTemplate["anims"] = [
  [{ image: 0, duration: 0 }, "end"],
  [{ image: 64, duration: 20 }, { image: 128, duration: 6 }, { image: 192, duration: 6 }, { image: 256, duration: 24 }, { image: 0, duration: 1 }, "end"],
];

const TILES = 0x400;
/** sBattleTerrainTable's art folders by BATTLE_TERRAIN_* (plain is building's art in plain colors). */
const TERRAIN_ART = ["grass", "longgrass", "sand", "underwater", "water", "pond", "mountain", "cave", "building", "building"] as const;
export const TERRAIN_BUILDING = 8;
export const TERRAIN_PLAIN = 9;
/** BattleTerrain (the contract's, one more than FireRed's) to BATTLE_TERRAIN_*; unset is a building. */
export function terrainId(terrain: number): number {
  return terrain > 0 && terrain <= TERRAIN_ART.length ? terrain - 1 : TERRAIN_BUILDING;
}

/** A Pokémon's sprite: its picture copied into its own tiles, so it can sink out of sight as it faints. */
export class MonSprite {
  readonly sprite: Sprite;
  private readonly tiles = new Uint8Array(64 * 64);
  /** The art it shows in place of its picture (the substitute doll). */
  private doll: Graphic | null = null;

  constructor(
    private readonly flow: Flow,
    readonly tag: string,
    private readonly pic: IndexedImage,
    private readonly palette: Uint16Array,
    x: number,
    y: number,
    subpriority: number,
  ) {
    const { gba } = flow;
    this.draw(0);
    gba.sprites.loadSheet(tag, this.tiles);
    gba.palettes.loadSpritePalette(tag, palette);
    const template: SpriteTemplate = { sheet: tag, palette: tag, width: 64, height: 64, priority: 2, affine: true, affineAnims: MON_AFFINE_ANIMS };
    this.sprite = gba.sprites.create(template, x, y, subpriority)!;
  }

  /** The picture `dy` pixels lower inside its 64×64 box (the faint slide), rows below the box gone. */
  draw(dy: number): void {
    const { pic, tiles, doll } = this;
    tiles.fill(0);
    if (doll) return tiles.set(doll.tiles.subarray(0, tiles.length));
    for (let y = dy; y < 64; y++)
      for (let x = 0; x < 64; x++) tiles[((y >> 3) * 8 + (x >> 3)) * 64 + (y & 7) * 8 + (x & 7)] = pic.pixels[(y - dy) * pic.width + x] & 15;
  }

  /** LoadBattleMonGfxAndAnimate: shows `doll`, or its own picture again with null. */
  dress(doll: Graphic | null): void {
    this.doll = doll;
    this.draw(0);
    this.flow.gba.palettes.load(doll?.palette ?? this.palette, 256 + this.sprite.paletteNum * 16, 16);
  }

  destroy(): void {
    const { gba } = this.flow;
    gba.sprites.destroy(this.sprite);
    gba.sprites.freeSheet(this.tag);
    gba.palettes.freeSpritePalette(this.tag);
  }
}

export class BattleScene {
  readonly bg0: Background;
  readonly windows: Record<WindowId, Window>;
  /** By battler ID. */
  private readonly healthboxes: Healthbox[];
  /** The Pokémon on the field, by battler ID. */
  private readonly mons: (MonSprite | null)[];
  /** The trainers' pictures while they're on screen. */
  readonly trainers: [Sprite | null, Sprite | null] = [null, null];
  private readonly terrain: [Background, Background];

  constructor(
    private readonly flow: Flow,
    private readonly gender: Gender,
    readonly doubles: boolean,
    /** FireRed's BATTLE_TERRAIN_* (0 grass … 9 plain). */
    readonly terrainId: number = TERRAIN_BUILDING,
  ) {
    const { gba, assets } = flow;
    const { video, palettes } = gba;
    gba.setVBlank(null);
    gba.reset();
    flow.text.reset();
    video.transparentBackdrop = false;
    const [bg0, , bg2, bg3] = video.bgs;
    this.bg0 = bg0;
    this.terrain = [bg3, bg2];

    // LoadBattleTextboxAndBackground: the textbox and its colors, the menu windows' colors.
    initBg(bg0, 2, 0);
    const textbox = assets.get("battleTextbox");
    bg0.tiles = new Uint8Array(TILES * 64);
    bg0.tiles.set(textbox.tiles.subarray(0, Math.min(textbox.tiles.length, bg0.tiles.length)));
    bg0.map.set(textbox.map!.subarray(0, bg0.map.length));
    bg0.visible = true;
    palettes.load(assets.get("battleTextboxPal1").palette, 0, 16);
    palettes.load(assets.get("battleTextboxPal2").palette, 16, 16);
    palettes.load([rgb(9, 9, 9), rgb(9, 9, 9), rgb(31, 31, 31), rgb(26, 26, 25)], 5 * 16 + 12, 4);
    palettes.load([RGB_BLACK], 0, 1);
    // LoadBattleMenuWindowGfx: the user's frame, for HandleBattleWindow's boxes.
    const frame = assets.get(userFrame(flow.options.frame));
    copyTiles(bg0, frame.tiles, 0x12, 9);
    copyTiles(bg0, frame.tiles, 0x22, 9);
    palettes.load(frame.palette, 16, 16);
    this.windows = Object.fromEntries(Object.entries(WINDOWS).map(([id, t]) => [id, new Window(bg0, t)])) as Record<WindowId, Window>;

    this.terrain.forEach((bg) => initBg(bg, 1, 3));
    this.drawTerrain();

    const battlers = doubles ? 4 : 2;
    this.mons = new Array<MonSprite | null>(battlers).fill(null);
    this.healthboxes = Array.from({ length: battlers }, (_, id) => new Healthbox(flow, id % 2 === 1, doubles, id >> 1));
    gba.setVBlank(gba.standardVBlank);
  }

  /** The terrain on BG3 (DrawMainBattleBackground, sBattleTerrainTable); `split`: in halves on BG3 and BG2, for the intro's slide. */
  drawTerrain(split = false): void {
    const { assets } = this.flow;
    const name = TERRAIN_ART[this.terrainId] ?? "building";
    const terrain = assets.get(`battleTerrain_${name}`);
    const palette = this.terrainId === TERRAIN_PLAIN ? assets.get("battleTerrainPlainPal").palette : terrain.palette;
    this.flow.gba.palettes.load(palette, 2 * 16, 48);
    this.terrain.forEach((bg, half) => {
      bg.tiles = terrain.tiles;
      bg.map.set(terrain.map!.subarray(0, bg.map.length));
      if (split) for (let ty = 0; ty < 32; ty++) for (let tx = 0; tx < 64; tx++) if ((ty < 10) !== (half === 0)) bg.setEntry(tx, ty, 0);
      bg.x = bg.y = 0;
      bg.visible = split || half === 0;
    });
  }

  /** The terrain's entry art (LoadBattleTerrainEntryGfx: the grass, sand or waves the intro slides in on BG1). */
  terrainEntry(): Graphic {
    return this.flow.assets.get(`battleTerrainEntry_${TERRAIN_ART[this.terrainId] ?? "building"}`);
  }

  /** gBattle_BG3_X / Y: the terrain's (or a move background's) scroll, in pixels. */
  get scrollX(): number {
    return this.terrain[0].x >> 8;
  }

  set scrollX(x: number) {
    for (const bg of this.terrain) bg.x = x * 256;
  }

  get scrollY(): number {
    return this.terrain[0].y >> 8;
  }

  set scrollY(y: number) {
    for (const bg of this.terrain) bg.y = y * 256;
  }

  /** A move's background in place of the terrain (LoadMoveBg): on BG3, its colors in palette 2. */
  showMoveBackground(art: Graphic): void {
    const [bg3, bg2] = this.terrain;
    bg2.visible = false;
    bg3.tiles = art.tiles;
    // The map is 512 wide for the terrain; FireRed's sliding backgrounds wrap at 256 (ToggleBg3Mode), so both screens hold the art.
    if (art.map) for (const screen of [0, 1024]) bg3.map.set(art.map.subarray(0, 1024), screen);
    bg3.x = bg3.y = 0;
    this.flow.gba.palettes.load(art.palette, 2 * 16, 16);
  }

  /** The textbox page shown. */
  set page(page: Page) {
    this.bg0.y = page * 256;
  }

  /** The intro's slide: the foe's half of the terrain `d` pixels left, the player's `d` right. */
  set terrainSlide(d: number) {
    this.terrain[0].x = d * 256;
    this.terrain[1].x = -d * 256;
  }

  /** The intro's window: only rows `top` to `bottom` show, black around. */
  setReveal(top: number, bottom: number): void {
    const { video } = this.flow.gba;
    if (top <= 0 && bottom >= 160) {
      video.win0On = false;
      return;
    }
    video.win0On = true;
    Object.assign(video.win0, { left: 0, right: 240, top, bottom });
    video.winIn0 = Layer.ALL;
    video.winOut = 0;
  }

  // Text

  /** BattlePutTextOnWindow: the window cleared, then the text at once (`speed` 0) or at the text speed. */
  print(id: WindowId, text: Text, speed = 0, x?: number): void {
    const { flow } = this;
    const win = this.windows[id];
    const style = STYLES[id];
    win.fill(style.fill);
    win.putTilemap();
    const font = flow.fonts[style.font];
    flow.text.ctx.canABSpeedUpPrint = id === "msg";
    flow.text.add(win, { font, x: x ?? style.x, y: style.y, letterSpacing: style.letterSpacing ?? 0, lineSpacing: style.lineSpacing, colors: style.colors, alternateDownArrow: true }, speed, text);
    if (speed === 0) win.copyToVram();
  }

  /** A battle message at the text speed; done once printed (and any prompt in it answered). */
  *message(text: Text, wait = 64): Generator<void, void, void> {
    this.page = Page.Message;
    this.print("msg", text, textSpeedDelay(this.flow.options));
    while (this.flow.text.isActive(this.windows.msg)) yield;
    for (let i = 0; i < wait; i++) yield;
  }

  clearMessage(): void {
    this.windows.msg.fill(15);
    this.windows.msg.copyToVram();
  }

  /**
   * HandleBattleWindow: a frame of the textbox's tiles over BG0 (the level up box is on BG1 in the
   * game, over the textbox). Returns what takes it away again.
   */
  openWindow(left: number, top: number, right: number, bottom: number): () => void {
    const { bg0 } = this;
    const saved: [number, number, number][] = [];
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        saved.push([x, y, bg0.entry(x, y)]);
        const row = y === top ? 0x1022 : y === bottom ? 0x1028 : 0x1025;
        bg0.setEntry(x, y, row + (x === left ? 0 : x === right ? 2 : 1));
      }
    }
    return () => {
      for (const [x, y, entry] of saved) bg0.setEntry(x, y, entry);
    };
  }

  /** The window's pixels, cleared and on the map, to draw on (then `copyToVram`). */
  blankWindow(id: WindowId): Window {
    const win = this.windows[id];
    win.fill(STYLES[id].fill);
    win.putTilemap();
    return win;
  }

  /**
   * Cmd_yesnoboxlearnmove: YES (true) or NO (false, B too), up and down, with its own frame. Fades
   * and what comes after are the caller's.
   */
  *yesNo(): Generator<void, boolean, void> {
    const { input } = this.flow.gba;
    const close = this.openWindow(23, 8, 29, 13);
    this.print("yesNo", this.flow.assets.text("gText_BattleYesNoChoice"));
    let cursor = 0;
    this.setCursor(24, 9, true);
    for (;;) {
      yield;
      const next = input.isPressed(Button.Up) ? 0 : input.isPressed(Button.Down) ? 1 : cursor;
      if (next !== cursor) {
        this.flow.play("se_select");
        this.setCursor(24, 9 + 2 * cursor, false);
        cursor = next;
        this.setCursor(24, 9 + 2 * cursor, true);
      } else if (input.isPressed(Button.A | Button.B)) {
        const yes = cursor === 0 && input.isPressed(Button.A);
        this.flow.play("se_select");
        close();
        return yes;
      }
    }
  }

  /** The cursor (tiles 1 and 2) or its blank (tile 32) at a tile of BG0. */
  setCursor(x: number, y: number, on: boolean): void {
    // CopyToBgTilemapBufferRect_ChangePalette(…, 0x11): past 16 the entries are copied as they
    // are, so the cursor and its blank use palette 0.
    this.bg0.setEntry(x, y, on ? 1 : 32);
    this.bg0.setEntry(x, y + 1, on ? 2 : 32);
  }

  // Sprites

  /** The trainer's picture: the foe's front pic, or the player's back pic (Red's or Leaf's, with the throw). */
  showTrainer(foe: boolean, pic: string): Sprite | null {
    const { gba, assets } = this.flow;
    const id = foe ? TRAINER_PICS[pic] : this.gender === Gender.GIRL ? "backPicLeaf" : "backPicRed";
    if (!id) return null;
    const g = assets.get(id);
    const tag = foe ? "trainerFront" : "trainerBack";
    gba.sprites.loadSheet(tag, g.tiles);
    gba.palettes.loadSpritePalette(tag, g.palette);
    const [x, y] = foe ? TRAINER_COORDS.foe : TRAINER_COORDS.player;
    const sprite = gba.sprites.create({ sheet: tag, palette: tag, width: 64, height: 64, priority: 2, anims: foe ? undefined : BACK_PIC_ANIMS }, x, y, foe ? 1 : 0);
    this.trainers[foe ? 1 : 0] = sprite;
    return sprite;
  }

  hideTrainer(foe: boolean): void {
    const i = foe ? 1 : 0;
    this.flow.gba.sprites.destroy(this.trainers[i]);
    this.trainers[i] = null;
  }

  /** sBattlerCoords: where a battler stands, whoever it is. */
  spot(b: Spot): readonly [number, number] {
    return (this.doubles ? MON_COORDS_DOUBLES : MON_COORDS)[battlerId(b)];
  }

  /** Where a Pokémon stands: its side's spot, moved by its picture's offset (and a foe's elevation). */
  monPosition(info: BattlerInfo): [number, number] {
    const foe = info.battler?.foe ?? false;
    const [front, back, elevation] = this.flow.assets.species(info.species).coords ?? [0, 0, 0];
    const [x, y] = this.spot({ foe, position: info.battler?.position ?? 0 });
    return [x, foe ? y + front - elevation : y + back];
  }

  /** GetBattlerYDeltaFromSpriteId: how far down its 64×64 box its picture sits. */
  monYDelta(info: BattlerInfo): number {
    const [front, back] = this.flow.assets.species(info.species).coords ?? [0, 0, 0];
    return info.battler?.foe ? front : back;
  }

  /** The Pokémon's sprite (its art must be loaded), replacing the one at its spot. */
  showMon(info: BattlerInfo, back?: IndexedImage): MonSprite | null {
    const foe = info.battler?.foe ?? false;
    const id = battlerId({ foe, position: info.battler?.position ?? 0 });
    const art = this.flow.assets.loadedPokemonArt(info.species);
    const pic = foe ? art?.front : back;
    if (!art || !pic) return null;
    this.mons[id]?.destroy();
    const [x, y] = this.monPosition(info);
    // GetBattlerSpriteSubpriority: move animations' sprites go in front of or behind it.
    const mon = new MonSprite(this.flow, `battler${id}`, pic, info.shiny ? art.shinyPalette : art.frontPalette, x, y, MON_SUBPRIORITY[id]);
    this.mons[id] = mon;
    return mon;
  }

  /** The Pokémon's sprite at a spot, if one stands there. */
  mon(b: Spot): MonSprite | null {
    return this.mons[battlerId(b)] ?? null;
  }

  removeMon(b: Spot): void {
    const id = battlerId(b);
    this.mons[id]?.destroy();
    this.mons[id] = null;
  }

  healthbox(b: Spot): Healthbox {
    return this.healthboxes[battlerId(b)];
  }

  /** The healthbox drawn for a Pokémon and shown. */
  showHealthbox(mon: HealthboxMon, b: Spot): void {
    const box = this.healthbox(b);
    box.show(mon);
    box.offset = 0;
    box.visible = true;
  }

  /** Everything on the field as the state has it: the Pokémon at their spots, their healthboxes. */
  drawField(state: BattleState, backPics: Map<number, IndexedImage>, healthboxMon: (info: BattlerInfo) => HealthboxMon): void {
    this.page = Page.Message;
    for (const side of state.sides) {
      side.active.forEach((info, position) => {
        if (!info) return;
        const mon = this.showMon(info, backPics.get(info.species));
        if (mon) mon.sprite.startAffineAnim(0);
        this.showHealthbox(healthboxMon(info), { foe: side.foe, position });
      });
    }
  }
}
