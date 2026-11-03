// The healthboxes (battle_interface.c, singles): two 64-pixel-wide sprites per box sharing one
// sheet, and an HP bar sprite. Text is printed in FONT_SMALL into an 8×2-tile window and copied
// into the sheet's tiles at the game's offsets (TextIntoHealthboxObject); the bars and the status
// icon are tiles of healthbox_elements. The HP bar moves one HP (or a fraction of a pixel) per
// frame (MoveBattleBar), the player's numbers following it. Also the party balls on the
// summary bar at the battle's start (CreatePartyStatusSummarySprites).

import { PartyBall } from "@pokeuniverse/contracts/battle/v1/view";
import { Gender, Status } from "@pokeuniverse/contracts/pokemon/v1/pokemon";
import type { Sprite, SpriteTemplate } from "../../gba/sprites";
import { decimalText, EOS, FontId, NumberMode, Window, type Text } from "../../gba/text";
import { Background, rgb } from "../../gba/video";
import type { Flow } from "../flow";
import { HP_BAR_PIXELS } from "../hp-bar";

/** Sections of healthbox_elements (B_INTERFACE_GFX_*), as tile numbers. */
const GFX = {
  transparent: 0,
  hpText: 1,
  hpGreen: 3,
  exp: 12,
  statusNone: 39,
  hpYellow: 47,
  hpRed: 56,
  hpLeftBorder: 65,
  partyBall: 66,
} as const;

/** The status icons' first tile, for battler 0 (player) and 1 (opponent). */
const STATUS_GFX: Partial<Record<Status, [number, number]>> = {
  [Status.POISON]: [21, 71],
  [Status.TOXIC]: [21, 71],
  [Status.PARALYSIS]: [24, 74],
  [Status.SLEEP]: [27, 77],
  [Status.FREEZE]: [30, 80],
  [Status.BURN]: [33, 83],
};

/** sStatusIconColors: the icon's color, written at healthbox palette color 12 + battler. */
const STATUS_COLORS: Partial<Record<Status, number>> = {
  [Status.POISON]: rgb(24, 12, 24),
  [Status.TOXIC]: rgb(24, 12, 24),
  [Status.PARALYSIS]: rgb(23, 23, 3),
  [Status.SLEEP]: rgb(20, 20, 17),
  [Status.FREEZE]: rgb(17, 22, 28),
  [Status.BURN]: rgb(28, 14, 10),
};

const HP_TILES = 6;
const EXP_TILES = 8;
const CHAR_SLASH = 0xba;
const CHAR_MALE = 0xb5;
const CHAR_FEMALE = 0xb6;
const LV_2: Text = [0xf9, 0x05];
const COLOR = [0xfc, 0x01];
/** TEXT_DYNAMIC_COLOR_1 (♀) and _2 (♂). */
const DYNAMIC_COLOR_1 = 0x0a;
const DYNAMIC_COLOR_2 = 0x0b;
const HIGHLIGHT_2: Text = [0xfc, 0x02, 0x02];

/** Where each side draws its parts: tile numbers in the box's sheet (the game's byte offsets / 32). */
interface Layout {
  image: "healthboxPlayer" | "healthboxOpponent";
  height: number;
  /** The second sprite's first tile. */
  other: number;
  x: number;
  y: number;
  /** The HP bar sprite's top left, from the box's position. */
  barDx: number;
  name: [number, number];
  nameExtra: number | null;
  level: number;
  status: number;
  battler: 0 | 1;
}

const PLAYER: Layout = { image: "healthboxPlayer", height: 64, other: 64, x: 158, y: 88, barDx: 0, name: [2, 6], nameExtra: 64, level: 65, status: 26, battler: 0 };
const OPPONENT: Layout = { image: "healthboxOpponent", height: 32, other: 32, x: 44, y: 30, barDx: -8, name: [1, 7], nameExtra: null, level: 32, status: 17, battler: 1 };

/** What a healthbox shows. */
export interface HealthboxMon {
  name: Text;
  species: number;
  nicknamed: boolean;
  gender: Gender;
  level: number;
  hp: number;
  maxHp: number;
  status: Status;
  /** The player's only: experience into the level, out of the level's span (0 of 0 at Lv. 100). */
  exp?: [number, number];
}

const NIDORAN_F = 29;
const NIDORAN_M = 32;

/** A battle bar's movement (CalcNewBarValue): from `old` toward `old - received`, one step a frame. */
export class BattleBar {
  /** The value shown; in 1/256 when the maximum has fewer units than the bar has pixels. */
  private current: number;
  private readonly fine: boolean;

