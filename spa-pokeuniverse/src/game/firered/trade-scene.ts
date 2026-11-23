// The wireless trade scene (trade_scene.c, CB2_LinkTrade and DoTradeAnim_Wireless): the own Pokémon
// slides in and goes into its ball, the ball bounces away, the GBA zooms out and sends the signal,
// both Pokémon cross in the white column, the signal comes back, the GBA zooms in and the ball
// brings the received Pokémon out: "{NAME} sent over {MON}.", its cry, the fanfare, "Take good care
// of {MON}!". It decides nothing (phase-9 M10): mic-core swapped both already. Once it ends the
// scene stays on screen for what follows (`after`: the save, the wait for the partner).
//
// VRAM is kept as FireRed leaves it between its BG setups (SetTradeSequenceBgGpuRegs): BG1's map
// (screen 5), BG2's (screen 18) and their tiles (char bases 0 and 1); a setup overwrites only what
// FireRed's does, so a later one shows what an earlier one left (bg2vofs 412 shows the shadow map).

import type { Pokemon } from "@pokeuniverse/contracts/party/v1/party";
import { toTiles } from "../gba/assets";
import { PALETTES_ALL } from "../gba/palette";
import { callbackDummy, ObjMode, type AffineCmd, type AnimCmd, type Sprite, type SpriteTemplate } from "../gba/sprites";
import type { Task } from "../gba/tasks";
import { expandPlaceholders, FontId, Window, type Text } from "../gba/text";
import { Effect, HEIGHT, Layer, RGB_BLACK, RGB_WHITE, rgb, WIDTH } from "../gba/video";
import { prepareBattle } from "./battle/screen";
import { initBg } from "./common";
import type { Flow } from "./flow";
import { Assets, type TextId } from "./manifest";
import { monName } from "./party-menu";
import { MON_AFFINE_ANIMS, PokeBalls } from "./pokeball";

/** What the scene shows: the Pokémon given, the one received, and who sent it. */
export interface TradeSceneMons {
  own: Pokemon;
  received: Pokemon;
  partnerName: Text;
}

/** Loads the art and cries (the textbox comes with the battle set), then plays; `ended` once "Take good care" is read. */
export function startTradeScene(flow: Flow, mons: TradeSceneMons, ended: (scene: TradeScene) => void): void {
  const { assets, gba } = flow;
  const species = [mons.own.species, mons.received.species];
  const loads: Promise<unknown>[] = [prepareBattle(flow), ...species.map((s) => assets.pokemonArt(s)), gba.sound.load(species.map(Assets.cryId), Assets.cryUrl)];
  void Promise.all(loads.map((p) => p.catch(() => null))).then(() => new TradeScene(flow, mons, ended));
}

/** {STR_VAR_1} the partner's name, {STR_VAR_2} the own Pokémon's, {STR_VAR_3} the received one's (TradeBufferOTnameAndNicknames). */
const STR_VAR_1 = 0x02;
const STR_VAR_2 = 0x03;
const STR_VAR_3 = 0x04;

/** sTradeMessageWindowTemplates and DrawTextOnTradeWindow's colors. */
const MESSAGE_WINDOW = { left: 2, top: 15, width: 26, height: 4, palette: 0, baseBlock: 0x040 };
const MESSAGE_COLORS = [15, 1, 6] as const;

/** sTradeBallVerticalVelocityTable. */
const BALL_VELOCITY = [
  0, 0, 1, 0, 1, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, -4, -4, -4, -3, -3, -3, -3, -2, -2, -2, -2, -1, -1, -1, -1, 0, -1, 0, -1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 1, 1, 1,
  2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, -4, -3, -3, -2, -2, -1, -1, -1, 0, -1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 2, 2, 3, 3, 4, -4, -3, -2, -1, -1, -1, 0, 0, 0, 0, 1, 0, 1, 1, 2, 3,
];

/** sWirelessSignalAnimParams: the palette row shown (16: off) and for how many frames more; 0xff ends. */
const SIGNAL_PARAMS: readonly (readonly [number, number])[] = [
  [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 3], [11, 3], [12, 3], [13, 4], [14, 5], [15, 2],
  [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 3], [11, 3], [12, 3], [13, 4], [14, 5], [16, 1], [16, 0xff],
];

/** sLinkMonShadow_Pal: the glow's core flashing (its OBJ color 4). */
const SHADOW_FLASH = [...Array<number>(3).fill(rgb(18, 24, 31)), ...Array<number>(3).fill(RGB_WHITE), ...Array<number>(3).fill(rgb(18, 24, 31)), ...Array<number>(3).fill(RGB_WHITE)];

