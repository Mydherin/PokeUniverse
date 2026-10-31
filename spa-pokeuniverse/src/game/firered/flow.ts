// What every FireRed screen gets: the machine, the art, and the way to the other screens.

import type { TrainerSummary } from "@pokeuniverse/contracts/trainer/v1/trainer";
import type { Gba } from "../gba/gba";
import type { Font } from "../gba/text";
import type { Assets, SoundId } from "./manifest";

export interface Flow {
  readonly gba: Gba;
  readonly assets: Assets;
  readonly font: Font;
  /** The account's trainer once the server answered; null when there is none (yet). */
  readonly trainer: TrainerSummary | null;
  play(id: SoundId, player?: string): void;
  playBgm(id: SoundId): void;
  toCopyright(): void;
  toIntro(): void;
  toTitle(): void;
  toMainMenu(): void;
}
