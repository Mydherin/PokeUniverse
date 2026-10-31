// The FireRed start flow: copyright screen, intro, title screen, main menu, then New Game
// (controls guide, Pikachu pages, Oak's speech, naming screens).
// The title's timeout plays the intro again; B on the main menu goes back to the title.

import { create, fromJson, toJson } from "@bufbuild/protobuf";
import { NewTrainerSchema, TrainerSummarySchema, type TrainerSummary } from "@pokeuniverse/contracts/trainer/v1/trainer";
import { api } from "../../api/client";
import type { Gba } from "../gba/gba";
import { decodeText, encodeText, Font, FontId, TextPrinters } from "../gba/text";
import { startCopyright } from "./copyright";
import type { Flow, NewTrainer } from "./flow";
import { startIntro } from "./intro";
import { startMainMenu } from "./main-menu";
import { Assets, NEW_GAME_SOUNDS, type SoundId } from "./manifest";
import { startNewGame } from "./new-game";
import { startTitle } from "./title";

/** The account's trainer, or null when it has none; a network error counts as none. */
export async function fetchTrainer(): Promise<TrainerSummary | null> {
  try {
    const res = await api("/api/trainer");
    return fromJson(TrainerSummarySchema, await res.json());
  } catch {
    return null;
  }
}

/** Text speed MID (4 frames per character) scrolls 2 pixels per frame. */
const SCROLL_SPEED = 2;
const RETRY_MS = 2000;

/** PUT /api/trainer until the server saved it (the same trainer twice is the same result). */
async function putTrainer(assets: Assets, trainer: NewTrainer): Promise<TrainerSummary> {
  const body = toJson(
    NewTrainerSchema,
    create(NewTrainerSchema, { gender: trainer.gender, name: decodeText(assets.charmap, trainer.name), rivalName: decodeText(assets.charmap, trainer.rivalName) }),
  );
  for (;;) {
    try {
      const res = await api("/api/trainer", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return fromJson(TrainerSummarySchema, await res.json());
    } catch {
      await new Promise((r) => setTimeout(r, RETRY_MS));
    }
  }
}

export function startFireRed(gba: Gba, assets: Assets, trainer: Promise<TrainerSummary | null>): void {
  let summary: TrainerSummary | null = null;
  void trainer.then((t) => (summary = t));
  const font = new Font(assets.get("font").image!, assets.fontWidths.normal, 16, 14, 14, 1, 0);
  let fonts: Record<FontId, Font> | null = null;
  let text: TextPrinters | null = null;
  // The New Game set loads in the background while the intro plays.
  const newGame = Promise.all([assets.loadNewGame(), gba.sound.load([...NEW_GAME_SOUNDS], Assets.soundUrl)]).then(() => {
    const w = assets.fontWidths;
    const male = new Font(assets.get("fontMale").image!, w.male, 16, 14, 14, 0, 0);
    const all = {
      [FontId.Small]: new Font(assets.get("fontSmall").image!, w.small, 8, 13, 13, 0, 0),
      [FontId.NormalCopy1]: new Font(assets.get("font").image!, w.normalCopy1, 16, 14, 14, 0, 0),
      [FontId.Normal]: font,
      [FontId.NormalCopy2]: font,
      [FontId.Male]: male,
      [FontId.Female]: male,
    };
    for (const f of Object.values(all)) f.keypadIcons = assets.get("keypadIcons").image;
    fonts = all;
    text = new TextPrinters({
      fonts: all,
      downArrow: assets.get("downArrows").image!,
      input: gba.input,
      playSelect: () => gba.sound.play("se_select"),
      canABSpeedUpPrint: false,
      scrollSpeed: SCROLL_SPEED,
    });
  });
  void newGame.catch(() => {});

  const flow: Flow = {
    gba,
    assets,
    font,
    get fonts() {
      return fonts!;
    },
    get text() {
      return text!;
    },
    get trainer() {
      return summary;
    },
    newGameReady: () => newGame,
    saveTrainer: async (t) => {
      summary = await putTrainer(assets, t);
    },
    encode: (s: string) => encodeText(assets.charmap, s),
    play: (id: SoundId, player?: string) => gba.sound.play(id, player),
    playBgm: (id: SoundId) => gba.sound.playBgm(id),
    runFrame: () => {
      gba.tasks.run();
      text?.run();
      gba.sprites.animate();
      gba.sprites.buildOam();
      gba.palettes.updateFade();
    },
    toCopyright: () => startCopyright(flow),
    toIntro: () => startIntro(flow),
    toTitle: () => startTitle(flow),
    toMainMenu: () => startMainMenu(flow),
    toNewGame: () => startNewGame(flow),
  };
  flow.toCopyright();
}