const spin = (loop: number): AnimCmd[] => [...Array.from({ length: 12 }, (_, i) => ({ image: i * 4, duration: 3 })), { loop }, { image: 0, duration: 3 }, "end"];
const BALL_TEMPLATE: SpriteTemplate = {
  sheet: "tradeBall",
  palette: "tradeBall",
  width: 16,
  height: 16,
  priority: 0,
  affineNormal: true,
  anims: [spin(1), spin(2)],
  // Normal, squish (departing), unsquish (arriving).
  affineAnims: [
    [{ xScale: 0, yScale: 0, duration: 1 }, "end"],
    [{ xScale: -8, yScale: 0, duration: 20 }, "end"],
    [{ xScale: 96, yScale: 256, duration: 0 }, { xScale: 0, yScale: 0, duration: 5 }, { xScale: 8, yScale: 0, duration: 20 }, "end"],
  ],
};
const BALL_SQUISH = 1;
const BALL_UNSQUISH = 2;
const BALL_SPIN_TWICE = 1;

const flipped = (image: number, duration: number) => ({ image, duration, hFlip: true, vFlip: true });
const GLOW_TEMPLATE: SpriteTemplate = {
  sheet: "tradeLinkMonGlow",
  palette: "tradeLinkMon",
  width: 32,
  height: 32,
  priority: 1,
  mode: ObjMode.Blend,
  affineNormal: true,
  anims: [[flipped(0, 5), "end"]],
  affineAnims: [[{ xScale: -10, yScale: -10, duration: 5 }, { xScale: 10, yScale: 10, duration: 5 }, { jump: 0 }]],
};
const SHADOW_TEMPLATE: SpriteTemplate = {
  sheet: "tradeLinkMonShadow",
  palette: "tradeLinkMon",
  width: 16,
  height: 32,
  priority: 1,
  anims: [[flipped(0, 5), "end"], [flipped(8, 5), "end"]],
};
const SHADOW_SMALL = 1;
const gbaFlash = (loop: number): AnimCmd[] => [...[0, 32, 64, 96, 64, 32, 0].map((i) => flipped(i, 2)), { loop }, "end"];
const GBA_FLASH_SHORT: SpriteTemplate = { sheet: "tradeGbaScreen", palette: "tradeGba", width: 64, height: 32, priority: 1, anims: [gbaFlash(2)] };
const GBA_FLASH_LONG: SpriteTemplate = { ...GBA_FLASH_SHORT, anims: [gbaFlash(8)] };
/** sAffineAnims_CrossingMonPics: the own Pokémon mirrored while it crosses. */
const CROSSING_AFFINE: AffineCmd[][] = [[{ xScale: -0x100, yScale: 0x100, duration: 0 }, { jump: 0 }]];

const BG_PAL_SIGNAL = 3 * 16;

const enum State {
  Start,
  MonSlideIn,
  SendMsg,
  ByeBye,
  PokeballDepart,
  PokeballDepartWait,
  FadeOutToGbaSend,
  WaitFadeOutToGbaSend,
  FadeInToGbaSend,
  WaitFadeInToGbaSend,
  GbaZoomOut,
  GbaFlashSendWireless,
  GbaStopFlashSendWireless,
  WaitWirelessSignalSend,
  PanAwayGba,
  CreateLinkMonLeaving,
  LinkMonTravelOut,
  LinkMonTravelOffscreen,
  FadeOutToCrossing,
  WaitFadeOutToCrossing,
  FadeInToCrossing,
  WaitFadeInToCrossing,
  CrossingLinkMonsEnter,
  CrossingBlendWhite1,
  CrossingBlendWhite2,
  CrossingBlendWhite3,
  CrossingCreateMonPics,
  CrossingMonPicsMove,
  CrossingLinkMonsExit,
  CreateLinkMonArriving,
  FadeInToGbaRecv,
  WaitFadeInToGbaRecv,
  LinkMonTravelIn,
  PanToGbaWireless,
  DestroyLinkMonWireless,
  WaitWirelessSignalRecv,
  LinkMonArrivedDelay,
  MoveGbaToCenter,
  GbaFlashRecv,
  GbaStopFlashRecv,
  GbaZoomIn,
  FadeOutToNewMon,
  WaitFadeOutToNewMon,
  FadeInToNewMon,
  WaitFadeInToNewMon,
  PokeballArrive,
  FadePokeballToNormal,
  PokeballArriveWait,
  ShowNewMon,
  NewMonMsg,
  DelayForMonAnim,
  WaitForMonCry,
  TakeCareOfMon,
  AfterNewMonDelay,
  CheckRibbons,
  EndLinkTrade,
}

