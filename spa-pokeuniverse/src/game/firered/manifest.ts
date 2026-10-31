// FireRed art style manifest (tech-stack.md#decoupled-presentation): the screens ask for
// graphic, sound and text IDs, this maps them to the files `make assets` puts in public/firered/.
// A graphic's palette is its .pal file when it has one, otherwise the PNG's own palette.
// The boot set (intro, title, menu) loads first; the New Game set loads in the background.

import { fetchBin, fetchPal, fetchPng, toTiles, type IndexedImage } from "../gba/assets";
import type { SoundInfo } from "../gba/sound";
import type { Charmap, Text } from "../gba/text";
import type { TilesetArt } from "../world/view";

const ROOT = "/firered";

interface GraphicFiles {
  png?: string;
  pal?: string;
  bin?: string;
  /** An 8-bit PNG built as 4bpp tiles (pixel % 16), as gbagfx does. */
  bpp4?: boolean;
  /** Frames of `[width, height]` tiles, each frame's tiles in a row (gbagfx -mwidth -mheight). */
  meta?: [number, number];
}

const BOOT_GRAPHICS = {
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

const NEW_GAME_GRAPHICS = {
  // Text: fonts, prompt arrows, button icons, window frames and palettes
  fontMale: { png: "fonts/latin_male.png" },
  fontSmall: { png: "fonts/latin_small.png" },
  downArrows: { png: "fonts/down_arrows.png", bpp4: true },
  textCursor: { png: "fonts/down_arrow_3.png" },
  keypadIcons: { png: "fonts/keypad_icons.png" },
  stdMenuPal: { pal: "interface/std_menu.pal" },
  menuMessageFrame: { png: "text_window/menu_message.png" },
  textWindowPal0: { pal: "text_window/stdpal_0.pal" },
  textWindowPal2: { pal: "text_window/stdpal_2.pal" },
  // Controls guide, Pikachu intro and Oak's speech
  oakBgTiles: { png: "oak_speech/bg_tiles.png", bpp4: true },
  controlsPage2: { bin: "oak_speech/controls_guide_page_2.bin" },
  controlsPage3: { bin: "oak_speech/controls_guide_page_3.bin" },
  pikachuIntroMap: { bin: "oak_speech/pikachu_intro/tilemap.bin" },
  pikachuPal: { pal: "oak_speech/pikachu_intro/pikachu.pal" },
  pikachuBody: { png: "oak_speech/pikachu_intro/body.png" },
  pikachuEars: { png: "oak_speech/pikachu_intro/ears.png" },
  pikachuEyes: { png: "oak_speech/pikachu_intro/eyes.png" },
  oakSpeechBg: { png: "oak_speech/oak_speech_bg.png", bin: "oak_speech/oak_speech_bg.bin" },
  platform: { png: "oak_speech/platform.png", pal: "oak_speech/platform.pal" },
  picRed: { png: "oak_speech/red/pic.png", pal: "oak_speech/red/pal.pal" },
  picLeaf: { png: "oak_speech/leaf/pic.png", pal: "oak_speech/leaf/pal.pal" },
  picRival: { png: "oak_speech/rival/pic.png", pal: "oak_speech/rival/pal.pal" },
  picOak: { png: "oak_speech/oak/pic.png", pal: "oak_speech/oak/pal.pal" },
  nidoranF: { png: "pokemon/nidoran_f/front.png", pal: "pokemon/nidoran_f/normal.pal" },
  pokeBall: { png: "interface/ball/poke.png" },
  ballParticles: { png: "battle_anims/sprites/particles.png" },
  ballParticlesPal: { png: "battle_anims/sprites/circle_impact.png" },
  // Naming screen
  nsMenu: { png: "naming_screen/menu.png", pal: "naming_screen/menu.pal" },
  nsPageSwapUpperPal: { pal: "naming_screen/page_swap_upper.pal" },
  nsPageSwapLowerPal: { pal: "naming_screen/page_swap_lower.pal" },
  nsPageSwapOthersPal: { pal: "naming_screen/page_swap_others.pal" },
  nsButtonsPal: { pal: "naming_screen/buttons.pal" },
  nsCursorPal: { pal: "naming_screen/cursor.pal" },
  nsKeyboardPal: { pal: "naming_screen/keyboard.pal" },
  nsBackground: { bin: "naming_screen/background.bin" },
  nsKeyboardUpper: { bin: "naming_screen/keyboard_upper.bin" },
  nsKeyboardLower: { bin: "naming_screen/keyboard_lower.bin" },
  nsKeyboardSymbols: { bin: "naming_screen/keyboard_symbols.bin" },
  nsBackButton: { png: "naming_screen/back_button.png" },
  nsOkButton: { png: "naming_screen/ok_button.png" },
  nsPageSwapFrame: { png: "naming_screen/page_swap_frame.png" },
  nsPageSwapButton: { png: "naming_screen/page_swap_button.png" },
  nsPageSwapUpper: { png: "naming_screen/page_swap_upper.png" },
  nsPageSwapLower: { png: "naming_screen/page_swap_lower.png" },
  nsPageSwapOthers: { png: "naming_screen/page_swap_others.png" },
  nsCursor: { png: "naming_screen/cursor.png" },
  nsCursorSquished: { png: "naming_screen/cursor_squished.png" },
  nsCursorFilled: { png: "naming_screen/cursor_filled.png" },
  nsInputArrow: { png: "naming_screen/input_arrow.png" },
  nsUnderscore: { png: "naming_screen/underscore.png" },
  nsRival: { png: "naming_screen/rival.png", pal: "naming_screen/rival.pal" },
  owRed: { png: "object_events/pics/people/red_normal.png", meta: [2, 4] },
  owGreen: { png: "object_events/pics/people/green_normal.png", meta: [2, 4] },
  owPlayerPal: { pal: "object_events/palettes/player.pal" },
  // Overworld: the player's running frames (named surf_run in the game) and the signpost frame
  owRedRun: { png: "object_events/pics/people/red_surf_run.png" },
  owGreenRun: { png: "object_events/pics/people/green_surf_run.png" },
  signpostFrame: { png: "text_window/signpost.png" },
  textWindowPal1: { pal: "text_window/stdpal_1.pal" },
} satisfies Record<string, GraphicFiles>;

export type GraphicId = keyof typeof BOOT_GRAPHICS | keyof typeof NEW_GAME_GRAPHICS;

/** The sounds `make audio` renders (src/game/firered/sounds.json). */
export const SOUNDS = ["mus_game_freak", "mus_intro_fight", "mus_title", "se_select", "cry_nidorino_doubles", "cry_charizard"] as const;
export const NEW_GAME_SOUNDS = [
  "mus_new_game_instruct",
  "mus_new_game_intro",
  "mus_new_game_exit",
  "mus_route24",
  "se_ball",
  "se_ball_open",
  "se_ball_trade",
  "se_warp_in",
  "se_win_open",
  "cry_nidoran_f",
  "se_wall_hit",
  "se_pc_on",
] as const;
export type SoundId = (typeof SOUNDS)[number] | (typeof NEW_GAME_SOUNDS)[number];

/** The game's strings `make text` encodes (src/game/firered/texts.json lists them). */
export type TextId = string;

/** The world's text IDs (sent by mic-core) as FireRed's strings. */
export const WORLD_TEXTS: Record<string, TextId> = {
  "pallet_town_players_house_2f.played_with_nes": "PalletTown_PlayersHouse_2F_Text_PlayedWithNES",
  "pallet_town_players_house_2f.press_lr_for_help": "PalletTown_PlayersHouse_2F_Text_PressLRForHelp",
  "common.player_booted_up_pc": "Text_PlayerBootedUpPC",
  "flavor.bookshelf": "Text_Bookshelf",
  "flavor.pokemart_shelf": "Text_PokeMartShelf",
  "flavor.food": "Text_Food",
  "flavor.blueprints": "Text_Blueprints",
  "flavor.burglary": "Text_Burglary",
  "flavor.computer": "Text_Computer",
  "flavor.television": "Text_PlayerFacingTVScreen",
  "flavor.cabinet": "Text_DishesPlatesNeatlyLinedUp",
  "flavor.kitchen": "Text_Kitchen",
  "flavor.dresser": "Text_Dresser",
  "flavor.painting": "Text_Painting",
  "flavor.power_plant_machine": "Text_PowerPlantMachine",
  "flavor.telephone": "Text_Telephone",
  "flavor.advertising_poster": "Text_AdvertisingPoster",
  "flavor.tasty_food": "Text_TastyFood",
  "flavor.trash_bin": "Text_TrashBin",
  "flavor.cup": "Text_Cup",
  "flavor.blinking_lights": "Text_BlinkingLights",
  "flavor.neatly_lined_up_tools": "Text_NeatlyLinedUpTools",
  "flavor.pokemart_sign": "Text_PokemartSign",
  "flavor.pokecenter_sign": "Text_PokecenterSign",
};

export interface Graphic {
  image: IndexedImage | null;
  /** 8×8 tiles, one index per pixel. */
  tiles: Uint8Array;
  palette: Uint16Array;
  map: Uint16Array | null;
}

/** Glyph widths per font sheet, read from the game's source (`make graphics`). */
export interface FontWidths {
  normal: number[];
  normalCopy1: number[];
  male: number[];
  small: number[];
}

async function loadGraphics(files: Record<string, GraphicFiles>): Promise<[GraphicId, Graphic][]> {
  return Promise.all(
    Object.entries(files).map(async ([id, f]) => {
      const [image, pal, map] = await Promise.all([
        f.png ? fetchPng(`${ROOT}/graphics/${f.png}`) : null,
        f.pal ? fetchPal(`${ROOT}/graphics/${f.pal}`) : null,
        f.bin ? fetchBin(`${ROOT}/graphics/${f.bin}`) : null,
      ]);
      if (image && f.bpp4) for (let i = 0; i < image.pixels.length; i++) image.pixels[i] &= 15;
      const graphic: Graphic = {
        image,
        tiles: image ? toTiles(image, f.meta) : new Uint8Array(0),
        palette: pal ?? image?.palette ?? new Uint16Array(16),
        map,
      };
      return [id as GraphicId, graphic] as [GraphicId, Graphic];
    }),
  );
}

const json = <T>(path: string): Promise<T> =>
  fetch(`${ROOT}/${path}`).then((r) => {
    if (!r.ok) throw new Error(`asset ${path}: ${r.status}`);
    return r.json() as Promise<T>;
  });

export class Assets {
  private newGame: Promise<void> | null = null;
  private strings: Record<string, number[]> = {};
  fontWidths!: FontWidths;

  private constructor(
    private readonly graphics: Map<GraphicId, Graphic>,
    readonly charmap: Charmap,
    readonly soundManifest: Record<string, SoundInfo>,
  ) {}

  static async load(): Promise<Assets> {
    const [entries, normal, charmap, manifest] = await Promise.all([
      loadGraphics(BOOT_GRAPHICS),
      json<number[]>("graphics/fonts/latin_normal_widths.json"),
      json<Charmap>("text/charmap.json"),
      json<Record<string, SoundInfo>>("audio/manifest.json"),
    ]);
    const assets = new Assets(new Map(entries), charmap, manifest);
    assets.fontWidths = { normal, normalCopy1: normal, male: normal, small: normal };
    return assets;
  }

  /** The New Game set (Oak's speech, naming screen): graphics, fonts and text; loaded once. */
  loadNewGame(): Promise<void> {
    this.newGame ??= Promise.all([
      loadGraphics(NEW_GAME_GRAPHICS),
      json<number[]>("graphics/fonts/latin_normal_copy_1_widths.json"),
      json<number[]>("graphics/fonts/latin_male_widths.json"),
      json<number[]>("graphics/fonts/latin_small_widths.json"),
      json<Record<string, number[]>>("text/strings.json"),
    ]).then(([entries, normalCopy1, male, small, strings]) => {
      for (const [id, g] of entries) this.graphics.set(id, g);
      this.fontWidths = { normal: this.fontWidths.normal, normalCopy1, male, small };
      this.strings = strings;
    });
    return this.newGame;
  }

  get(id: GraphicId): Graphic {
    return this.graphics.get(id)!;
  }

  /** One of the game's strings, encoded; ends with EOS. */
  text(id: TextId): Text {
    return this.strings[id] ?? [0xff];
  }

  static soundUrl(id: string, ext: string): string {
    return `${ROOT}/audio/${id}.${ext}`;
  }

  /** A map tileset's sheets, rendered by `make maps` (maps.md#outputs). */
  static tilesetArt(id: string): TilesetArt {
    return { below: `${ROOT}/tilesets/${id}.png`, above: `${ROOT}/tilesets/${id}.above.png` };
  }
}
