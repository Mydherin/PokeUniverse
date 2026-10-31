// What every FireRed screen gets: the machine, the art, and the way to the other screens.

import type { Gender, TrainerSummary } from "@pokeuniverse/contracts/trainer/v1/trainer";
import type { WorldLink } from "../../realtime/connection";
import type { Gba } from "../gba/gba";
import type { Font, FontId, Text, TextPrinters } from "../gba/text";
import type { WorldView } from "../world/view";
import type { Assets, SoundId } from "./manifest";
import type { Options } from "./options";
import type { PlayTime } from "./play-time";

/** The trainer Oak's speech decides: names as the game's encoded text. */
export interface NewTrainer {
  gender: Gender;
  name: Text;
  rivalName: Text;
}

export interface Flow {
  readonly gba: Gba;
  readonly assets: Assets;
  /** The world, drawn under the screen. */
  readonly world: WorldView;
  /** The world on the server: entering it, the player's intents, its answers. */
  readonly link: WorldLink;
  /** FONT_NORMAL, ready from boot. */
  readonly font: Font;
  /** Every font, and the text printers; ready once `newGameReady` resolved. */
  readonly fonts: Record<FontId, Font>;
  readonly text: TextPrinters;
  /** The account's trainer once the server answered; null when there is none (yet). */
  readonly trainer: TrainerSummary | null;
  /** The trainer's play time, counting once in the world. */
  readonly playTime: PlayTime;
  /** The trainer's options; FireRed's defaults until there is a trainer. */
  readonly options: Options;
  /** New options from the OPTION menu: applied at once and saved on the server in the background. */
  setOptions(options: Options): void;
  /** The New Game art, text and sounds (loading in the background since boot). */
  newGameReady(): Promise<void>;
  /** Saves New Game's trainer on the server, retrying until it is saved. */
  saveTrainer(trainer: NewTrainer): Promise<void>;
  encode(s: string): Text;
  play(id: SoundId, player?: string): void;
  /** A species' cry (by national number) on the cry player, loaded first if it isn't yet. */
  playCry(species: number): void;
  playBgm(id: SoundId): void;
  /** The New Game screens' main callback: tasks, text printers, sprites, palette fade. */
  runFrame(): void;
  toCopyright(): void;
  toIntro(): void;
  toTitle(): void;
  toMainMenu(): void;
  toNewGame(): void;
  /** The world, where the trainer is. */
  toOverworld(): void;
}
