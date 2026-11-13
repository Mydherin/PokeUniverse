// The FireRed start flow: copyright screen, intro, title screen, main menu, then New Game
// (controls guide, Pikachu pages, Oak's speech, naming screens) or CONTINUE, both into the world.
// The title's timeout plays the intro again; B on the main menu goes back to the title.

import { create, fromJson, toJson } from "@bufbuild/protobuf";
import { ButtonMode, NewTrainerSchema, OptionsSchema, SoundMode, TrainerSummarySchema, type TrainerSummary } from "@pokeuniverse/contracts/trainer/v1/trainer";
import { api, ApiError } from "../../api/client";
import type { WorldLink } from "../../realtime/connection";
import type { Gba } from "../gba/gba";
import type { WorldView } from "../world/view";
import { decodeText, encodeText, Font, FontId, TextPrinters } from "../gba/text";
import { startCopyright } from "./copyright";
import type { Flow, NewTrainer } from "./flow";
import { startIntro } from "./intro";
import { startMainMenu } from "./main-menu";
import { Assets, NEW_GAME_SOUNDS, type SoundId } from "./manifest";

/** {PLAY_SE} in the game's strings, by song number (songs.h). */
const TEXT_SONGS: Record<number, SoundId> = { 17: "se_flee", 49: "se_ball_bounce_1" };
/** {PLAY_BGM} songs in our strings, by number (songs.h). */
const TEXT_MUSIC: Record<number, SoundId> = { 322: "mus_caught" };
import { startNewGame } from "./new-game";
import { textScrollSpeed, validOptions, type Options } from "./options";
import { ChatWindow, type ChatSlots } from "./chat-window";
import { Faces } from "./friends-view";
import { Gender } from "@pokeuniverse/contracts/trainer/v1/trainer";
import { SocialState } from "../world/social";
import { startOverworld } from "./overworld";
import { PlayTime } from "./play-time";
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

/**
 * PUT /api/trainer/options, one request at a time: the newest options win, a failed save is
 * retried unless newer options replaced it, and options the server refuses are dropped.
 */
class OptionsSaver {
  private pending: Options | null = null;
  private running = false;

  save(options: Options): void {
    this.pending = options;
    if (!this.running) void this.run();
  }

  private async run(): Promise<void> {
    this.running = true;
    while (this.pending) {
      const options = this.pending;
      this.pending = null;
      try {
        const body = JSON.stringify(toJson(OptionsSchema, options));
        await api("/api/trainer/options", { method: "PUT", headers: { "Content-Type": "application/json" }, body });
      } catch (e) {
        if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 429) continue;
        await new Promise((r) => setTimeout(r, RETRY_MS));
        this.pending ??= options;
      }
    }
    this.running = false;
  }
}

/** Starts the game's screens; the returned function stops what lives outside the GBA screen (the chat). */
export function startFireRed(gba: Gba, assets: Assets, world: WorldView, link: WorldLink, trainer: Promise<TrainerSummary | null>, chatSlots: ChatSlots): () => void {
  let summary: TrainerSummary | null = null;
  let options = validOptions(undefined);
  const saver = new OptionsSaver();
  /** The options the game runs with: the trainer's, applied to the sound and the buttons. */
  const useTrainer = (t: TrainerSummary | null) => {
    summary = t;
    options = validOptions(t?.options);
    gba.sound.stereo = options.sound === SoundMode.STEREO;
    gba.input.lEqualsA = options.buttonMode === ButtonMode.L_EQUALS_A;
  };
  useTrainer(null);
  void trainer.then(useTrainer);
  const font = new Font(assets.get("font").image!, assets.fontWidths.normal, 16, 14, 14, 1, 0);
  const social = new SocialState();
  const faces = new Faces((g) => assets.get(g === Gender.GIRL ? "picLeafFront" : "picRedFront"));
  const chat = new ChatWindow(chatSlots, font, assets.charmap, link, gba.input, social, (id) => assets.text(id), faces);
  link.onSocial = (e) => {
    social.apply(e);
    chat.messages.apply(e);
  };
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
    for (const f of Object.values(all)) {
      f.keypadIcons = assets.get("keypadIcons").image;
      f.family = all;
    }
    fonts = all;
    text = new TextPrinters({
      fonts: all,
      downArrow: assets.get("downArrows").image!,
      input: gba.input,
      playSelect: () => gba.sound.play("se_select"),
      playSong: (song) => TEXT_SONGS[song] && gba.sound.play(TEXT_SONGS[song]),
      playBgm: (song) => TEXT_MUSIC[song] && gba.sound.playBgm(TEXT_MUSIC[song]),
      sePlaying: () => gba.sound.isPlaying("se"),
      canABSpeedUpPrint: false,
      get scrollSpeed() {
        return textScrollSpeed(options);
      },
    });
  });
  void newGame.catch(() => {});

  const playTime = new PlayTime();
  gba.onFrame = () => {
    playTime.update();
    chat.update();
  };
  const flow: Flow = {
    gba,
    playTime,
    assets,
    world,
    link,
    chat,
    social,
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
    get options() {
      return options;
    },
    setOptions: (o) => {
      if (!summary) return;
      useTrainer(Object.assign(summary, { options: o }));
      saver.save(o);
    },
    newGameReady: () => newGame,
    saveTrainer: async (t) => {
      useTrainer(await putTrainer(assets, t));
    },
    encode: (s: string) => encodeText(assets.charmap, s),
    play: (id: SoundId, player?: string) => gba.sound.play(id, player),
    playCry: (species: number) => {
      const id = Assets.cryId(species);
      void gba.sound.load([id], Assets.cryUrl).then(
        () => gba.sound.play(id, "cry"),
        () => {},
      );
    },
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
    toOverworld: () => startOverworld(flow),
  };
  flow.toCopyright();
  return () => chat.destroy();
}
