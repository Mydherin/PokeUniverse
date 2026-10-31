// The FireRed start flow: copyright screen, intro, title screen, main menu.
// The title's timeout plays the intro again; B on the main menu goes back to the title.

import { fromJson } from "@bufbuild/protobuf";
import { TrainerSummarySchema, type TrainerSummary } from "@pokeuniverse/contracts/trainer/v1/trainer";
import { api } from "../../api/client";
import type { Gba } from "../gba/gba";
import { Font } from "../gba/text";
import { startCopyright } from "./copyright";
import type { Flow } from "./flow";
import { startIntro } from "./intro";
import { startMainMenu } from "./main-menu";
import type { Assets, SoundId } from "./manifest";
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

export function startFireRed(gba: Gba, assets: Assets, trainer: Promise<TrainerSummary | null>): void {
  let summary: TrainerSummary | null = null;
  void trainer.then((t) => (summary = t));
  const flow: Flow = {
    gba,
    assets,
    font: new Font(assets.get("font").image!, assets.fontWidths),
    get trainer() {
      return summary;
    },
    play: (id: SoundId, player?: string) => gba.sound.play(id, player),
    playBgm: (id: SoundId) => gba.sound.playBgm(id),
    toCopyright: () => startCopyright(flow),
    toIntro: () => startIntro(flow),
    toTitle: () => startTitle(flow),
    toMainMenu: () => startMainMenu(flow),
  };
  flow.toCopyright();
}
