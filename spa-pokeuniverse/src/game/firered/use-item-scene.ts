// FireRed's scene for an item used on a Pokémon outside battle (pokemon_special_anim.c,
// pokemon_special_anim_scene.c): the Pokémon's picture comes closer the friendlier it is, the item
// appears and shrinks into it, sparkles, "<item> was used on <name>.", and it goes back. A or B held
// before the message skips it. mic-core has already decided and saved the item: this only shows it.
// A TM or HM has its own script (Task_UseTM_NoForget, Task_ForgetMove, Task_MachineSet).

import type { Item } from "@pokeuniverse/contracts/item/v1/catalog";
import { toTiles } from "../gba/assets";
import { Button } from "../gba/input";
import { PALETTES_ALL } from "../gba/palette";
import type { AffineCmd, Sprite, SpriteTemplate } from "../gba/sprites";
import { expandDynamic, FontId, joinText, Window, type Text, type WindowTemplate } from "../gba/text";
import { SIN } from "../gba/trig";
import { rgb, RGB_BLACK, RGB_WHITE } from "../gba/video";
import { iconTiles, initBg, loadBg } from "./common";
import type { Flow } from "./flow";
import { userFrame, type ItemIcon, type PokemonArt } from "./manifest";
import { clearStdWindowAndFrameToTransparent, copyTiles, drawStdFrame } from "./menu";
import { textSpeedDelay } from "./options";

export interface UseItemScene {
  species: number;
  shiny: boolean;
  name: Text;
  item: Item;
  /** GetClosenessFromFriendship, from mic-core: 0-3. */
  closeness: number;
  /** Task_EvoStone_CantEvolve: "Huh?", and the picture stays until a press. */
  cantEvolve?: boolean;
  /** A TM or HM: the move it teaches and the one it replaces, if any. */
  machine?: { move: number; forgot?: number };
}

/** sAffineScales, by closeness. */
const SCALES = [0x100, 0x155, 0x1aa, 0x200];
/** sAffineAnim_ItemZoom_*: the item shrinking away, a step per frame for 8 frames. */
const ITEM_SHRINK = [-28, -37, -47, -56];

const scaleCmd = (scale: number, duration = 0): AffineCmd => ({ xScale: scale, yScale: scale, duration });
const ZOOM: AffineCmd[][] = SCALES.map((s) => [scaleCmd(s), "end"]);
const ITEM_ZOOM: AffineCmd[][] = SCALES.map((s, i) => [scaleCmd(s), scaleCmd(ITEM_SHRINK[i], 8), "end"]);

const MON_TEMPLATE: SpriteTemplate = { sheet: "useItemMon", palette: "useItemMon", width: 64, height: 64, priority: 1, affine: true, affineAnims: ZOOM };
const ITEM_TEMPLATE: SpriteTemplate = { sheet: "useItemIcon", palette: "useItemIcon", width: 32, height: 32, priority: 1, affine: true, affineAnims: ZOOM };
const DOT_TEMPLATE: SpriteTemplate = {
  sheet: "useItemDots",
  palette: "useItemDots",
  width: 8,
  height: 8,
  priority: 0,
  anims: [
    [{ image: 0, duration: 16 }, { image: 1, duration: 8 }, { image: 2, duration: 4 }, "end"],
    [{ image: 1, duration: 4 }, { image: 0, duration: 4 }, "end"],
  ],
};

const STAR_TEMPLATE: SpriteTemplate = { sheet: "useItemStar", palette: "useItemStar", width: 16, height: 16, priority: 1 };
/** sStarCoordOffsets. */
const STAR_OFFSETS = [
  [-8, -8],
  [6, -13],
  [8, -8],
] as const;
const STAR_FRAMES = 10;
const MAX_CLOSENESS = 3;
/** The background's glow while a machine teaches. */
const MACHINE_GLOW = rgb(8, 13, 31);
/** Task_UseItem_OutwardSpiralDots. */
const MACHINE_DOTS = 48;
const MACHINE_DOTS_SEED = 2022069025;

const MON_X = 120;
const MON_Y = 72;
/** InitItemIconSpriteState. */
const ITEM_X = MON_X + 4;
const SPARKLE_BURSTS = 3;
const SPARKLE_DOTS = 15;
const SPARKLE_FRAMES = 16;

/** sWindowTemplates; the frame's tiles start at 1 (sBgTemplates' baseTile). */
const MESSAGE_WINDOW: WindowTemplate = { left: 1, top: 15, width: 28, height: 4, palette: 15, baseBlock: 0x0a };
const FRAME_TILE = 1;
const FRAME_TILES = 9;
const FRAME_PALETTE = 14;
const BG0_TILES = MESSAGE_WINDOW.baseBlock + MESSAGE_WINDOW.width * MESSAGE_WINDOW.height;

