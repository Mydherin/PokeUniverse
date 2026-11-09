// A move's animation: its own script when it can play (converted from the games', D9), otherwise
// the generic one for its type and category. The converted scripts and their art table are a chunk
// of their own, loaded with the battle (loadAnimations).

import type { Move } from "@pokeuniverse/contracts/move/v1/catalog";
import type { AnimArtFiles } from "../../manifest";
import { moveInfo } from "../../../world/moves";
import { canPlay } from "./engine";
import { genericAnimation, typeColor } from "./generic";
import type { AnimArt, AnimProgram, AnimScript } from "./script";

export { playAnimation } from "./engine";
export type { AnimContext, AnimMon, AnimProgram } from "./script";

/** A converted file (anims/*.json): entries by move number or B_ANIM_*, and every block. */
interface AnimFile {
  moves: Record<string, string>;
  general?: Record<string, string>;
  status?: Record<string, string>;
  special?: Record<string, string>;
  scripts: Record<string, AnimScript>;
}

/** art.json: the tags' art (both games), each game's move backgrounds by its BG_* numbers. */
interface ArtFile {
  tags: Record<string, AnimArtFiles>;
  backgrounds: { firered: (AnimArtFiles | null)[]; expansion: (AnimArtFiles | null)[] };
}

interface Game {
  file: AnimFile;
  art: AnimArt;
}

let games: { firered: Game; expansion: Game } | null = null;
let loading: Promise<void> | null = null;

/** Loads the converted scripts once; until then moves play no animation. */
export function loadAnimations(): Promise<void> {
  loading ??= Promise.all([import("./firered.json"), import("./expansion.json"), import("./art.json")]).then(([firered, expansion, artFile]) => {
    const art = artFile.default as unknown as ArtFile;
    games = {
      firered: { file: firered.default as unknown as AnimFile, art: { tags: art.tags, backgrounds: art.backgrounds.firered } },
      expansion: { file: expansion.default as unknown as AnimFile, art: { tags: art.tags, backgrounds: art.backgrounds.expansion } },
    };
  });
  loading.catch(() => (loading = null));
  return loading;
}

/** A move's own program: moves 1-354 from FireRed's scripts, 355-467 from the expansion's. */
function ownProgram(move: Move): AnimProgram | null {
  if (!games) return null;
  for (const { file, art } of [games.firered, games.expansion]) {
    const entry = file.moves[move];
    if (entry) return { scripts: file.scripts, entry, art };
  }
  return null;
}

/** A tag's art files (ANIM_TAG_*), once the scripts are loaded. */
export function animTagArt(tag: string): AnimArtFiles | null {
  return games?.firered.art.tags[tag] ?? null;
}

/** A general, status or special animation of FireRed's (B_ANIM_*), if it can play. */
export function generalAnimation(name: string): AnimProgram | null {
  if (!games) return null;
  const { file, art } = games.firered;
  const entry = file.general?.[name] ?? file.status?.[name] ?? file.special?.[name];
  if (!entry) return null;
  const program = { scripts: file.scripts, entry, art };
  return canPlay(program) ? program : null;
}

/** The program a move plays and its type's color (none before loadAnimations). */
export function moveAnimation(move: Move, hasTarget: boolean): { program: AnimProgram; color: number } | null {
  if (!games) return null;
  const info = moveInfo(move);
  const own = ownProgram(move);
  const program = own && canPlay(own) ? own : { scripts: { generic: genericAnimation(info, hasTarget) }, entry: "generic", art: games.firered.art };
  return { program, color: typeColor(info.type) };
}