export class TradeScene {
  /** Runs each frame once the scene ended, before the tasks and sprites. */
  after: () => void = () => {};
  private state = State.Start;
  private timer = 0;
  private started = false;
  private finished = false;
  // sTradeAnim's scroll and affine registers, written each VBlank (SetTradeGpuRegs).
  private bg1hofs = 0;
  private bg1vofs = 0;
  private bg2hofs = 0;
  private bg2vofs = 0;
  private texX = 64;
  private texY = 64;
  private srcX = WIDTH / 2;
  private srcY = HEIGHT / 2;
  private sXY = 256;
  private zoom = 0;
  // DISPCNT's mode (1: BG2 affine) and BG2CNT's size, colors and priority.
  private mode = 0;
  private bg2Size = 1;
  private bg2Bpp8 = false;
  private bg2Priority = 2;
  /** BG1's screens (5 and 6) and BG2's (18 and 19), as VRAM keeps them. */
  private readonly vram5 = new Uint16Array(2048);
  private readonly vram18 = new Uint16Array(2048);
  private readonly affineMap = new Uint16Array(256);
  private charBase0: Uint8Array = new Uint8Array(0);
  private charBase1: Uint8Array = new Uint8Array(0);
  /** gPaletteFade.bufferTransferDisabled for one frame. */
  private holdPalettes = false;
  private win0left = 0;
  private win0right = 0;
  private readonly window: Window;
  private readonly balls: PokeBalls;
  private readonly pics: [Sprite, Sprite];
  private releaseBall: Sprite | null = null;
  private bouncingBall: Sprite | null = null;
  private conn1: Sprite | null = null;
  private conn2: Sprite | null = null;
  private readonly vars: Partial<Record<number, Text>>;

  constructor(
    private readonly flow: Flow,
    private readonly mons: TradeSceneMons,
    private readonly ended: (scene: TradeScene) => void,
  ) {
    const { gba, assets } = flow;
    const { video, palettes, sprites } = gba;
    gba.setVBlank(null);
    gba.reset();
    this.balls = new PokeBalls(flow);
    this.vars = { [STR_VAR_1]: mons.partnerName, [STR_VAR_2]: monName(flow, mons.own), [STR_VAR_3]: monName(flow, mons.received) };

    // TradeAnimInit_LoadGfx: the battle textbox on BG0, the message window on it.
    const [bg0, bg1, bg2] = video.bgs;
    initBg(bg0, 0, 0);
    const textbox = assets.get("battleTextbox");
    bg0.tiles = textbox.tiles.slice();
    bg0.map.set(textbox.map!.subarray(0, 1024));
    palettes.load(assets.get("battleTextboxPal1").palette, 0, 16);
    initBg(bg1, 2, 2);
    initBg(bg2, 1, 2);
    this.window = new Window(bg0, MESSAGE_WINDOW);
    this.regs(5);
    this.regs(0);

    // LoadTradeMonPic: both pictures at the screen's center, hidden.
    this.pics = [this.monPic("tradeMonOwn", mons.own), this.monPic("tradeMonReceived", mons.received)];
    this.window.fill(15);
    this.window.putTilemap();
    this.window.copyToVram();

    // LoadTradeGbaSpriteGfx and the ball.
    for (const [sheet, art] of [
      ["tradeLinkMonGlow", "tradeLinkMonGlow"],
      ["tradeLinkMonShadow", "tradeLinkMonShadow"],
      ["tradeGbaScreen", "tradeGbaScreen"],
      ["tradeBall", "tradeBall"],
    ] as const)
      sprites.loadSheet(sheet, assets.get(art).tiles);
    palettes.loadSpritePalette("tradeLinkMon", assets.get("tradeLinkMonPal").palette);
    palettes.loadSpritePalette("tradeGba", assets.get("tradeGbaScreen").palette);
    palettes.loadSpritePalette("tradeBall", assets.get("tradeBall").palette);

    palettes.blendPalettes(PALETTES_ALL, 16, RGB_BLACK);
    palettes.beginFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
    gba.setVBlank(() => this.vblank());
    gba.setMain(() => this.frame());
  }

  /** DrawTextOnTradeWindow: the text at once. */
  print(id: TextId): void {
    const { flow } = this;
    const text = expandPlaceholders(flow.assets.text(id), this.vars);
    this.window.fill(15);
    this.window.print(flow.fonts[FontId.Normal], 0, 2, MESSAGE_COLORS, text, 0, 2);
    this.window.copyToVram();
  }

  private monPic(tag: string, mon: Pokemon): Sprite {
    const { gba, assets } = this.flow;
    const art = assets.loadedPokemonArt(mon.species);
    gba.sprites.loadSheet(tag, art ? toTiles(art.front) : new Uint8Array(0));
    gba.palettes.loadSpritePalette(tag, (mon.shiny ? art?.shinyPalette : art?.frontPalette) ?? new Uint16Array(16));
    const s = gba.sprites.create(
      { sheet: tag, palette: tag, width: 64, height: 64, priority: 0, affineNormal: true, affineAnims: MON_AFFINE_ANIMS as unknown as AffineCmd[][] },
      120,
      60,
      6,
    )!;
    s.invisible = true;
    return s;
  }