/** Loads the Pokémon and the item on the black screen, plays the scene, then `done` on a black screen (`played`: it wasn't stopped). */
export function startUseItemScene(flow: Flow, use: UseItemScene, done: (played: boolean) => void): void {
  flow.gba.setMain(() => {});
  void Promise.all([flow.assets.pokemonArt(use.species), flow.assets.itemIcon(use.item)]).then(
    ([art, icon]) => new Scene(flow, use, art, icon, done),
    () => done(false),
  );
}

class Scene {
  private readonly mon: Sprite;
  private readonly monY2: number;
  private shownCloseness = 0;
  private cancelDisabled = false;
  private activeDots = 0;
  /** The TM or HM over the Pokémon, zooming with it. */
  private machineIcon: Sprite | null = null;

  constructor(
    private readonly flow: Flow,
    private readonly use: UseItemScene,
    art: PokemonArt,
    private readonly icon: ItemIcon,
    private readonly done: (played: boolean) => void,
  ) {
    const { gba, assets } = flow;
    const { video, palettes, sprites } = gba;
    gba.setVBlank(null);
    gba.reset();

    // InitPokemonSpecialAnimScene: the message on BG 0, the background on BG 3.
    const [bg0, , , bg3] = video.bgs;
    initBg(bg0, 0, 0);
    bg0.tiles = new Uint8Array(BG0_TILES * 64);
    bg0.visible = true;
    const frame = assets.get(userFrame(flow.options.frame));
    copyTiles(bg0, frame.tiles, FRAME_TILE, FRAME_TILES);
    palettes.load(frame.palette, FRAME_PALETTE * 16, 16);
    // Palette 15 is what the party menu left: the standard text colors.
    palettes.load(assets.get("textWindowPal3").palette, MESSAGE_WINDOW.palette * 16, 16);
    initBg(bg3, 0, 3);
    const bg = assets.get("useItemBg");
    loadBg(bg3, bg);
    bg3.visible = true;
    // LoadBgGfxByAnimType.
    palettes.load(use.machine ? assets.get("useItemMachinePal").palette : bg.palette, 0, 16);

    // PSA_CreateMonSpriteAtCloseness.
    sprites.loadSheet("useItemMon", toTiles(art.front));
    palettes.loadSpritePalette("useItemMon", use.shiny ? art.shinyPalette : art.frontPalette);
    this.monY2 = assets.species(use.species).itemScene[2] + 48;
    this.mon = sprites.create(MON_TEMPLATE, MON_X, MON_Y, 4)!;
    // PSA_CreateMonSpriteAtCloseness(3): a machine's scene starts close, the others far.
    this.shownCloseness = use.machine ? MAX_CLOSENESS : 0;
    this.cancelDisabled = use.machine?.forgot !== undefined;
    this.placeMon(this.shownCloseness);

    palettes.blendPalettes(PALETTES_ALL, 16, RGB_BLACK);
    palettes.beginFade(PALETTES_ALL, -1, 16, 0, RGB_BLACK);
    const script = use.machine ? this.runMachine(use.machine.move, use.machine.forgot) : this.run();
    const stopped = () => (use.machine ? gba.input.isPressed(Button.B) : (gba.input.held & (Button.A | Button.B)) !== 0);
    gba.tasks.create(() => {
      if (!this.cancelDisabled && stopped()) return this.cancel();
      if (script.next().done) this.finish(true);
    }, 0);
    gba.setVBlank(gba.standardVBlank);
    gba.setMain(() => flow.runFrame());
  }

  /** Task_UseItem_Normal. */
  private *run(): Generator<void, void, void> {
    const { flow, use } = this;
    const { gba } = flow;
    while (gba.palettes.fadeActive) yield;
    yield* this.zoomTo(use.closeness);
    yield* this.itemOnMon();
    this.cancelDisabled = true;
    if (use.closeness === 3) flow.playCry(use.species);
    const win = new Window(gba.video.bgs[0], MESSAGE_WINDOW);
    drawStdFrame(win, FRAME_TILE, FRAME_PALETTE);
    yield;
    const { assets, fonts } = flow;
    const text = use.cantEvolve ? assets.text("gText_Huh") : joinText(assets.itemName(use.item), assets.text("gText_WasUsedOn"), use.name, assets.text("gText_Period"));
    flow.text.add(win, { font: fonts[FontId.Normal], x: 0, y: 0, letterSpacing: 0, lineSpacing: 4, colors: [1, 2, 3] }, textSpeedDelay(flow.options), text);
    yield;
    while (flow.text.isActive(win)) yield;
    if (!use.cantEvolve) yield* this.zoomTo(0);
    while (!gba.input.isPressed(Button.A) && !gba.input.isPressed(Button.B)) yield;
    gba.palettes.beginFade(PALETTES_ALL, -1, 0, 16, RGB_BLACK);
    yield;
    while (gba.palettes.fadeActive) yield;
  }

