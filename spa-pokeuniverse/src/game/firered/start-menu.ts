// The START menu (start_menu.c): the entries the player has unlocked, in a standard frame at the
// top right, the "▶" cursor and, in the HELP button mode, the help bar describing the selected
// entry. It draws over a few frames like the game; the overworld acts on what is chosen.

import { Button } from "../gba/input";
import { FontId, Window, expandPlaceholders, PLACEHOLDER_PLAYER, type Text, type WindowTemplate } from "../gba/text";
import type { Background } from "../gba/video";
import type { Flow } from "./flow";
import type { TextId } from "./manifest";
import { clearStdWindowAndFrame, CursorMenu, DLG_WINDOW_PALETTE, drawStdFrame, HelpMessageWindow, loadStdWindowFrameGfx, printDefault } from "./menu";

export const enum StartMenuEntry {
  Pokedex,
  Pokemon,
  Bag,
  Player,
  Save,
  Option,
  Exit,
}

const ENTRIES: Record<StartMenuEntry, { name: TextId; description: TextId }> = {
  [StartMenuEntry.Pokedex]: { name: "gText_MenuPokedex", description: "gStartMenuDesc_Pokedex" },
  [StartMenuEntry.Pokemon]: { name: "gText_MenuPokemon", description: "gStartMenuDesc_Pokemon" },
  [StartMenuEntry.Bag]: { name: "gText_MenuBag", description: "gStartMenuDesc_Bag" },
  [StartMenuEntry.Player]: { name: "gText_MenuPlayer", description: "gStartMenuDesc_Player" },
  [StartMenuEntry.Save]: { name: "gText_MenuSave", description: "gStartMenuDesc_Save" },
  [StartMenuEntry.Option]: { name: "gText_MenuOption", description: "gStartMenuDesc_Option" },
  [StartMenuEntry.Exit]: { name: "gText_MenuExit", description: "gStartMenuDesc_Exit" },
};

/** What decides the entries: the story flags FLAG_SYS_POKEDEX_GET and FLAG_SYS_POKEMON_GET. */
export interface StartMenuState {
  hasPokedex: boolean;
  hasPokemon: boolean;
  /** The OPTION button mode is HELP (FireRed's default): the help bar shows. */
  helpBar: boolean;
}

/** SetUpStartMenu_NormalField. */
function entriesFor(state: StartMenuState): StartMenuEntry[] {
  const entries: StartMenuEntry[] = [];
  if (state.hasPokedex) entries.push(StartMenuEntry.Pokedex);
  if (state.hasPokemon) entries.push(StartMenuEntry.Pokemon);
  entries.push(StartMenuEntry.Bag, StartMenuEntry.Player, StartMenuEntry.Save, StartMenuEntry.Option, StartMenuEntry.Exit);
  return entries;
}

/** Lines are 15 pixels apart: each entry takes two tile rows but the last. */
const LINE_HEIGHT = 15;
/** Frames the menu takes to show (DoDrawStartMenu's steps): 5, plus a frame per 2 entries printed. */
const SETUP_FRAMES = 5;
const ENTRIES_PER_FRAME = 2;

/** sStartMenuCursorPos: kept from one opening to the next while the game runs. */
let savedCursor = 0;

export type StartMenuResult = StartMenuEntry | "closed" | null;

export class StartMenu {
  private readonly entries: StartMenuEntry[];
  private readonly win: Window;
  private menu: CursorMenu | null = null;
  private help: HelpMessageWindow | null = null;
  private drawFrames: number;

  constructor(
    private readonly flow: Flow,
    private readonly bg: Background,
    private readonly playerName: Text,
    private readonly state: StartMenuState,
  ) {
    this.entries = entriesFor(state);
    const template: WindowTemplate = { left: 22, top: 1, width: 7, height: this.entries.length * 2 - 1, palette: DLG_WINDOW_PALETTE, baseBlock: 0x13d };
    this.win = new Window(bg, template);
    this.drawFrames = SETUP_FRAMES + Math.ceil(this.entries.length / ENTRIES_PER_FRAME);
  }

  /**
   * One frame of drawing; true once the menu shows. The game builds it in the tilemap buffer
   * and copies it to the screen on the last step, so it appears at once.
   */
  draw(): boolean {
    if (this.menu) return true;
    if (--this.drawFrames > 0) return false;
    const { flow, win } = this;
    loadStdWindowFrameGfx(flow, this.bg);
    drawStdFrame(win);
    this.entries.forEach((entry, i) => printDefault(flow, win, FontId.Normal, this.name(entry), 8, i * LINE_HEIGHT));
    this.menu = new CursorMenu(flow, win, FontId.Normal, 0, 0, LINE_HEIGHT, this.entries.length, savedCursor);
    savedCursor = this.menu.cursorPos;
    if (this.state.helpBar) this.help = new HelpMessageWindow(flow, this.bg, this.description());
    return true;
  }

  /** StartCB_HandleInput: the entry chosen with A, "closed" with B or START (the menu is gone), or null. */
  update(): StartMenuResult {
    const { flow } = this;
    const { input } = flow.gba;
    const menu = this.menu;
    if (!menu) return null;
    for (const [button, delta] of [
      [Button.Up, -1],
      [Button.Down, 1],
    ] as const) {
      if (!input.isPressed(button)) continue;
      flow.play("se_select");
      savedCursor = menu.moveCursor(delta);
      this.help?.print(this.description());
    }
    if (input.isPressed(Button.A)) {
      flow.play("se_select");
      return this.entries[menu.cursorPos];
    }
    if (input.isPressed(Button.B | Button.Start)) {
      this.close();
      return "closed";
    }
    return null;
  }

  /** CloseStartMenu, with the help bar (StartMenuExitCallback, or B). */
  close(): void {
    this.flow.play("se_select");
    this.help?.destroy();
    this.help = null;
    clearStdWindowAndFrame(this.win);
    this.menu = null;
  }

  private name(entry: StartMenuEntry): Text {
    const text = this.flow.assets.text(ENTRIES[entry].name);
    return expandPlaceholders(text, { [PLACEHOLDER_PLAYER]: this.playerName });
  }

  private description(): Text {
    return this.flow.assets.text(ENTRIES[this.entries[this.menu!.cursorPos]].description);
  }
}