  private yOffset(mon: Pokemon): number {
    return this.flow.assets.species(mon.species).coords?.[0] ?? 0;
  }

  /** CB2_UpdateLinkTrade, then CB2_LinkTrade's first frames (waiting for the fade in). */
  private frame(): void {
    const { flow } = this;
    if (!this.started) this.started = !flow.gba.palettes.fadeActive;
    else if (this.finished) this.after();
    else if (this.anim()) {
      this.finished = true;
      this.ended(this);
    }
    flow.runFrame();
  }

  /** VBlankCB_TradeAnim: SetTradeGpuRegs, then the sprites and the palettes. */
  private vblank(): void {
    const { gba } = this.flow;
    const { video } = gba;
    const [, bg1, bg2] = video.bgs;
    bg1.tiles = this.charBase0;
    bg1.map = this.vram5;
    bg1.x = (this.bg1hofs & 0x1ff) << 8;
    bg1.y = (this.bg1vofs & 0x1ff) << 8;
    bg2.tiles = this.charBase1;
    bg2.priority = this.bg2Priority;
    if (this.mode === 0) {
      bg2.affine = false;
      bg2.size = this.bg2Size;
      bg2.bpp8 = this.bg2Bpp8;
      bg2.map = this.vram18;
      bg2.pa = bg2.pd = 0x100;
      bg2.pb = bg2.pc = 0;
      bg2.x = (this.bg2hofs & 0x1ff) << 8;
      bg2.y = (this.bg2vofs & 0x1ff) << 8;
    } else {
      // Mode 1: BG2 is affine, 128×128, 8bpp, one byte per map entry.
      for (let i = 0; i < 256; i++) this.affineMap[i] = (this.vram18[i >> 1] >> ((i & 1) * 8)) & 0xff;
      bg2.affine = true;
      bg2.size = 0;
      bg2.bpp8 = true;
      bg2.map = this.affineMap;
      bg2.setAffine(this.texX << 8, this.texY << 8, this.srcX, this.srcY, this.sXY, this.sXY);
    }
    video.objs = gba.sprites.oam;
    if (this.holdPalettes) this.holdPalettes = false;
    else gba.palettes.transfer(video);
  }

  /** SetGpuReg(REG_OFFSET_DISPCNT, …): the mode and the BGs on (writing it turns WIN0 off). */
  private display(mode: number, layers: number): void {
    const { video } = this.flow.gba;
    this.mode = mode;
    video.bgs.forEach((bg, i) => (bg.visible = (layers & (1 << i)) !== 0));
    video.objOn = true;
    video.win0On = false;
  }

  /** SetTradeSequenceBgGpuRegs (the wireless parts). */
  private regs(n: number): void {
    const { assets, gba } = this.flow;
    const { palettes } = gba;
    switch (n) {
      case 0:
      case 7:
        this.bg2vofs = 0;
        this.bg2hofs = n === 0 ? 0xb4 : 0;
        if (n === 0) this.display(0, Layer.BG0 | Layer.BG2);
        else gba.video.effect = Effect.None;
        this.bg2Size = 1;
        this.bg2Bpp8 = false;
        this.bg2Priority = 2;
        palettes.load(assets.get("tradeGbaPal2").palette, 16, 48);
        this.charBase1 = assets.get("tradeGba").tiles;
        this.vram18.set(assets.get("tradeShadowMap").map!.subarray(0, 2048));
        break;
      case 1:
        this.bg1hofs = 0;
        this.bg1vofs = 0x15c;
        this.bg2Size = 2;
        this.bg2Bpp8 = false;
        this.bg2Priority = 2;
        this.vram5.set(assets.get("tradeGbaMapWireless").map!.subarray(0, 2048));
        this.charBase0 = assets.get("tradeGba").tiles;
        this.display(0, Layer.BG1);
        break;
      case 2:
        this.bg1vofs = 0;
        this.bg1hofs = 0;
        this.display(1, Layer.BG1);
        this.vram5.set(assets.get("tradeSignalCloseupMap").map!.subarray(0, 1024));
        palettes.blendPalettes(0x8, 16, RGB_BLACK);
        break;
      case 3: {
        palettes.load(assets.get("tradeSignalOffPal").palette, BG_PAL_SIGNAL, 16);
        const signal = assets.get("tradeSignal");
        this.charBase1 = signal.tiles;
        this.vram18.set(signal.map!.subarray(0, 1024));
        this.bg2vofs = 0x50;
        this.display(0, Layer.BG1 | Layer.BG2);
        break;
      }
      case 4:
      case 6: {
        this.display(1, Layer.BG2);
        this.bg2Bpp8 = true;
        this.bg2Priority = 3;
        this.texX = 0x40;
        this.texY = 0x5c;
        this.sXY = n === 4 ? 0x20 : 0x100;
        this.zoom = n === 4 ? 0x400 : 0x80;
        if (n === 6) {
          this.srcX = 0x78;
          this.srcY = 0x50;
        }
        this.charBase1 = assets.get("tradeGbaAffine").tiles;
        // 0x100 bytes of one-byte entries over the first 128 of screen 18.
        const bytes = assets.get("tradeGbaAffineMapWireless").bytes!;
        for (let i = 0; i < 128; i++) this.vram18[i] = (bytes[i * 2] ?? 0) | ((bytes[i * 2 + 1] ?? 0) << 8);
        break;
      }
      case 5:
        this.bg1vofs = 0;
        this.bg1hofs = 0;
        break;
    }
  }