  constructor(
    readonly max: number,
    readonly old: number,
    readonly received: number,
    private readonly pixels: number,
    private readonly increment = 1,
  ) {
    this.fine = max < pixels;
    this.current = this.fine ? old * 256 : old;
  }

  private get target(): number {
    return Math.min(this.max, Math.max(0, this.old - this.received));
  }

  /** One step: the value now, or -1 once it reached the target. */
  step(): number {
    const target = this.target;
    if (this.fine) {
      if (target === this.current >> 8 && (this.current & 0xff) === 0) return -1;
      const inc = Math.trunc((this.max * 256) / this.pixels);
      let ret: number;
      if (this.received < 0) {
        this.current += inc;
        ret = this.current >> 8;
        if (ret >= target) {
          this.current = target * 256;
          ret = target;
        }
      } else {
        this.current -= inc;
        ret = this.current >> 8;
        if ((this.current & 0xff) > 0) ret++;
        if (ret <= target) {
          this.current = target * 256;
          ret = target;
        }
      }
      return ret;
    }
    if (target === this.current) return -1;
    if (this.received < 0) this.current = Math.min(target, this.current + this.increment);
    else this.current = Math.max(target, this.current - this.increment);
    return this.current;
  }

  /** CalcBarFilledPixels: pixels per tile, and the total. */
  filled(tiles: number): { perTile: number[]; total: number } {
    const perTile = new Array<number>(tiles).fill(0);
    const total = tiles * 8;
    let n = this.max > 0 ? (this.fine ? Math.trunc((this.current * total) / this.max) >> 8 : Math.trunc((this.current * total) / this.max)) : 0;
    if (n === 0 && this.target > 0) {
      perTile[0] = 1;
      return { perTile, total: 1 };
    }
    const sum = n;
    for (let i = 0; i < tiles && n > 0; i++) {
      perTile[i] = Math.min(8, n);
      n -= 8;
    }
    return { perTile, total: sum };
  }
}

export class Healthbox {
  private readonly layout: Layout;
  private readonly sheet: Uint8Array;
  private readonly barSheet: Uint8Array;
  private readonly main: Sprite;
  private readonly other: Sprite;
  private readonly bar: Sprite;
  private readonly window = new Window(new Background(), { left: 0, top: 0, width: 8, height: 2, palette: 0, baseBlock: 0 });
  private mon: HealthboxMon | null = null;
  private readonly tags: string[];

  constructor(
    private readonly flow: Flow,
    readonly foe: boolean,
  ) {
    const { gba, assets } = flow;
    const layout = (this.layout = foe ? OPPONENT : PLAYER);
    const sheetTag = `healthbox${layout.battler}`;
    const barTag = `healthbar${layout.battler}`;
    this.tags = [sheetTag, barTag];
    this.sheet = new Uint8Array(assets.get(layout.image).tiles);
    this.barSheet = new Uint8Array(8 * 64);
    gba.sprites.loadSheet(sheetTag, this.sheet);
    gba.sprites.loadSheet(barTag, this.barSheet);
    gba.palettes.loadSpritePalette("healthbox", assets.get("healthboxPal").palette);
    gba.palettes.loadSpritePalette("healthbar", assets.get("healthbarPal").palette);
    const box = (image: number): SpriteTemplate => ({ sheet: sheetTag, palette: "healthbox", width: 64, height: layout.height, priority: 1, anims: [[{ image, duration: 0 }, "end"]] });
    // The player's box is made 64×32 and then turned 64×64 without its center moving
    // (CreateBattlerHealthboxSprites), so it is drawn 16 pixels lower than a 64×64 sprite would be.
    const boxY = layout.y + (layout.height - 32) / 2;
    this.main = gba.sprites.create(box(0), layout.x, boxY, 1)!;
    this.other = gba.sprites.create(box(layout.other), layout.x + 64, boxY, 1)!;
    this.bar = gba.sprites.create({ sheet: barTag, palette: "healthbar", width: 64, height: 8, priority: 1 }, layout.x + layout.barDx + 32, layout.y + 4, 0)!;
    this.copyElement(GFX.hpText, this.barSheet, 0, 2);
    this.visible = false;
  }

  set visible(on: boolean) {
    for (const s of [this.main, this.other, this.bar]) s.invisible = !on;
  }

  /** Slides the box (the sprites' x2), as the slide-in and the hit shake do. */
  set offset(x2: number) {
    for (const s of [this.main, this.other, this.bar]) s.x2 = x2;
  }

  get offset(): number {
    return this.main.x2;
  }

  set offsetY(y2: number) {
    for (const s of [this.main, this.other, this.bar]) s.y2 = y2;
  }

