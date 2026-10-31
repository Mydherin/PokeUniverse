// The overworld's message box (field_message_box.c): the dialogue frame, or the signpost frame
// for signs, at the bottom of the screen on BG0, with the text printed letter by letter at the
// player's text speed.

import { FontId, Window, type Text } from "../gba/text";
import { initBg } from "./common";
import type { Flow } from "./flow";
import { clearDialogWindowAndFrame, drawDialogueFrame, loadSignpostWindowFrameGfx, loadStdWindowFrameGfx, STANDARD_TEXT_BOX } from "./menu";
import { textSpeedDelay } from "./options";
/** Tiles BG0 holds: the window's, then the frames'. */
const BG0_TILES = 0x21d;

export class FieldMessage {
  private readonly win: Window;
  private shown = false;

  constructor(private readonly flow: Flow) {
    const bg0 = flow.gba.video.bgs[0];
    initBg(bg0, 0, 0);
    bg0.tiles = new Uint8Array(BG0_TILES * 64);
    bg0.visible = true;
    this.win = new Window(bg0, STANDARD_TEXT_BOX);
    flow.text.reset();
  }

  /** Shows the box (loading the frame it needs) and starts printing (A or B speeds it up), or prints it all at once. */
  show(text: Text, signpost: boolean, fontId = FontId.Normal, instant = false): void {
    const bg = this.win.bg;
    if (signpost) loadSignpostWindowFrameGfx(this.flow, bg);
    else loadStdWindowFrameGfx(this.flow, bg);
    drawDialogueFrame(this.win, signpost);
    const font = this.flow.fonts[fontId];
    this.flow.text.ctx.canABSpeedUpPrint = true;
    this.flow.text.add(this.win, { font, x: 0, y: 1, letterSpacing: font.letterSpacing, lineSpacing: font.lineSpacing, colors: [1, 2, 3] }, instant ? 0 : textSpeedDelay(this.flow.options), text);
    this.win.copyToVram();
    this.shown = true;
  }

  get printing(): boolean {
    return this.flow.text.isActive(this.win);
  }

  /** HideFieldMessageBox. */
  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.flow.text.ctx.canABSpeedUpPrint = false;
    this.flow.text.reset();
    clearDialogWindowAndFrame(this.win);
  }
}