  private sprite(template: SpriteTemplate, x: number, y: number, subpriority: number): Sprite {
    return this.flow.gba.sprites.create(template, x, y, subpriority)!;
  }

  /** SpriteCB_LinkMonGlowWireless. */
  private glow(x: number, y: number): Sprite {
    const s = this.sprite(GLOW_TEMPLATE, x, y, 3);
    s.callback = (g) => {
      if (!g.invisible && ++g.data[0] === 10) {
        this.flow.play("se_m_swagger2");
        g.data[0] = 0;
      }
    };
    return s;
  }

  /** SpriteCB_LinkMonShadow: the core flashes until data[1] is set. */
  private shadow(x: number, y: number): Sprite {
    const s = this.sprite(SHADOW_TEMPLATE, x, y, 0);
    s.callback = (sh) => {
      if (sh.data[1] !== 0) return;
      if (++sh.data[0] === 12) sh.data[0] = 0;
      this.flow.gba.palettes.load([SHADOW_FLASH[sh.data[0]]], 256 + sh.paletteNum * 16 + 4, 1);
    };
    return s;
  }

  /** SpriteCB_GbaScreen. */
  private gbaFlash(template: SpriteTemplate): Sprite {
    const s = this.sprite(template, 120, 80, 0);
    s.callback = (f) => {
      if (++f.data[0] === 15) {
        this.flow.play("se_m_minimize");
        f.data[0] = 0;
      }
    };
    return s;
  }

  private destroy(s: Sprite | null): void {
    this.flow.gba.sprites.destroy(s);
  }

  private ballMask(ball: Sprite): number {
    return (1 << (16 + ball.paletteNum)) >>> 0;
  }

  /** SpriteCB_BouncingPokeballDepart, then SpriteCB_BouncingPokeballDepartEnd. */
  private depart(ball: Sprite): void {
    ball.y2 += BALL_VELOCITY[ball.data[0]];
    if (ball.data[0] === 22) this.flow.play("se_ball_bounce_1");
    if (++ball.data[0] !== 44) return;
    this.flow.play("se_m_mega_kick");
    ball.data[0] = 0;
    this.flow.gba.palettes.beginFade(this.ballMask(ball), -1, 0, 16, RGB_WHITE);
    ball.callback = (b) => {
      if (b.data[1] === 20) b.startAffineAnim(BALL_SQUISH);
      if (++b.data[1] <= 20) return;
      b.y2 -= BALL_VELOCITY[b.data[0]];
      if (++b.data[0] === 23) {
        this.destroy(b);
        this.bouncingBall = null;
        this.state = State.FadeOutToGbaSend;
      }
    };
  }

  /** SpriteCB_BouncingPokeballArrive. */
  private arrive(ball: Sprite): void {
    const { flow } = this;
    if (ball.data[2] === 0) {
      ball.y += 4;
      if (ball.y > ball.data[3]) {
        ball.data[2]++;
        ball.data[0] = 22;
        flow.play("se_ball_bounce_1");
      }
      return;
    }
    if (ball.data[0] === 66) flow.play("se_ball_bounce_2");
    if (ball.data[0] === 92) flow.play("se_ball_bounce_3");
    if (ball.data[0] === 107) flow.play("se_ball_bounce_4");
    ball.y2 += BALL_VELOCITY[ball.data[0]];
    if (++ball.data[0] === 108) ball.callback = callbackDummy;
  }

  /** Task_AnimateWirelessSignal: the signal's palette rows, out (or back with data[2]). */
  private readonly signalTask = (t: Task): void => {
    const { gba, assets } = this.flow;
    const d = t.data;
    const [row, frames] = SIGNAL_PARAMS[d[0]];
    const pal = row === 16 ? assets.get("tradeSignalOffPal").palette : assets.get(d[2] ? "tradeSignalReceivePal" : "tradeSignalSendPal").palette.subarray(row * 16, row * 16 + 16);
    gba.palettes.load(pal, BG_PAL_SIGNAL, 16);
    if (row === 0 && d[1] === 0) this.flow.play("se_m_heal_bell");
    if (d[1] === frames) {
      d[0]++;
      d[1] = 0;
      if (SIGNAL_PARAMS[d[0]][1] === 0xff) gba.tasks.destroy(t);
    } else d[1]++;
  };