  /** The shown HP. */
  get hp(): number {
    return this.mon?.hp ?? 0;
  }

  /** Everything drawn again for a Pokémon (UpdateHealthboxAttribute(HEALTHBOX_ALL)). */
  show(mon: HealthboxMon): void {
    this.mon = { ...mon };
    this.drawName();
    this.drawLevel();
    this.drawStatus();
    this.drawHpBar(new BattleBar(mon.maxHp, mon.hp, 0, HP_TILES * 8));
    if (!this.foe) {
      this.drawHpText(mon.hp, true);
      this.drawHpText(mon.maxHp, false);
      this.drawExp();
    }
  }

  setStatus(status: Status): void {
    if (!this.mon) return;
    this.mon.status = status;
    this.drawStatus();
  }

  /** The HP bar moving to `hp`, a frame per step; done when it returns false. */
  *moveHp(hp: number): Generator<void, void, void> {
    const mon = this.mon;
    if (!mon || hp === mon.hp) {
      if (mon) mon.hp = hp;
      return;
    }
    const bar = new BattleBar(mon.maxHp, mon.hp, mon.hp - hp, HP_TILES * 8);
    for (;;) {
      const v = bar.step();
      if (v < 0) break;
      this.drawHpBar(bar);
      if (!this.foe) this.drawHpText(v, true);
      yield;
    }
    mon.hp = hp;
    this.drawHpBar(new BattleBar(mon.maxHp, hp, 0, HP_TILES * 8));
    if (!this.foe) this.drawHpText(hp, true);
  }

  /**
   * Task_GiveExpWithExpBar: 13 frames, then the bar fills a pixel a frame (GetScaledExpFraction)
   * with SE_EXP, up to `exp`. It starts empty after a level up.
   */
  *moveExp(exp: number, levelExp: number, nextLevelExp: number): Generator<void, void, void> {
    const mon = this.mon;
    const span = nextLevelExp - levelExp;
    if (!mon || this.foe || span <= 0) return;
    const [into, was] = mon.exp ?? [0, 0];
    const old = into >= was ? 0 : into;
    const now = exp - levelExp;
    mon.exp = [now, span];
    const gained = now - old;
    if (gained <= 0) return this.drawExp();
    const pixels = EXP_TILES * 8;
    const crossed = Math.abs(Math.trunc((old * pixels) / span) - Math.trunc((now * pixels) / span)) || 1;
    const bar = new BattleBar(span, old, -gained, pixels, Math.max(1, Math.trunc(gained / crossed)));
    for (let i = 0; i < 13; i++) yield;
    const { sound } = this.flow.gba;
    sound.play("se_exp");
    while (bar.step() >= 0) {
      this.drawExpBar(bar);
      yield;
    }
    sound.stop("se");
    this.drawExp();
  }

  /** It reached a level: its numbers, and the bar empty once the next `moveExp` starts. */
  levelUp(level: number, hp: number, maxHp: number): void {
    const mon = this.mon;
    if (!mon) return;
    Object.assign(mon, { level, hp, maxHp });
    this.drawLevel();
    this.drawHpBar(new BattleBar(maxHp, hp, 0, HP_TILES * 8));
    this.drawHpText(hp, true);
    this.drawHpText(maxHp, false);
    const [, span] = mon.exp ?? [0, 0];
    mon.exp = [span, span];
    this.copyEmptyExp();
  }

  /**
   * AnimTask_FlashHealthboxOnLevelUp on its own copy of the palette, so the other box stays as it
   * is: color 6 goes to light blue and back, two steps a frame.
   */
  *flashLevelUp(): Generator<void, void, void> {
    const { palettes } = this.flow.gba;
    const from = palettes.spritePaletteSlot("healthbox");
    const slot = palettes.loadSpritePalette("healthboxLevelUp", palettes.unfaded.slice(256 + from * 16, 256 + (from + 1) * 16));
    this.main.paletteNum = this.other.paletteNum = slot;
    for (const coeff of [2, 4, 6, 8, 10, 12, 14, 16, 14, 12, 10, 8, 6, 4, 2, 0]) {
      palettes.blendPalette(256 + slot * 16 + 6, 1, coeff, rgb(20, 27, 31));
      yield;
    }
    this.main.paletteNum = this.other.paletteNum = from;
    palettes.freeSpritePalette("healthboxLevelUp");
  }

  destroy(): void {
    const { gba } = this.flow;
    for (const s of [this.main, this.other, this.bar]) gba.sprites.destroy(s);
    for (const t of this.tags) gba.sprites.freeSheet(t);
  }

