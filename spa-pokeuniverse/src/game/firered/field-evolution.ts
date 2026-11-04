// The evolution scene outside battle (phase-6 M2): a RARE CANDY's, which asks mic-core when it isn't
// stopped, or an evolution item's, already saved, which only shows it. Same scene as a battle's.

import { create } from "@bufbuild/protobuf";
import { PendingEvolutionSchema, PokemonEvolvedSchema, type LearnMoveResult, type PokemonEvolved } from "@pokeuniverse/contracts/party/v1/party";
import { PALETTES_ALL } from "../gba/palette";
import { RGB_BLACK } from "../gba/video";
import { evolutionScene, type EvolutionHost } from "./battle/evolution";
import { prepareBattle } from "./battle/screen";
import { BattleScene } from "./battle/scene";
import { BattleTexts } from "./battle/text";
import type { Flow } from "./flow";
import { monName, type PartyHost } from "./party-menu";
import { startSummary } from "./summary";

/** What the scene needs besides the party menu's host; only the field has it. */
export interface GrowthHost {
  /** A scene that wasn't stopped: mic-core saves it, then answers. */
  evolve(slot: number): Promise<PokemonEvolved>;
  /** One of the moves left waiting replaces another: mic-core saves it, then answers. */
  learnMove(slot: number, move: number, forget: number): Promise<LearnMoveResult>;
  /** The map's music again (Overworld_PlaySpecialMapMusic). */
  mapMusic(): void;
}

export type FieldEvolution =
  /** A level up reached it. */
  | { slot: number; species: number }
  /** An item already did it: what it was, and what it learned. */
  | { slot: number; species: number; from: { species: number; shiny: boolean }; learned: number[]; toLearn: number[] };

export function startFieldEvolution(flow: Flow, host: PartyHost, growth: GrowthHost, evolution: FieldEvolution, done: () => void): void {
  const { gba } = flow;
  const { slot, species } = evolution;
  const shown = "from" in evolution ? evolution : null;
  let evolved = false;
  const fadeIn = () => {
    gba.palettes.blendPalettes(PALETTES_ALL, 16, RGB_BLACK);
    gba.palettes.beginFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
    gba.setVBlank(gba.standardVBlank);
  };
  const name = (s: number) => {
    const mon = host.party.pokemon[s];
    return monName(flow, mon);
  };
  const scene = host.party.pokemon[slot];
  const fromName = shown ? monName(flow, { ...scene, species: shown.from.species }) : null;
  const texts = new BattleTexts(flow, host.playerName, undefined, () => false, name);
  const main = () => {
    if (job.next().done) {
      growth.mapMusic();
      done();
      return;
    }
    flow.runFrame();
  };
  const evolutionHost: EvolutionHost = {
    flow,
    texts,
    nationalDex: host.nationalDex,
    stoppable: !shown,
    newScene: () => new BattleScene(flow, host.gender, false),
    fadeIn,
    monName: (s) => (fromName && !evolved ? fromName : name(s)),
    mon: (s) => (shown && !evolved ? shown.from : host.party.pokemon[s]),
    moveAt: (s, moveSlot) => host.party.pokemon[s]?.moves[moveSlot]?.move ?? 0,
    evolve: (s) => {
      evolved = true;
      if (!shown) return growth.evolve(s);
      return Promise.resolve(create(PokemonEvolvedSchema, { slot: s, learned: shown.learned, toLearn: shown.toLearn }));
    },
    learnMove: (s, move, forget) => growth.learnMove(s, move, forget),
    *forgetScreen(s, move, pick, redraw) {
      gba.palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
      while (gba.palettes.fadeActive) yield;
      let returned = false;
      void flow.assets.pokemonArt(host.party.pokemon[s].species).then(() =>
        startSummary(flow, host, s, () => {
          returned = true;
          gba.setMain(main);
          redraw();
          fadeIn();
        }, { move, pick }),
      );
      while (!returned) yield;
      while (gba.palettes.fadeActive) yield;
    },
  };
  const pending = create(PendingEvolutionSchema, { slot, species });
  const run = function* (): Generator<void, void, void> {
    let ready = false;
    const go = () => (ready = true);
    void prepareBattle(flow).then(go, go);
    while (!ready) yield;
    yield* evolutionScene(evolutionHost, pending);
  };
  const job = run();
  gba.setMain(main);
}