  private setWin0(): void {
    const { video } = this.flow.gba;
    Object.assign(video.win0, { left: this.win0left, right: this.win0right, top: 0, bottom: HEIGHT });
  }

  /** Task_OpenCenterWhiteColumn. */
  private readonly openColumnTask = (t: Task): void => {
    const { video, tasks } = this.flow.gba;
    if (t.data[0] === 0) {
      this.win0left = this.win0right = WIDTH / 2;
      video.win0On = true;
      video.winOut = Layer.OBJ;
      video.winIn0 = Layer.BG0 | Layer.BG1 | Layer.OBJ;
    }
    this.setWin0();
    t.data[0]++;
    this.win0left -= 5;
    this.win0right += 5;
    if (this.win0left < 80) tasks.destroy(t);
  };

  /** Task_CloseCenterWhiteColumn. */
  private readonly closeColumnTask = (t: Task): void => {
    const { video, tasks, palettes } = this.flow.gba;
    if (t.data[0] === 0) {
      this.win0left = 80;
      this.win0right = WIDTH - 80;
      video.winOut = Layer.OBJ;
      video.winIn0 = Layer.BG0 | Layer.BG1 | Layer.OBJ;
    }
    this.setWin0();
    if (this.win0left !== WIDTH / 2) {
      t.data[0]++;
      this.win0left += 5;
      this.win0right -= 5;
      if (this.win0left > WIDTH / 2 - 5) palettes.blendPalettes(0x8, 0, RGB_WHITE);
    } else {
      video.win0On = false;
      tasks.destroy(t);
    }
  };