  // Drawing

  /** UpdateNickInHealthbox: {HIGHLIGHT 2}, the name, then ♂ or ♀ in their colors. */
  private drawName(): void {
    const mon = this.mon!;
    let gender = mon.gender;
    if ((mon.species === NIDORAN_F || mon.species === NIDORAN_M) && !mon.nicknamed) gender = Gender.UNSPECIFIED;
    const symbol = gender === Gender.MALE ? [...COLOR, DYNAMIC_COLOR_2, CHAR_MALE] : gender === Gender.FEMALE ? [...COLOR, DYNAMIC_COLOR_1, CHAR_FEMALE] : [];
    this.print([...HIGHLIGHT_2, ...strip(mon.name), ...symbol, EOS], 0, 3);
    const [dst, width] = this.layout.name;
    this.textIntoSheet(dst, 0, width);
    if (this.layout.nameExtra !== null) this.textIntoSheet(this.layout.nameExtra, 6, 1);
  }

  /** UpdateLvlInHealthbox: {LV_2} and the level, right-aligned in three digits' room. */
  private drawLevel(): void {
    const digits = String(this.mon!.level).length;
    this.print([...LV_2, ...decimalText(this.mon!.level, NumberMode.LeftAlign, 3)], 5 * (3 - digits), 3);
    this.textIntoSheet(this.layout.level, 0, 3);
  }

  /** UpdateHpTextInHealthbox (the player's, singles): "ccc/" and "mmm". */
  private drawHpText(value: number, current: boolean): void {
    const digits = decimalText(value, NumberMode.RightAlign, 3);
    if (current) {
      this.print([...strip(digits), CHAR_SLASH, EOS], 4, 5);
      this.textIntoSheet(23, 0, 1);
      this.textIntoSheet(80, 1, 2);
    } else {
      this.print(digits, 0, 5);
      this.textIntoSheet(82, 0, 2);
    }
  }

  /** UpdateStatusIconInHealthbox: the icon in its color, the opponent's HP label replaced by the bar's border. */
  private drawStatus(): void {
    const { status } = this.mon!;
    const { battler, status: at } = this.layout;
    const gfx = STATUS_GFX[status];
    if (!gfx) {
      for (let i = 0; i < 3; i++) this.copyElement(GFX.statusNone, this.sheet, at + i, 1);
      this.copyElement(GFX.hpText, this.barSheet, 0, 2);
      return;
    }
    const { palettes } = this.flow.gba;
    palettes.load([STATUS_COLORS[status]!], 256 + palettes.spritePaletteSlot("healthbox") * 16 + 12 + battler, 1);
    this.copyElement(gfx[battler], this.sheet, at, 3);
    if (this.foe) {
      this.copyElement(GFX.transparent, this.barSheet, 0, 1);
      this.copyElement(GFX.hpLeftBorder, this.barSheet, 1, 1);
    }
  }

  /** MoveBattleBarGraphically(HEALTH_BAR): green over half, yellow over a fifth, red below. */
  private drawHpBar(bar: BattleBar): void {
    const { perTile, total } = bar.filled(HP_TILES);
    const element = total > (HP_BAR_PIXELS * 50) / 100 ? GFX.hpGreen : total > Math.trunc((HP_BAR_PIXELS * 20) / 100) ? GFX.hpYellow : GFX.hpRed;
    for (let i = 0; i < HP_TILES; i++) this.copyElement(element + perTile[i], this.barSheet, 2 + i, 1);
  }

  /** MoveBattleBarGraphically(EXP_BAR): four tiles on each sprite; empty at Lv. 100. */
  private drawExp(): void {
    const [now, span] = this.mon!.exp ?? [0, 0];
    if (span > 0) this.drawExpBar(new BattleBar(span, now, 0, EXP_TILES * 8));
    else this.copyEmptyExp();
  }

  private drawExpBar(bar: BattleBar): void {
    this.copyExpTiles(bar.filled(EXP_TILES).perTile);
  }

  private copyEmptyExp(): void {
    this.copyExpTiles(new Array<number>(EXP_TILES).fill(0));
  }

  private copyExpTiles(perTile: readonly number[]): void {
    for (let i = 0; i < EXP_TILES; i++) this.copyElement(GFX.exp + perTile[i], this.sheet, i < 4 ? 36 + i : 92 + i, 1);
  }

  /** AddTextPrinterAndCreateWindowOnHealthbox: FONT_SMALL on color 2, text 1, shadow 3. */
  private print(text: Text, x: number, y: number): void {
    this.window.fill(2);
    this.window.print(this.flow.fonts[FontId.Small], x, y, [2, 1, 3], text, 0, 0);
  }

