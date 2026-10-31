// The main menu: CONTINUE (with the trainer's stats) and NEW GAME, as in FireRed. FireRed
// has no OPTION entry here. An account without a trainer has nothing to choose: as with an
// empty save, the game goes straight to New Game, never drawing the menu.
// A fades out into the world where the trainer is (CONTINUE) or into New Game (Oak's
// speech). B goes back to the title screen.

import { Gender, type TrainerSummary } from "@pokeuniverse/contracts/trainer/v1/trainer";
import { Button } from "../gba/input";
import { PALETTES_ALL } from "../gba/palette";
import { Window, type WindowTemplate } from "../gba/text";
import { Effect, Layer, RGB_BLACK, RGB_WHITE, rgb, WIN_EFFECTS } from "../gba/video";
import { fillBgRect, initBg } from "./common";
import type { Flow } from "./flow";
import { setBlend } from "./intro";
import { userFrame } from "./manifest";

const WINDOWS = {
  continue: { left: 3, top: 1, width: 24, height: 10, palette: 15, baseBlock: 0x001 },
  newGame: { left: 3, top: 13, width: 24, height: 2, palette: 15, baseBlock: 0x0f1 },
  error: { left: 3, top: 15, width: 24, height: 4, palette: 15, baseBlock: 0x001 },
} satisfies Record<string, WindowTemplate>;

/** Window frame tiles (corners, edges) start here. */
const FRAME_TILE = 0x1b1;
const FRAME_PALETTE = 2;
const TITLE_COLORS = [10, 11, 12] as const;
const STAT_COLORS = [10, 1, 12] as const;
const CURSOR_MAX = 1;

/** Sets the menu up on the next frame (CB2_InitMainMenu). */
export function startMainMenu(flow: Flow): void {
  flow.gba.setMain(() => initMainMenu(flow));
}