  /** DoTradeAnim_Wireless: true once the link trade's part ends (STATE_END_LINK_TRADE). */
  private anim(): boolean {
    const { flow, mons } = this;
    const { gba } = flow;
    const { palettes, video, tasks } = gba;
    const [own, partner] = this.pics;
    switch (this.state) {
      case State.Start:
        own.invisible = false;
        own.x2 = -180;
        own.y2 = this.yOffset(mons.own);
        this.state++;
        flow.playBgm("mus_evolution");
        break;
      case State.MonSlideIn:
        if (this.bg2hofs > 0) {
          own.x2 += 3;
          this.bg2hofs -= 3;
        } else {
          own.x2 = 0;
          this.bg2hofs = 0;
          this.state = State.SendMsg;
        }
        break;
      case State.SendMsg:
        this.print("gText_XWillBeSentToY");
        flow.playCry(mons.own.species);
        this.state = State.ByeBye;
        this.timer = 0;
        break;
      case State.ByeBye:
        if (++this.timer === 80) {
          this.releaseBall = this.balls.takeBack(own, 120, 32, 2, 1, 20, 0xfffff);
          this.state++;
          this.print("gText_ByeByeVar1");
        }
        break;
      case State.PokeballDepart:
        if (this.releaseBall?.callback === callbackDummy) {
          const ball = this.sprite(BALL_TEMPLATE, 120, 32, 0);
          ball.callback = (b) => this.depart(b);
          this.bouncingBall = ball;
          this.destroy(this.releaseBall);
          this.releaseBall = null;
          this.state++;
        }
        break;
      case State.PokeballDepartWait:
        // The ball's callback moves on.
        break;
      case State.FadeOutToGbaSend:
        palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
        this.state = State.WaitFadeOutToGbaSend;
        break;
      case State.WaitFadeOutToGbaSend:
        if (!palettes.fadeActive) {
          this.regs(4);
          this.window.fill(15);
          this.window.copyToVram();
          this.state++;
        }
        break;
      case State.FadeInToGbaSend:
        palettes.beginFade(PALETTES_ALL, -1, 16, 0, RGB_BLACK);
        this.state++;
        break;
      case State.WaitFadeInToGbaSend:
        if (!palettes.fadeActive) this.state = State.GbaZoomOut;
        break;
      case State.GbaZoomOut:
        if (this.zoom > 0x100) this.zoom -= 0x34;
        else {
          this.regs(1);
          this.zoom = 0x80;
          this.state = State.GbaFlashSendWireless;
          this.timer = 0;
        }
        this.sXY = Math.trunc(0x8000 / this.zoom);
        break;
      case State.GbaFlashSendWireless:
        if (++this.timer > 20) {
          this.regs(3);
          this.conn2 = this.gbaFlash(GBA_FLASH_SHORT);
          this.state++;
        }
        break;
      case State.GbaStopFlashSendWireless:
        if (this.conn2?.animEnded) {
          this.destroy(this.conn2);
          video.effect = Effect.Blend;
          video.target1 = Layer.BG1 | Layer.OBJ;
          video.target2 = Layer.BG2;
          video.eva = 16;
          video.evb = 4;
          tasks.create(this.signalTask, 5);
          this.state++;
        }
        break;
      case State.WaitWirelessSignalSend:
        if (!tasks.isActive(this.signalTask)) this.state = State.PanAwayGba;
        break;
      case State.PanAwayGba:
        if (--this.bg1vofs === 316) this.state++;
        break;
      case State.CreateLinkMonLeaving:
        this.conn1 = this.glow(120, 80);
        this.conn2 = this.shadow(120, 80);
        this.conn2.startAnim(SHADOW_SMALL);
        this.state++;
        break;
      case State.LinkMonTravelOut:
        if ((this.bg1vofs -= 3) === 166) this.state = State.LinkMonTravelOffscreen;
        this.display(1, Layer.BG1);
        break;
      case State.LinkMonTravelOffscreen:
        this.conn1!.y -= 2;
        this.conn2!.y -= 2;
        if (this.conn1!.y < -8) this.state = State.FadeOutToCrossing;
        break;
      case State.FadeOutToCrossing:
        palettes.beginFade(PALETTES_ALL, -1, 0, 16, RGB_BLACK);
        this.state = State.WaitFadeOutToCrossing;
        break;
      case State.WaitFadeOutToCrossing:
        if (!palettes.fadeActive) {
          this.destroy(this.conn1);
          this.destroy(this.conn2);
          this.regs(2);
          this.state++;
        }
        break;
      case State.FadeInToCrossing:
        palettes.beginFade(PALETTES_ALL, -1, 16, 0, RGB_BLACK);
        this.conn1 = this.shadow(111, 170);
        this.conn2 = this.shadow(129, -10);
        this.state++;
        break;
      case State.WaitFadeInToCrossing:
        if (!palettes.fadeActive) {
          flow.play("se_warp_out");
          this.state++;
        }
        this.conn1!.y2 -= 3;
        this.conn2!.y2 += 3;
        break;
      case State.CrossingLinkMonsEnter:
        this.conn1!.y2 -= 3;
        this.conn2!.y2 += 3;
        if (this.conn1!.y2 <= -90) {
          this.conn1!.data[1] = 1;
          this.conn2!.data[1] = 1;
          this.state++;
          tasks.create(this.openColumnTask, 5);
        }
        break;
      case State.CrossingBlendWhite1:
      case State.CrossingBlendWhite2:
      case State.CrossingBlendWhite3:
        palettes.blendPalettes(0x8, 16, RGB_WHITE);
        this.state++;
        break;
      case State.CrossingCreateMonPics:
        if (!flow.assets.species(mons.own.species).noFlip) {
          own.affineAnims = CROSSING_AFFINE;
          own.affineDouble = true;
          own.setSize(64, 64);
        }
        own.startAffineAnim(0);
        partner.startAffineAnim(0);
        own.x = 40;
        partner.x = 200;
        own.y = 192;
        partner.y = -32;
        own.invisible = false;
        partner.invisible = false;
        this.state++;
        break;
      case State.CrossingMonPicsMove:
        own.y2 -= 3;
        partner.y2 += 3;
        if (own.y2 < -HEIGHT && own.y2 >= -HEIGHT - 3) flow.play("se_warp_in");
        if (own.y2 < -222) {
          this.conn1!.data[1] = 0;
          this.conn2!.data[1] = 0;
          this.state++;
          own.invisible = true;
          partner.invisible = true;
          tasks.create(this.closeColumnTask, 5);
        }
        break;
      case State.CrossingLinkMonsExit:
        this.conn1!.y2 -= 3;
        this.conn2!.y2 += 3;
        if (this.conn1!.y2 <= -222) {
          palettes.beginFade(PALETTES_ALL, -1, 0, 16, RGB_BLACK);
          this.state++;
          this.destroy(this.conn1);
          this.destroy(this.conn2);
        }
        break;
      case State.CreateLinkMonArriving:
        if (!palettes.fadeActive) {
          this.state++;
          this.regs(1);
          this.bg1vofs = 166;
          this.regs(3);
          this.bg2vofs = 412;
          this.conn1 = this.glow(120, -20);
          this.conn2 = this.shadow(120, -20);
          this.conn2.startAnim(SHADOW_SMALL);
        }
        break;
      case State.FadeInToGbaRecv:
        palettes.beginFade(PALETTES_ALL, -1, 16, 0, RGB_BLACK);
        this.state++;
        break;
      case State.WaitFadeInToGbaRecv:
        this.display(0, Layer.BG1);
        if (!palettes.fadeActive) this.state++;
        break;
      case State.LinkMonTravelIn:
        this.conn1!.y2 += 4;
        this.conn2!.y2 += 4;
        if (this.conn1!.y2 + this.conn1!.y === 64) {
          this.state = State.PanToGbaWireless;
          this.timer = 0;
        }
        break;
      case State.PanToGbaWireless:
        this.display(0, Layer.BG1 | Layer.BG2);
        this.bg1vofs += 3;
        this.bg2vofs += 3;
        if (++this.timer === 10) tasks.create(this.signalTask, 5).data[2] = 1;
        if (this.bg1vofs > 316) {
          this.bg1vofs = 316;
          this.state++;
        }
        break;
      case State.DestroyLinkMonWireless:
        this.destroy(this.conn1);
        this.destroy(this.conn2);
        this.state++;
        this.timer = 0;
        break;
      case State.WaitWirelessSignalRecv:
        if (!tasks.isActive(this.signalTask)) {
          this.state = State.LinkMonArrivedDelay;
          this.timer = 0;
        }
        break;
      case State.LinkMonArrivedDelay:
        if (++this.timer === 10) this.state++;
        break;
      case State.MoveGbaToCenter:
        if (++this.bg1vofs > 348) {
          this.bg1vofs = 348;
          this.state++;
        }
        break;
      case State.GbaFlashRecv:
        this.conn2 = this.gbaFlash(GBA_FLASH_LONG);
        this.state = State.GbaStopFlashRecv;
        break;
      case State.GbaStopFlashRecv:
        if (this.conn2?.animEnded) {
          this.destroy(this.conn2);
          this.regs(6);
          this.state++;
          flow.play("se_m_sand_attack");
        }
        break;
      case State.GbaZoomIn:
        if (this.zoom < 0x400) this.zoom += 0x34;
        else {
          this.zoom = 0x400;
          this.state++;
        }
        this.sXY = Math.trunc(0x8000 / this.zoom);
        break;
      case State.FadeOutToNewMon:
        palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
        this.state = State.WaitFadeOutToNewMon;
        break;
      case State.WaitFadeOutToNewMon:
        if (!palettes.fadeActive) {
          this.regs(5);
          this.regs(7);
          this.holdPalettes = true;
          this.state++;
        }
        break;
      case State.FadeInToNewMon:
        palettes.beginFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
        this.state++;
        break;
      case State.WaitFadeInToNewMon:
        this.display(0, Layer.BG2);
        if (!palettes.fadeActive) this.state++;
        break;
      case State.PokeballArrive: {
        const ball = this.sprite(BALL_TEMPLATE, 120, -8, 0);
        ball.data[3] = 74;
        ball.callback = (b) => this.arrive(b);
        ball.startAnim(BALL_SPIN_TWICE);
        ball.startAffineAnim(BALL_UNSQUISH);
        palettes.blendPalettes(this.ballMask(ball), 16, RGB_WHITE);
        this.bouncingBall = ball;
        this.state++;
        this.timer = 0;
        break;
      }
      case State.FadePokeballToNormal:
        palettes.beginFade(this.ballMask(this.bouncingBall!), 1, 16, 0, RGB_WHITE);
        this.state++;
        break;
      case State.PokeballArriveWait:
        if (this.bouncingBall?.callback === callbackDummy) this.state++;
        break;
      case State.ShowNewMon:
        partner.x = 120;
        partner.y = this.yOffset(mons.received) + 60;
        partner.x2 = 0;
        partner.y2 = 0;
        // HandleLoadSpecialPokePic: a fresh picture, not mirrored.
        partner.affineAnims = MON_AFFINE_ANIMS as unknown as AffineCmd[][];
        partner.startAnim(0);
        this.balls.release(partner, 120, 84, 2, 1, 20, 0xfffff);
        this.destroy(this.bouncingBall);
        this.bouncingBall = null;
        this.state++;
        break;
      case State.NewMonMsg:
        this.display(0, Layer.BG0 | Layer.BG2);
        this.print("gText_XSentOverY");
        this.state = State.DelayForMonAnim;
        this.timer = 0;
        break;
      case State.DelayForMonAnim:
        if (++this.timer > 60) {
          flow.playCry(mons.received.species);
          this.state = State.WaitForMonCry;
          this.timer = 0;
        }
        break;
      case State.WaitForMonCry:
        if (!gba.sound.isPlaying("cry")) this.state = State.TakeCareOfMon;
        break;
      case State.TakeCareOfMon:
        if (++this.timer === 10) gba.sound.playFanfare("mus_evolved");
        if (this.timer === 250) {
          this.state++;
          this.print("gText_TakeGoodCareOfX");
          this.timer = 0;
        }
        break;
      case State.AfterNewMonDelay:
        if (++this.timer === 60) this.state++;
        break;
      case State.CheckRibbons:
        // CheckPartnersMonForRibbons: no ribbons in PokeUniverse.
        this.state++;
        break;
      case State.EndLinkTrade:
        return true;
    }
    return false;
  }
}