  /**
   * TextIntoHealthboxObject: `width` tiles of the window from `from`: the bottom row whole into
   * the sheet's next tile row, the top row's last three pixel rows only.
   */
  private textIntoSheet(dst: number, from: number, width: number): void {
    for (let i = 0; i < width; i++) {
      this.windowTileInto(from + i, 8, dst + i + 8, 0);
      this.windowTileInto(from + i, 0, dst + i, 5);
    }
  }

  private windowTileInto(tx: number, rowTile: number, dst: number, firstRow: number): void {
    const ty = rowTile ? 1 : 0;
    const { pixels, stride } = this.window;
    for (let y = firstRow; y < 8; y++)
      for (let x = 0; x < 8; x++) this.sheet[dst * 64 + y * 8 + x] = pixels[(ty * 8 + y) * stride + tx * 8 + x];
  }

  /** CpuCopy32 of `count` element tiles into a sheet. */
  private copyElement(element: number, sheet: Uint8Array, at: number, count: number): void {
    const tiles = this.flow.assets.get("healthboxElements").tiles;
    sheet.set(tiles.subarray(element * 64, (element + count) * 64), at * 64);
  }
}

/**
 * The party's balls on the summary bar at the battle's start (CreatePartyStatusSummarySprites):
 * the bar slides in, then each ball after its delay; both slide back out when the Pokémon are
 * sent out.
 */
export class PartySummary {
  private readonly bar: Sprite;
  private readonly balls: Sprite[] = [];
  private leaving = false;

  constructor(
    private readonly flow: Flow,
    readonly foe: boolean,
    party: readonly PartyBall[],
  ) {
    const { gba, assets } = flow;
    gba.sprites.loadSheet("partySummaryBar", assets.get("partySummaryBar").tiles);
    gba.sprites.loadSheet("partySummaryBalls", assets.get("healthboxElements").tiles.subarray(GFX.partyBall * 64, (GFX.partyBall + 4) * 64));
    gba.palettes.loadSpritePalette("healthbox", assets.get("healthboxPal").palette);
    this.bar = gba.sprites.create({ sheet: "partySummaryBar", palette: "healthbox", width: 128, height: 8, priority: 1 }, foe ? 40 : 200, foe ? 44 : 100, 10)!;
    this.bar.hFlip = foe;
    this.bar.x2 = foe ? -100 : 100;
    for (let i = 0; i < 6; i++) {
      // The opponent's balls are drawn from the right: the lead is nearest the middle.
      const member = foe ? 5 - i : i;
      const ball = party[member];
      const image = ball === undefined || ball === PartyBall.UNSPECIFIED ? 1 : ball === PartyBall.FAINTED ? 3 : ball === PartyBall.STATUS ? 2 : 0;
      const x = foe ? 30 + 10 * i : 160 + 10 * i;
      const s = gba.sprites.create({ sheet: "partySummaryBalls", palette: "healthbox", width: 8, height: 8, priority: 1, anims: [[{ image, duration: 0 }, "end"]] }, x, foe ? 36 : 92, 9)!;
      s.x2 = foe ? -120 : 120;
      s.data[0] = foe ? (6 - i) * 7 + 10 : i * 7 + 10;
      this.balls.push(s);
    }
    flow.play("se_ball_tray_enter");
  }

  /** One frame; false once it slid out and is gone. */
  update(): boolean {
    const dir = this.foe ? 1 : -1;
    if (!this.leaving) {
      if (this.bar.x2 !== 0) this.bar.x2 += dir * 5;
      for (const b of this.balls) {
        if (b.data[0] > 0) b.data[0]--;
        else if (b.x2 !== 0) b.x2 = this.foe ? Math.min(0, b.x2 + 12) : Math.max(0, b.x2 - 12);
      }
      return true;
    }
    for (const s of [this.bar, ...this.balls]) s.x2 -= dir * 8;
    if (Math.abs(this.bar.x2) < 200) return true;
    this.destroy();
    return false;
  }

  /** Task_HidePartyStatusSummary: everything slides back out. */
  leave(): void {
    this.leaving = true;
  }

  get settled(): boolean {
    return this.bar.x2 === 0 && this.balls.every((b) => b.x2 === 0);
  }

  destroy(): void {
    const { gba } = this.flow;
    for (const s of [this.bar, ...this.balls]) gba.sprites.destroy(s);
  }
}

/** A text without its EOS. */
function strip(text: Text): number[] {
  const end = text.indexOf(EOS);
  return [...(end < 0 ? text : text.slice(0, end))];
}
