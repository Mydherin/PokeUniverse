// A script's multichoice (script_menu.c ScriptMenu_Multichoice / DrawMultichoiceMenu): FireRed's
// lists by name, drawn where the script puts them, as wide as the longest entry; B cancels.

import { Button } from "../gba/input";
import { FontId, Window } from "../gba/text";
import type { Flow } from "./flow";
import type { TextId } from "./manifest";
import { clearStdWindowAndFrameToTransparent, CursorMenu, DLG_WINDOW_PALETTE, drawStdFrame, MENU_B_PRESSED, MENU_NOTHING_CHOSEN, printDefault } from "./menu";

/** sMultichoiceLists, and where cable_club.inc's `multichoice` draws each (left, top). */
const MENUS: Record<string, { texts: TextId[]; left: number; top: number }> = {
  yes_no_info: { texts: ["gText_Yes", "gText_No", "gText_Info"], left: 18, top: 6 },
  trade_colosseum_2: { texts: ["gText_TradeCenter", "gText_Colosseum_2", "gOtherText_Exit"], left: 0, top: 0 },
  single_double_multi_info_exit: { texts: ["gText_SingleBattle", "gText_DoubleBattle", "gText_MultiBattle", "gText_Info", "gOtherText_Exit"], left: 0, top: 0 },
  join_or_lead: { texts: ["gText_JoinGroup", "gText_BecomeLeader", "gOtherText_Exit"], left: 13, top: 6 },
};
/** GetMCWindowHeight. */
const MC_HEIGHTS = [1, 2, 4, 6, 7, 9, 11, 13, 14];
const MC_BASE_BLOCK = 0x125; // The player menu's: clear of the field message box.

/** Whether the script can show this menu as a multichoice (else it's the YES/NO box). */
export function isMultichoice(menu: string): boolean {
  return menu in MENUS;
}

export class ScriptMultichoice {
  private readonly menu: CursorMenu;
  /** The entries, then B. */
  private readonly count: number;

  constructor(
    private readonly flow: Flow,
    name: string,
  ) {
    const { texts, left, top } = MENUS[name];
    const font = flow.fonts[FontId.Normal];
    const strings = texts.map((t) => flow.assets.text(t));
    const width = Math.floor((Math.max(...strings.map((t) => font.width(t))) + 9) / 8) + 1;
    const height = MC_HEIGHTS[texts.length];
    // CreateWindowFromRect: the window inside the frame.
    const win = new Window(flow.gba.video.bgs[0], { left: left + 1, top: top + 1, width, height, palette: DLG_WINDOW_PALETTE, baseBlock: MC_BASE_BLOCK });
    drawStdFrame(win);
    strings.forEach((t, i) => printDefault(flow, win, FontId.Normal, t, 8, 2 + i * 14));
    this.menu = new CursorMenu(flow, win, FontId.Normal, 0, 2, 14, texts.length, 0);
    this.count = texts.length;
  }

  /** One frame: the choice (the entries' count for B), or null while it waits. */
  update(): number | null {
    const chosen = this.menu.processInput(false);
    if (chosen === MENU_NOTHING_CHOSEN) return null;
    this.flow.gba.input.pressed &= ~(Button.A | Button.B);
    if (chosen === MENU_B_PRESSED) this.flow.play("se_select");
    this.close();
    return chosen === MENU_B_PRESSED ? this.count : chosen;
  }

  close(): void {
    clearStdWindowAndFrameToTransparent(this.menu.win);
  }
}
