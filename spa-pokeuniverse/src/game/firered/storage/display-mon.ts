// The Pokémon under the hand, on the box screen's left (pokemon_storage_system_tasks.c): its pic,
// its text and the waveform under it.

import type { Pokemon } from "@pokeuniverse/contracts/party/v1/party";
import { Gender as MonGender } from "@pokeuniverse/contracts/pokemon/v1/pokemon";
import { toTiles } from "../../gba/assets";
import type { AnimCmd, Sprite, SpriteTemplate } from "../../gba/sprites";
import { decimalText, FontId, joinText, NumberMode, Window } from "../../gba/text";
import type { Background } from "../../gba/video";
import type { Flow } from "../flow";
import { monName, shownGender } from "../party-menu";
import { STORAGE_SPRITE_PALETTE } from "./cursor";
import { putMapRect } from "./party-panel";

const PIC_X = 40;
const PIC_Y = 48;
const PIC_TEMPLATE: SpriteTemplate = { sheet: "storagePic", palette: "storagePic", width: 64, height: 64, priority: 0 };
/** The shown one's marks (CreateMonMarkingComboSprite): one 32×8 image per combination. */
const MARKS_TEMPLATE: SpriteTemplate = {
  sheet: "markingCombo",
  palette: "markingCombo",
  width: 32,
  height: 8,
  priority: 1,
  anims: Array.from({ length: 16 }, (_, i) => [{ image: 4 * i, duration: 5 }, "end"] as AnimCmd[]),
};
const DATA_WIDTH = 8;
const DATA_X = 1;
const COLORS = [1, 2, 3] as const;
const COLORS_MALE = [1, 4, 5] as const;
const COLORS_FEMALE = [1, 6, 7] as const;

const WAVE_TEMPLATE: Omit<SpriteTemplate, "anims"> = { sheet: "storageWaveform", palette: STORAGE_SPRITE_PALETTE, width: 16, height: 8, priority: 0 };
const WAVE_ANIMS: AnimCmd[][] = [
  [{ image: 0, duration: 5 }, "end"],
  [{ image: 2, duration: 8 }, { image: 4, duration: 8 }, { image: 6, duration: 8 }, { jump: 0 }],
  [{ image: 8, duration: 5 }, "end"],
  [{ image: 10, duration: 8 }, { image: 4, duration: 8 }, { image: 12, duration: 8 }, { jump: 0 }],
];

export class DisplayMon {
  private readonly text: Window;
  /** MOVE ITEMS: PrintDisplayMonInfo puts the item on top. */
  itemMode = false;
  private readonly waves: Sprite[];
  private readonly marks: Sprite;
  private pic: Sprite | null = null;
  private showing = false;

  constructor(
    private readonly flow: Flow,
    private readonly bg: Background,
    baseBlock: number,
  ) {
    const { gba, assets } = flow;
    this.text = new Window(bg, { left: 0, top: 11, width: 9, height: 7, palette: 3, baseBlock });
    gba.palettes.loadSpritePalette("storagePic", new Uint16Array(16));
    gba.sprites.loadSheet("storageWaveform", assets.get("storageWaveform").tiles);
    const combo = assets.get("markingCombo");
    gba.sprites.loadSheet("markingCombo", combo.tiles);
    gba.palettes.loadSpritePalette("markingCombo", combo.palette);
    this.marks = gba.sprites.create(MARKS_TEMPLATE, 40, 150, 1)!;
    this.waves = [0, 1].map((i) => gba.sprites.create({ ...WAVE_TEMPLATE, anims: WAVE_ANIMS }, i * 63 + 8, 9, 2)!);
    this.text.putTilemap();
    this.show(null);
  }

  /** SetDisplayMonData, RefreshDisplayMonData. */
  show(mon: Pokemon | null): void {
    const { flow, bg } = this;
    const { gba, assets } = flow;
    gba.sprites.destroy(this.pic);
    this.pic = null;
    this.text.fill(1);
    if (mon) {
      this.printText(mon);
      const art = assets.loadedPokemonArt(mon.species);
      if (art) {
        gba.sprites.loadSheet("storagePic", toTiles(art.front));
        gba.palettes.load(mon.shiny ? art.shinyPalette : art.frontPalette, 256 + gba.palettes.spritePaletteSlot("storagePic") * 16, 16);
        this.pic = gba.sprites.create(PIC_TEMPLATE, PIC_X, PIC_Y, 0);
      }
    }
    this.text.copyToVram();
    this.marks.invisible = !mon;
    if (mon) this.marks.startAnim(mon.markings & 0xf);
    // UpdateWaveformAnimation: restarts only when the waveform turns on or off.
    const on = mon !== null;
    putMapRect(bg, assets.get("storagePkmnData").map!, DATA_WIDTH, on ? 0 : 2, DATA_WIDTH, 2, DATA_X, 0);
    if (on !== this.showing || !on) this.waves.forEach((s, i) => s.startAnim(i * 2 + (on ? 1 : 0)));
    this.showing = on;
  }

  /** PrintDisplayMonInfo: nickname, /SPECIES, gender and level, then the item. */
  private printText(mon: Pokemon): void {
    const { flow, text } = this;
    const { assets } = flow;
    const font = flow.fonts[FontId.Normal];
    // MOVE ITEMS: the item first, the rest 15 pixels lower.
    const top = this.itemMode ? 15 : 0;
    const itemY = this.itemMode ? 0 : 44;
    text.print(font, 6, top, COLORS, monName(flow, mon));
    text.print(font, 6, top + 14, COLORS, joinText(assets.text("gText_Slash"), assets.species(mon.species).name));
    const gender = shownGender(mon);
    const male = gender === MonGender.MALE;
    const symbol = gender === MonGender.UNSPECIFIED ? flow.encode(" ") : assets.text(male ? "gText_MaleSymbol" : "gText_FemaleSymbol");
    text.print(font, 10, top + 28, male ? COLORS_MALE : COLORS_FEMALE, symbol);
    const level = joinText(flow.encode(" "), assets.text("gText_Lv"), decimalText(mon.level, NumberMode.LeftAlign, 3));
    text.print(font, 10 + font.width(symbol), top + 28, COLORS, level);
    if (mon.heldItem) text.print(flow.fonts[FontId.Small], 6, itemY, COLORS, assets.itemName(mon.heldItem));
  }
}
