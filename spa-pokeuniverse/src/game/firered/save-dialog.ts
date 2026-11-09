// SAVE, a homage (start_menu.c): the dialog behaves as FireRed's, stats window, questions and wait
// included, but nothing is saved or sent: an MMO saves everything all the time, and where
// FireRed says the game was saved, a joke says so.

import { Button } from "../gba/input";
import { FontId, Window, type Text, type WindowTemplate } from "../gba/text";
import type { PokedexState } from "../world/pokedex";
import { fieldYesNo, type FieldMessage } from "./field-message";
import type { Flow } from "./flow";
import type { TextId } from "./manifest";
import { clearStdWindowAndFrame, copyTiles, drawStdFrame, MENU_NOTHING_CHOSEN } from "./menu";

/** sSaveStatsWindowTemplate, with LoadStdWindowGfx's frame: the standard one, not the user's. */
const STATS_PALETTE = 13;
const STATS_WINDOW: WindowTemplate = { left: 1, top: 1, width: 14, height: 9, palette: STATS_PALETTE, baseBlock: 0x008 };
const STATS_FRAME_TILE = 0x21d;
const STATS_PIXEL_WIDTH = 112;
/** SaveStatToString's color: 8 for the location, 2 for the rest. */
const LOCATION_COLORS = [1, 8, 9] as const;
const STAT_COLORS = [1, 2, 3] as const;
const STAT_NAME_X = 2;
const STAT_VALUE_X = 60;
const MAX_HOURS_DIGITS = 3;

/** FireRed blocks here while it writes; about as long as that takes. */
const SAVING_FRAMES = 90;
/** SaveDialog_Wait60FramesOrAButtonHeld. */
const SAVED_FRAMES = 60;
/** The charmap's line break. */
const LINE_BREAK = 0xfe;
/** Where FireRed prints gText_PlayerSavedTheGame. */
const JOKE = ["Nah, it's a joke! This is an MMO.", "Every step is already saved!"];

/** What the stats window shows. */
export interface SaveStats {
  playerName: Text;
  /** ClientMap.region. */
  region: string;
  pokedex: PokedexState;
}

export type SaveOutcome = "saved" | "cancelled";

export class SaveDialog {
  private readonly stats: Window;
  private readonly steps: Generator<void, SaveOutcome, void>;

  constructor(
    private readonly flow: Flow,
    private readonly message: FieldMessage,
    info: SaveStats,
  ) {
    this.stats = this.showStats(info);
    this.steps = this.run();
  }

  /** One frame; what it came to once it ends (the windows are gone then). */
  update(): SaveOutcome | null {
    const step = this.steps.next();
    return step.done ? step.value : null;
  }

  /** The dialog's callbacks in order (sSaveDialogCB), one frame per yield. */
  private *run(): Generator<void, SaveOutcome, void> {
    const { flow } = this;
    yield* this.print(flow.assets.text("gText_WouldYouLikeToSaveTheGame"));
    if (!(yield* this.confirm())) return this.finish("cancelled");
    yield* this.print(flow.assets.text("gText_AlreadySaveFile_WouldLikeToOverwrite"));
    if (!(yield* this.confirm())) return this.finish("cancelled");
    yield* this.print(flow.assets.text("gText_SavingDontTurnOffThePower"));
    for (let i = 0; i < SAVING_FRAMES; i++) yield;
    yield* this.print(this.joke());
    flow.play("se_save");
    let delay = SAVED_FRAMES;
    for (;;) {
      if (!flow.gba.sound.isPlaying("se")) {
        if (flow.gba.input.isHeld(Button.A)) {
          flow.play("se_select");
          break;
        }
        if (delay-- === 0) break;
      }
      yield;
    }
    return this.finish("saved");
  }

  private *print(text: Text): Generator<void, void, void> {
    this.message.show(text, false);
    yield;
    while (this.message.printing) yield;
  }

  /** YES/NO over the message, YES first; B is NO. */
  private *confirm(): Generator<void, boolean, void> {
    const menu = fieldYesNo(this.flow);
    for (;;) {
      const answer = menu.processInput();
      if (answer !== MENU_NOTHING_CHOSEN) return answer === 0;
      yield;
    }
  }

  private finish(outcome: SaveOutcome): SaveOutcome {
    clearStdWindowAndFrame(this.stats);
    this.message.hide();
    return outcome;
  }

  /** The joke, on two lines. */
  private joke(): Text {
    const [first, second] = JOKE.map((line) => this.flow.encode(line));
    return [...first.slice(0, -1), LINE_BREAK, ...second];
  }

  /** PrintSaveStats. */
  private showStats({ playerName, region, pokedex }: SaveStats): Window {
    const { flow } = this;
    const { assets, gba, trainer, playTime } = flow;
    const bg = gba.video.bgs[0];
    copyTiles(bg, assets.get("stdWindowFrame").tiles, STATS_FRAME_TILE, 9);
    gba.palettes.load(assets.get("textWindowPal3").palette, STATS_PALETTE * 16, 16);
    const win = new Window(bg, STATS_WINDOW);
    drawStdFrame(win, STATS_FRAME_TILE, STATS_PALETTE);

    const location = assets.text(`mapsec.${region}`);
    const normal = flow.fonts[FontId.Normal];
    win.print(normal, Math.floor((STATS_PIXEL_WIDTH - normal.width(location, normal.letterSpacing)) / 2), 0, LOCATION_COLORS, location);

    const small = flow.fonts[FontId.Small];
    const stat = (name: TextId, value: Text, y: number) => {
      win.print(small, STAT_NAME_X, y, STAT_COLORS, assets.text(name));
      win.print(small, STAT_VALUE_X, y, STAT_COLORS, value);
    };
    stat("gSaveStatName_Player", playerName, 14);
    stat("gSaveStatName_Badges", flow.encode(String(trainer?.badges ?? 0)), 28);
    let y = 42;
    if (pokedex.obtained) {
      stat("gSaveStatName_Pokedex", flow.encode(String(pokedex.count(true, pokedex.last))), y);
      y = 56;
    }
    const hours = String(playTime.hours).slice(0, MAX_HOURS_DIGITS);
    stat("gSaveStatName_Time", flow.encode(`${hours}:${String(playTime.minutes).padStart(2, "0")}`), y);
    win.copyToVram();
    return win;
  }
}