  /** Task_UseTM_NoForget or Task_ForgetMove, then Task_MachineSet. */
  private *runMachine(move: number, forgot: number | undefined): Generator<void, void, void> {
    const { flow, use } = this;
    const { gba, assets } = flow;
    const { palettes } = gba;
    while (palettes.fadeActive) yield;
    if (forgot !== undefined) yield* this.forgetMove(forgot);
    else yield* this.wait(21);
    this.cancelDisabled = false;

    const icon = this.createItemSprite(MAX_CLOSENESS);
    this.machineIcon = icon;
    const win = this.messageWindow();
    yield* this.say(win, assets.text("gText_MachineSet"));
    clearStdWindowAndFrameToTransparent(win);

    // SpriteCB_MachineSetWobble.
    flow.play("se_switch");
    this.mon.x += 3;
    if (icon) icon.x += 3;
    yield* this.wait(31);
    this.mon.x -= 3;
    if (icon) icon.x -= 3;

    // Task_MachineSet's states 4 to 6, then PSA_UseTM_RunZoomOutAnim.
    yield* this.wait(3);
    yield* this.zoomTo(0);
    yield* this.wait(21);
    let wiggle = 0;
    this.mon.callback = () => {
      if (++wiggle % 2 === 0) this.mon.x2 = wiggle % 4 === 0 ? -1 : 1;
    };
    yield;
    flow.play("se_m_mega_kick");
    palettes.beginFade(1, 2, 0, 12, MACHINE_GLOW);
    const dots = this.machineDots(icon);
    for (let i = 0; i < 71; i++) {
      dots.next();
      yield;
    }
    this.mon.callback = () => {};
    this.mon.x2 = 0;
    palettes.beginFade(1, 6, 12, 0, MACHINE_GLOW);
    yield* this.wait(41);
    while (this.activeDots > 0) yield;
    yield* this.wait(21);
    flow.play("se_exp_max");
    if (icon) gba.sprites.destroy(icon);
    this.machineIcon = null;

    yield* this.wait(31);
    const learned = this.messageWindow();
    yield* this.say(learned, expandDynamic(assets.text("gText_MonLearnedTMHM"), [use.name, assets.moveName(move)]));
    gba.sound.playFanfare("mus_level_up");
    this.cancelDisabled = true;
    yield;
    while (gba.sound.fanfarePlaying) yield;
    palettes.blendPalettes(PALETTES_ALL, 16, RGB_BLACK);
    yield;
  }

  /** Task_ForgetMove: "1, 2, and... Poof!", the Pokémon dark among stars, what it forgot. */
  private *forgetMove(forgot: number): Generator<void, void, void> {
    const { flow, use } = this;
    const { gba, assets, fonts } = flow;
    const { palettes } = gba;
    yield* this.wait(31);
    const win = this.messageWindow();
    const one = assets.text("gText_Counting_1");
    const two = assets.text("gText_Counting_2And");
    const font = fonts[FontId.Normal];
    yield* this.say(win, one, 0, 1);
    yield* this.wait(31);
    yield* this.say(win, two, font.width(one, 0), 1);
    yield* this.wait(31);
    flow.play("se_m_spit_up");
    const mask = (1 << (16 + this.mon.paletteNum)) | 4;
    palettes.blendPalettes(mask, 16, RGB_BLACK);
    const stars = this.createStars();
    this.print(win, assets.text("gText_Poof"), font.width(one, 0) + font.width(two, 0), 1);
    yield;
    while (stars.some((star) => star.data[0] < STAR_FRAMES)) yield;
    palettes.beginFade(mask, -1, 16, 0, RGB_BLACK);
    yield;
    while (palettes.fadeActive || flow.text.isActive(win)) yield;
    win.fill(1);
    win.copyToVram();
    yield* this.say(win, expandDynamic(assets.text("gText_MonForgotMove"), [use.name, assets.moveName(forgot)]));
    yield* this.say(win, assets.text("gText_And"));
    clearStdWindowAndFrameToTransparent(win);
    yield;
  }