function initMainMenu(flow: Flow): void {
  const { gba, assets } = flow;
  const { video, palettes, tasks } = gba;
  gba.setVBlank(null);
  gba.tasks.reset();
  gba.sprites.reset();
  palettes.freeSpritePalettes();
  palettes.resetFade();
  video.reset();
  // Hardware palette cleared except the backdrop color.
  video.palette.fill(0, 1);
  const bg = video.bgs[0];
  initBg(bg, 0, 0);
  bg.tiles = new Uint8Array(0x200 * 64);
  palettes.load(assets.get("menuBg").palette, 0, 16);
  palettes.load(assets.get("menuTextbox").palette, 15 * 16, 16);
  // Only the backdrop shows until the menu is drawn.
  video.win0On = true;
  gba.setMain(gba.runFrame);

  const trainer = flow.trainer;
  let cursor = 0;

  const setDarkenRegs = () => {
    Object.assign(video.win0, { left: 0, right: 0, top: 0, bottom: 0 });
    video.winIn0 = Layer.BG0;
    video.winOut = Layer.BG0 | WIN_EFFECTS;
    setBlend(video, Layer.ALL, Effect.Darken, 0);
    video.evy = 7;
  };

  // The menu task runs one step per frame; each step picks the next.
  let current: () => void = () => {};
  tasks.create(() => current(), 0);

  const loadFrame = () => {
    const frame = assets.get(userFrame(flow.options.frame));
    bg.tiles.set(frame.tiles, FRAME_TILE * 64);
    palettes.load(frame.palette, FRAME_PALETTE * 16, 16);
    eraseWindow(WINDOWS.error);
  };

  const eraseWindow = (w: WindowTemplate) => fillBgRect(bg, 0, w.left - 1, w.top - 1, w.left + w.width + 1, w.top + w.height + 1, FRAME_PALETTE);

  const drawFrame = (w: WindowTemplate) => {
    const { left, top, width, height } = w;
    const p = FRAME_PALETTE;
    fillBgRect(bg, FRAME_TILE, left - 1, top - 1, 1, 1, p);
    // The game fills the top edge with the window's full height; the window then covers it.
    fillBgRect(bg, FRAME_TILE + 1, left, top - 1, width, height, p);
    fillBgRect(bg, FRAME_TILE + 2, left + width, top - 1, 1, 1, p);
    fillBgRect(bg, FRAME_TILE + 3, left - 1, top, 1, height, p);
    fillBgRect(bg, FRAME_TILE + 5, left + width, top, 1, height, p);
    fillBgRect(bg, FRAME_TILE + 6, left - 1, top + height, 1, 1, p);
    fillBgRect(bg, FRAME_TILE + 7, left, top + height, width, 1, p);
    fillBgRect(bg, FRAME_TILE + 8, left + width, top + height, 1, 1, p);
  };

  const openWindow = (template: WindowTemplate, title: string) => {
    const win = new Window(bg, template);
    win.fill(10);
    win.print(flow.font, 2, 2, TITLE_COLORS, flow.encode(title));
    return win;
  };

  const show = (win: Window) => {
    drawFrame(win.template);
    win.putTilemap();
    win.copyToVram();
  };

  const printStats = (win: Window, t: TrainerSummary) => {
    win.print(flow.font, 2, 18, STAT_COLORS, flow.encode("PLAYER"));
    win.print(flow.font, 62, 18, STAT_COLORS, flow.encode(t.name));
    if (t.pokedexCaught !== undefined) {
      win.print(flow.font, 2, 50, STAT_COLORS, flow.encode("POKéDEX"));
      win.print(flow.font, 62, 50, STAT_COLORS, flow.encode(String(Math.min(t.pokedexCaught, 999))));
    }
    const hours = Math.min(Math.floor(t.playTimeSeconds / 3600), 999);
    const minutes = Math.floor(t.playTimeSeconds / 60) % 60;
    win.print(flow.font, 2, 34, STAT_COLORS, flow.encode("TIME"));
    win.print(flow.font, 62, 34, STAT_COLORS, flow.encode(`${hours}:${String(minutes).padStart(2, "0")}`));
    win.print(flow.font, 2, 66, STAT_COLORS, flow.encode("BADGES"));
    win.print(flow.font, 62, 66, STAT_COLORS, flow.encode(String(Math.min(t.badges, 9))));
  };

  const printMenu = (t: TrainerSummary) => {
    setDarkenRegs();
    const color = t.gender === Gender.GIRL ? rgb(31, 3, 21) : rgb(4, 16, 31);
    palettes.load([color], 15 * 16 + 1, 1);
    const cont = openWindow(WINDOWS.continue, "CONTINUE");
    printStats(cont, t);
    const newGame = openWindow(WINDOWS.newGame, "NEW GAME");
    show(cont);
    show(newGame);
  };

  // The New Game set has had the whole intro to load; a slow network waits on black,
  // a failed load goes back to the title screen.
  const startNewGame = () => {
    current = () => {};
    flow.newGameReady().then(() => flow.toNewGame(), () => flow.toTitle());
  };

  const moveCursorWindow = () => {
    const [top, bottom] = cursor === 0 ? [0, 0x60] : [0x60, 0x80];
    Object.assign(video.win0, { left: 18, right: 222, top: top + 2, bottom: bottom - 2 });
  };

  const handleInput = (): boolean => {
    const { input } = gba;
    if (input.isPressed(Button.A)) {
      flow.play("se_select");
      palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
      const next = cursor === 0 ? flow.toOverworld : startNewGame;
      current = () => {
        if (!palettes.fadeActive) next();
      };
    } else if (input.isPressed(Button.B)) {
      flow.play("se_select");
      palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
      Object.assign(video.win0, { left: 0, right: 240, top: 0, bottom: 160 });
      current = () => {
        if (!palettes.fadeActive) flow.toTitle();
      };
    } else if (input.isPressed(Button.Up) && cursor > 0) {
      cursor--;
      return true;
    } else if (input.isPressed(Button.Down) && cursor < CURSOR_MAX) {
      cursor++;
      return true;
    }
    return false;
  };

  const updateSelection = () => {
    moveCursorWindow();
    current = handleMenuInput;
  };
  const handleMenuInput = () => {
    if (!palettes.fadeActive && handleInput()) current = updateSelection;
  };

  // Frame by frame, as the game sets the menu up: frame, registers, text, then the fade in.
  // Without a trainer, New Game starts on the still black screen once the registers are set.
  current = () => {
    if (palettes.fadeActive) return;
    setDarkenRegs();
    loadFrame();
    current = () => {
      if (palettes.fadeActive) return;
      setDarkenRegs();
      if (!trainer) {
        current = () => {
          if (!palettes.fadeActive) startNewGame();
        };
        return;
      }
      current = () => {
        if (palettes.fadeActive) return;
        printMenu(trainer);
        current = () => {
          current = updateSelection;
          palettes.beginFade(PALETTES_ALL, 0, 16, 0, RGB_WHITE);
          bg.visible = true;
          gba.setVBlank(gba.standardVBlank);
        };
      };
    };
  };
}
