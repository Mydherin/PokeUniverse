// FireRed art style manifest (tech-stack.md#decoupled-presentation): the screens ask for
// graphic and sound IDs, this maps them to the files `make assets` puts in public/firered/.
// A graphic's palette is its .pal file when it has one, otherwise the PNG's own palette.

import { fetchBin, fetchPal, fetchPng, toTiles, type IndexedImage } from "../gba/assets";
import type { SoundInfo } from "../gba/sound";

const ROOT = "/firered";

interface GraphicFiles {
  png?: string;
  pal?: string;
  bin?: string;
}

const GRAPHICS = {
  copyright: { png: "intro/copyright.png", pal: "intro/copyright.pal", bin: "intro/copyright.bin" },
  // Game Freak logo scene
  gfBg: { png: "intro/game_freak/bg.png", pal: "intro/game_freak/bg.pal", bin: "intro/game_freak/bg.bin" },
  gfLogo: { png: "intro/game_freak/logo.png" },
  gfText: { png: "intro/game_freak/game_freak.png" },
  gfStar: { png: "intro/game_freak/star.png" },
  gfSparkles: { pal: "intro/game_freak/sparkles.pal" },
  gfSparklesSmall: { png: "intro/game_freak/sparkles_small.png" },
  gfSparklesBig: { png: "intro/game_freak/sparkles_big.png" },
  // Fight scenes
  gengarPal: { pal: "intro/gengar.pal" },
  nidorinoPal: { pal: "intro/nidorino.pal" },
  scene1Grass: { png: "intro/scene_1/grass.png", bin: "intro/scene_1/grass.bin" },
  scene1Bg: { png: "intro/scene_1/bg.png", bin: "intro/scene_1/bg.bin" },
  scene2Bg: { png: "intro/scene_2/bg.png", pal: "intro/scene_2/bg.pal", bin: "intro/scene_2/bg.bin" },
  scene2Plants: { png: "intro/scene_2/plants.png", bin: "intro/scene_2/plants.bin" },
  scene2GengarClose: { png: "intro/scene_2/gengar_close.png", bin: "intro/scene_2/gengar_close.bin" },
  scene2NidorinoClose: { png: "intro/scene_2/nidorino_close.png", pal: "intro/scene_2/nidorino_close.pal", bin: "intro/scene_2/nidorino_close.bin" },
  scene2Gengar: { png: "intro/scene_2/gengar.png" },
  scene2Nidorino: { png: "intro/scene_2/nidorino.png" },
  scene3Bg: { png: "intro/scene_3/bg.png", pal: "intro/scene_3/bg.pal", bin: "intro/scene_3/bg.bin" },
  scene3GengarAnim: { png: "intro/scene_3/gengar_anim.png", bin: "intro/scene_3/gengar_anim.bin" },
  scene3Nidorino: { png: "intro/scene_3/nidorino.png" },
  scene3Grass: { png: "intro/scene_3/grass.png" },
  scene3GengarStatic: { png: "intro/scene_3/gengar_static.png" },
  scene3Swipe: { png: "intro/scene_3/swipe.png" },
  scene3RecoilDust: { png: "intro/scene_3/recoil_dust.png" },
  // Title screen
  titleLogo: { png: "title_screen/firered/game_title_logo.png", pal: "title_screen/firered/game_title_logo.pal", bin: "title_screen/firered/game_title_logo.bin" },
  titleBoxArt: { png: "title_screen/firered/box_art_mon.png", pal: "title_screen/firered/box_art_mon.pal", bin: "title_screen/firered/box_art_mon.bin" },
  titleBackground: { pal: "title_screen/firered/background.pal" },
  titlePressStart: { png: "title_screen/copyright_press_start.png", bin: "title_screen/copyright_press_start.bin" },
  titleBorder: { png: "title_screen/border_bg.png", bin: "title_screen/firered/border_bg.bin" },
  titleFlames: { png: "title_screen/firered/flames.png" },
  titleBlankFlames: { png: "title_screen/firered/blank_flames.png" },
  titleBlankSprite: { png: "title_screen/blank_sprite.png" },
  titleSlash: { png: "title_screen/slash.png", pal: "title_screen/firered/slash.pal" },
  // Main menu
  menuBg: { pal: "main_menu/bg.pal" },
  menuTextbox: { pal: "main_menu/textbox.pal" },
  textWindowFrame: { png: "text_window/type1.png" },
  font: { png: "fonts/latin_normal.png" },
} satisfies Record<string, GraphicFiles>;

export type GraphicId = keyof typeof GRAPHICS;

/** The sounds `make audio` renders (src/game/firered/sounds.json). */
export const SOUNDS = ["mus_game_freak", "mus_intro_fight", "mus_title", "se_select", "cry_nidorino_doubles", "cry_charizard"] as const;
export type SoundId = (typeof SOUNDS)[number];

export interface Graphic {
  image: IndexedImage | null;
  /** 8×8 tiles, one index per pixel. */
  tiles: Uint8Array;
  palette: Uint16Array;
  map: Uint16Array | null;
}

export class Assets {
  private constructor(
    private readonly graphics: Map<GraphicId, Graphic>,
    readonly fontWidths: number[],
    readonly soundManifest: Record<string, SoundInfo>,
  ) {}

  static async load(): Promise<Assets> {
    const entries = await Promise.all(
      (Object.entries(GRAPHICS) as [GraphicId, GraphicFiles][]).map(async ([id, files]) => {
        const [image, pal, map] = await Promise.all([
          files.png ? fetchPng(`${ROOT}/graphics/${files.png}`) : null,
          files.pal ? fetchPal(`${ROOT}/graphics/${files.pal}`) : null,
          files.bin ? fetchBin(`${ROOT}/graphics/${files.bin}`) : null,
        ]);
        const graphic: Graphic = {
          image,
          tiles: image ? toTiles(image) : new Uint8Array(0),
          palette: pal ?? image?.palette ?? new Uint16Array(16),
          map,
        };
        return [id, graphic] as const;
      }),
    );
    const [widths, manifest] = await Promise.all([
      fetch(`${ROOT}/graphics/fonts/latin_normal_widths.json`).then((r) => r.json() as Promise<number[]>),
      fetch(`${ROOT}/audio/manifest.json`).then((r) => r.json() as Promise<Record<string, SoundInfo>>),
    ]);
    return new Assets(new Map(entries), widths, manifest);
  }

  get(id: GraphicId): Graphic {
    return this.graphics.get(id)!;
  }

  static soundUrl(id: string, ext: string): string {
    return `${ROOT}/audio/${id}.${ext}`;
  }
}