  /** PSA_ShowMessageWindow. */
  private messageWindow(): Window {
    const win = new Window(this.flow.gba.video.bgs[0], MESSAGE_WINDOW);
    win.fill(1);
    drawStdFrame(win, FRAME_TILE, FRAME_PALETTE);
    win.copyToVram();
    return win;
  }

  /** PSA_PrintMessage. */
  private print(win: Window, text: Text, x = 0, speed = textSpeedDelay(this.flow.options)): void {
    this.flow.text.add(win, { font: this.flow.fonts[FontId.Normal], x, y: 0, letterSpacing: 0, lineSpacing: 4, colors: [1, 2, 3] }, speed, text);
  }

  private *say(win: Window, text: Text, x = 0, speed?: number): Generator<void, void, void> {
    this.print(win, text, x, speed);
    yield;
    while (this.flow.text.isActive(win)) yield;
  }

  /** CreateStarSprites, SpriteCB_Star: three stars flying out; each one counts its frames. */
  private createStars(): Sprite[] {
    const { gba, assets } = this.flow;
    const star = assets.get("useItemStar");
    gba.sprites.loadSheet("useItemStar", star.tiles);
    gba.palettes.loadSpritePalette("useItemStar", star.palette);
    const [machineX, machineY] = assets.species(this.use.species).itemScene;
    const scale = SCALES[MAX_CLOSENESS];
    const out: Sprite[] = [];
    for (const [dx, dy] of STAR_OFFSETS) {
      const sprite = gba.sprites.create(STAR_TEMPLATE, MON_X + dx + (((machineX - 32) * scale) >> 8), this.monY2 + dy + (((machineY - 32) * scale) >> 8), 2);
      if (!sprite) continue;
      let x = 0;
      let y = 0;
      sprite.data[0] = 0;
      sprite.callback = () => {
        if (++sprite.data[0] < STAR_FRAMES) {
          x += dx * 8;
          y += dy * 8;
          sprite.x2 = x >> 4;
          sprite.y2 = y >> 4;
        } else gba.sprites.destroy(sprite);
      };
      out.push(sprite);
    }
    return out;
  }

  /** Task_UseItem_OutwardSpiralDots: dots drawn into the machine from a ring around it, one a frame. */
  private *machineDots(icon: Sprite | null): Generator<void, void, void> {
    const { gba, assets } = this.flow;
    if (!icon) return;
    const dots = assets.get("useItemDots");
    gba.sprites.loadSheet("useItemDots", dots.tiles);
    gba.palettes.loadSpritePalette("useItemDots", dots.palette);
    const toX = icon.x + icon.x2;
    const toY = icon.y + icon.y2;
    let seed = MACHINE_DOTS_SEED;
    const random = () => {
      seed = (Math.imul(seed, 1103515245) + 24691) | 0;
      return seed >>> 16;
    };
    let angle = 0xe0;
    for (let i = 0; i < MACHINE_DOTS; i++) {
      const reach = (random() % 21) + 70;
      const fromX = toX + ((SIN[angle + 64] * reach) >> 8);
      const fromY = toY + ((SIN[angle] * reach) >> 8);
      angle = (angle + 0x4c) & 0xff;
      const dot = gba.sprites.create(DOT_TEMPLATE, fromX, fromY, 0);
      if (dot) {
        const speed = (random() & 1) + 6;
        let radius = 0;
        this.activeDots++;
        dot.callback = () => {
          radius += speed;
          if (radius > 255) {
            this.activeDots--;
            gba.sprites.destroy(dot);
            return;
          }
          dot.x = (((toX - fromX) * radius) >> 8) + fromX;
          dot.y = (((toY - fromY) * radius) >> 8) + fromY;
        };
      }
      yield;
    }
  }

  /** Task_CleanUp: the screen goes black at once; the item is used all the same. */
  private cancel(): void {
    const { palettes, tasks } = this.flow.gba;
    palettes.blendPalettes(PALETTES_ALL, 16, RGB_BLACK);
    tasks.reset();
    tasks.create(() => {
      if (!palettes.fadeActive) this.finish(false);
    }, 0);
  }

  private finish(played: boolean): void {
    this.flow.gba.tasks.reset();
    this.done(played);
  }

  /** GetYPosByScale. */
  private yAt(closeness: number): number {
    return (((this.monY2 - MON_Y) * (SCALES[closeness] - 0x100)) >> 8) + MON_Y;
  }

  /** MonSpriteZoom_UpdateYPos. */
  private placeMon(closeness: number): void {
    this.mon.startAffineAnim(closeness);
    this.mon.y = this.yAt(closeness);
  }

