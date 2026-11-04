// FireRed's scene for an item used on a Pokémon outside battle (pokemon_special_anim.c,
// pokemon_special_anim_scene.c): the Pokémon's picture comes closer the friendlier it is, the item
// appears and shrinks into it, sparkles, "<item> was used on <name>.", and it goes back. A or B held
// before the message skips it. mic-core has already decided and saved the item: this only shows it.
// The level up, machine and can't-evolve variants (phase-6 M2, M3) belong on this file.

import type { Item } from "@pokeuniverse/contracts/item/v1/catalog";
import { toTiles } from "../gba/assets";
import { Button } from "../gba/input";
import { PALETTES_ALL } from "../gba/palette";
import type { AffineCmd, Sprite, SpriteTemplate } from "../gba/sprites";
import { FontId, joinText, Window, type Text, type WindowTemplate } from "../gba/text";
import { SIN } from "../gba/trig";
import { RGB_BLACK, RGB_WHITE } from "../gba/video";
import { iconTiles, initBg, loadBg } from "./common";
import type { Flow } from "./flow";
import { userFrame, type ItemIcon, type PokemonArt } from "./manifest";
import { copyTiles, drawStdFrame } from "./menu";
import { textSpeedDelay } from "./options";

export interface UseItemScene {
  species: number;
  shiny: boolean;
  name: Text;
  item: Item;
  /** GetClosenessFromFriendship, from mic-core: 0-3. */
  closeness: number;
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
  anims: [[{ image: 1, duration: 4 }, { image: 0, duration: 4 }, "end"]],
};

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

/** Loads the Pokémon and the item on the black screen, plays the scene, then `done` on a black screen. */
export function startUseItemScene(flow: Flow, use: UseItemScene, done: () => void): void {
  flow.gba.setMain(() => {});
  void Promise.all([flow.assets.pokemonArt(use.species), flow.assets.itemIcon(use.item)]).then(
    ([art, icon]) => new Scene(flow, use, art, icon, done),
    () => done(),
  );
}

class Scene {
  private readonly mon: Sprite;
  private readonly monY2: number;
  private shownCloseness = 0;
  private cancelDisabled = false;
  private activeDots = 0;

  constructor(
    private readonly flow: Flow,
    private readonly use: UseItemScene,
    art: PokemonArt,
    private readonly icon: ItemIcon,
    private readonly done: () => void,
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
    palettes.load(bg.palette, 0, 16);

    // PSA_CreateMonSpriteAtCloseness.
    sprites.loadSheet("useItemMon", toTiles(art.front));
    palettes.loadSpritePalette("useItemMon", use.shiny ? art.shinyPalette : art.frontPalette);
    this.monY2 = assets.species(use.species).itemScene[2] + 48;
    this.mon = sprites.create(MON_TEMPLATE, MON_X, MON_Y, 4)!;
    this.placeMon(0);

    palettes.blendPalettes(PALETTES_ALL, 16, RGB_BLACK);
    palettes.beginFade(PALETTES_ALL, -1, 16, 0, RGB_BLACK);
    const script = this.run();
    gba.tasks.create(() => {
      if (!this.cancelDisabled && gba.input.held & (Button.A | Button.B)) return this.cancel();
      if (script.next().done) this.finish();
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
    const text = joinText(assets.itemName(use.item), assets.text("gText_WasUsedOn"), use.name, assets.text("gText_Period"));
    flow.text.add(win, { font: fonts[FontId.Normal], x: 0, y: 0, letterSpacing: 0, lineSpacing: 4, colors: [1, 2, 3] }, textSpeedDelay(flow.options), text);
    yield;
    while (flow.text.isActive(win)) yield;
    yield* this.zoomTo(0);
    while (!gba.input.isPressed(Button.A) && !gba.input.isPressed(Button.B)) yield;
    gba.palettes.beginFade(PALETTES_ALL, -1, 0, 16, RGB_BLACK);
    yield;
    while (gba.palettes.fadeActive) yield;
  }

  /** Task_CleanUp: the screen goes black at once; the item is used all the same. */
  private cancel(): void {
    const { palettes, tasks } = this.flow.gba;
    palettes.blendPalettes(PALETTES_ALL, 16, RGB_BLACK);
    tasks.reset();
    tasks.create(() => {
      if (!palettes.fadeActive) this.finish();
    }, 0);
  }

  private finish(): void {
    this.flow.gba.tasks.reset();
    this.done();
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
      yield;
      this.flow.play("se_ball_tray_exit");
      this.placeMon(at);
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
    const { flow, use, icon } = this;
    const { gba, assets } = flow;
    const { sprites, palettes } = gba;
    sprites.loadSheet("useItemIcon", iconTiles(icon.image!));
    palettes.loadSpritePalette("useItemIcon", icon.palette);
    const closeness = use.closeness;
    const sprite = sprites.create(ITEM_TEMPLATE, ITEM_X, this.yAt(closeness), 1);
    if (!sprite) return;
    // ItemSpriteZoom_UpdateYPos: the species' spot on the picture, as scaled.
    const [, , , itemX, itemY] = assets.species(use.species).itemScene;
    sprite.x2 = ((itemX - 32) * SCALES[closeness]) >> 8;
    sprite.y2 = ((itemY - 32) * SCALES[closeness]) >> 8;
    sprite.startAffineAnim(closeness);
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

  /** CreateSprites_UseItem_OutwardSpiralDots: white dots spiralling out from a point. */
  private sparkle(x: number, y: number): void {
    const { sprites, palettes } = this.flow.gba;
    for (let i = 0; i < SPARKLE_DOTS; i++) {
      const dot = sprites.create(DOT_TEMPLATE, x, y, 0);
      if (!dot) continue;
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