  /** Task_ZoomAnim: a step at a time, each with its sound. */
  private *zoomTo(closeness: number): Generator<void, void, void> {
    if (closeness === this.shownCloseness) return;
    const delta = closeness > this.shownCloseness ? 1 : -1;
    for (let at = this.shownCloseness + delta; ; at += delta) {
      // Task_ZoomAnim: states 0 and 1, then its delay: 9 frames a step.
      yield;
      yield;
      this.flow.play("se_ball_tray_exit");
      this.placeMon(at);
      if (this.machineIcon) this.placeItem(this.machineIcon, at);
      if (at === closeness) break;
      yield* this.wait(7);
    }
    this.shownCloseness = closeness;
    yield;
  }

  private *wait(frames: number): Generator<void, void, void> {
    for (let i = 0; i < frames; i++) yield;
  }

  /** Task_ItemUseOnMonAnim: the item over the Pokémon, shrinking into it whitened, then three bursts of sparkles. */
  private *itemOnMon(): Generator<void, void, void> {
    const { flow, use } = this;
    const { gba, assets } = flow;
    const { sprites, palettes } = gba;
    const closeness = use.closeness;
    const sprite = this.createItemSprite(closeness);
    if (!sprite) return;
    sprite.invisible = true;

    yield* this.wait(21);
    flow.play("se_m_swagger2");
    sprite.invisible = false;
    const dots = assets.get("useItemDots");
    sprites.loadSheet("useItemDots", dots.tiles);
    palettes.loadSpritePalette("useItemDots", dots.palette);

    yield* this.wait(31);
    sprite.affineAnims = ITEM_ZOOM;
    sprite.startAffineAnim(closeness);
    palettes.beginFade(1 << (16 + sprite.paletteNum), -2, 0, 12, RGB_WHITE);
    flow.play("se_m_milk_drink");
    while (!sprite.affineEnded) yield;
    sprite.invisible = true;

    for (let burst = 0; burst < SPARKLE_BURSTS; burst++) {
      yield* this.wait(burst === 0 ? 21 : 9);
      this.sparkle(sprite.x + sprite.x2 - 4, sprite.y + sprite.y2 - 4);
      if (burst === 0) flow.play("se_m_reversal");
    }
    while (this.activeDots > 0) yield;
    sprites.destroy(sprite);
  }

  /** PSA_CreateItemIconObject, InitItemIconSpriteState. */
  private createItemSprite(closeness: number): Sprite | null {
    const { sprites, palettes } = this.flow.gba;
    sprites.loadSheet("useItemIcon", iconTiles(this.icon.image!));
    palettes.loadSpritePalette("useItemIcon", this.icon.palette);
    const sprite = sprites.create(ITEM_TEMPLATE, ITEM_X, this.yAt(closeness), 1);
    if (sprite) this.placeItem(sprite, closeness);
    return sprite;
  }

  /** ItemSpriteZoom_UpdateYPos: the species' spot on the picture (a machine has its own), as scaled. */
  private placeItem(sprite: Sprite, closeness: number): void {
    const [machineX, machineY, , itemX, itemY] = this.flow.assets.species(this.use.species).itemScene;
    const [x, y] = this.use.machine ? [machineX, machineY] : [itemX, itemY];
    sprite.y = this.yAt(closeness);
    sprite.x2 = ((x - 32) * SCALES[closeness]) >> 8;
    sprite.y2 = ((y - 32) * SCALES[closeness]) >> 8;
    sprite.startAffineAnim(closeness);
  }

  /** CreateSprites_UseItem_OutwardSpiralDots: white dots spiralling out from a point. */
  private sparkle(x: number, y: number): void {
    const { sprites, palettes } = this.flow.gba;
    for (let i = 0; i < SPARKLE_DOTS; i++) {
      const dot = sprites.create(DOT_TEMPLATE, x, y, 0);
      if (!dot) continue;
      dot.startAnim(1);
      palettes.blendPalettes(1 << (16 + dot.paletteNum), 16, RGB_WHITE);
      let frames = 0;
      let angle = i << 4;
      let radius = 0;
      this.activeDots++;
      dot.callback = () => {
        if (frames++ >= SPARKLE_FRAMES) {
          this.activeDots--;
          sprites.destroy(dot);
          return;
        }
        angle = (angle + 7) & 0xff;
        radius += 4;
        dot.x2 = (radius * SIN[angle + 64]) >> 8;
        dot.y2 = (radius * SIN[angle]) >> 8;
      };
    }
  }
}
