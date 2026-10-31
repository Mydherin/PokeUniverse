// FireRed art style manifest (tech-stack.md#decoupled-presentation): the screens ask for
// graphic, sound and text IDs, this maps them to the files `make assets` puts in public/firered/.
// A graphic's palette is its .pal file when it has one, otherwise the PNG's own palette.
// The boot set (intro, title, menu) loads first; the New Game set loads in the background; the
// Pokédex set (and every species' text) the first time the Pokédex opens; each species' art and cry
// when it's first shown.

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
  // The window frames the OPTION menu offers (TYPE1 to TYPE10), each with its own colors
  textWindowFrame1: { png: "text_window/type1.png" },
  textWindowFrame2: { png: "text_window/type2.png" },
  textWindowFrame3: { png: "text_window/type3.png" },
  textWindowFrame4: { png: "text_window/type4.png" },
  textWindowFrame5: { png: "text_window/type5.png" },
  textWindowFrame6: { png: "text_window/type6.png" },
  textWindowFrame7: { png: "text_window/type7.png" },
  textWindowFrame8: { png: "text_window/type8.png" },
  textWindowFrame9: { png: "text_window/type9.png" },
  textWindowFrame10: { png: "text_window/type10.png" },
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
  // START menu: the help bar under it
  helpMessageWindow: { png: "help_system/msg_window.png" },
  // Trainer Card: card and screen tiles, both sides' tilemaps, palettes and the player's picture
  tcTiles: { png: "trainer_card/tiles.png", bpp4: true },
  tcFront: { bin: "trainer_card/front.bin" },
  tcBack: { bin: "trainer_card/back.bin" },
  tcBg: { bin: "trainer_card/bg.bin" },
  tcBluePal: { pal: "trainer_card/blue.pal" },
  tcFemaleBgPal: { pal: "trainer_card/female_bg.pal" },
  picRedFront: { png: "trainers/front_pics/red_front_pic.png", pal: "trainers/palettes/red.pal" },
  picLeafFront: { png: "trainers/front_pics/leaf_front_pic.png", pal: "trainers/palettes/leaf.pal" },
  // Bag: background, list background, window colors, the bag (boy's or girl's), the red arrows and CANCEL's icon
  bagBg: { png: "item_menu/bg.png", bin: "item_menu/bg.bin", bpp4: true },
  // The bag opened from the PC (DEPOSIT ITEM): its own layout of the same tiles
  bagBgItemPcMap: { bin: "item_menu/bg_item_pc.bin" },
  bagBgFemalePal: { pal: "item_menu/bg_female.pal" },
  bagListMap: { bin: "item_menu/list.bin" },
  bagWindowPal: { pal: "item_menu/bag_window_pal.pal" },
  bagMale: { png: "interface/bag_male.png", meta: [8, 8] },
  bagFemale: { png: "interface/bag_female.png", meta: [8, 8] },
  bagPal: { pal: "interface/bag.pal" },
  redArrowOther: { png: "interface/red_arrow_other.png", meta: [2, 2] },
  redArrowPal: { pal: "interface/red_arrow.pal" },
  itemIconReturn: { png: "items/icons/return_to_field_arrow.png", pal: "items/icon_palettes/return_to_field_arrow.pal" },
  // Bag: the SELECT mark of the registered item, and the line showing where a moved item goes
  bagSelectButton: { png: "interface/select_button.png" },
  bagSwapLine: { png: "interface/bag_swap.png", meta: [2, 2] },
  // TM CASE: the case and the screen behind it (boy's or girl's colors), the discs tinted by type, the HM mark
  tmCase: { png: "tm_case/tm_case.png", bin: "tm_case/tm_case.bin" },
  tmCaseMenuMap: { bin: "tm_case/menu.bin" },
  tmCaseMalePal: { pal: "tm_case/menu_male.pal" },
  tmCaseFemalePal: { pal: "tm_case/menu_female.pal" },
  tmDisc: { png: "tm_case/disc.png" },
  tmDiscTypes1: { pal: "tm_case/disc_types_1.pal" },
  tmDiscTypes2: { pal: "tm_case/disc_types_2.pal" },
  tmCaseHm: { png: "tm_case/hm.png" },
  // A move's TYPE, POWER, ACCURACY and PP labels and its type's icon, with their colors
  menuInfo: { png: "interface/menu_info.png" },
  pokemonTypesPal: { pal: "interface/pokemon_types.pal" },
  // BERRY POUCH: the screen (boy's or girl's colors) and the pouch
  berryPouchBg: { png: "berry_pouch/background.png", bin: "berry_pouch/background.bin", bpp4: true },
  berryPouchFemalePal: { pal: "berry_pouch/background_female.pal" },
  berryPouch: { png: "berry_pouch/berry_pouch.png" },
  // The PC's WITHDRAW ITEM screen
  itemPcBg: { png: "item_pc/bg.png", bin: "item_pc/bg.bin", bpp4: true },
  // OPTION: its colors and the standard frame around its title
  optionMenuPal: { pal: "misc/option_menu.pal" },
  stdWindowFrame: { png: "text_window/std.png" },
  textWindowPal3: { pal: "text_window/stdpal_3.pal" },
} satisfies Record<string, GraphicFiles>;

/** The POKéDEX screen (pokedex_screen.c): its tiles and colors (Kanto's or the National's), icons and the area map. */
const POKEDEX_GRAPHICS = {
  dexKantoBg: { png: "pokedex/kanto_dex_bgtiles.png", pal: "pokedex/kanto_dex_bgpals.pal" },
  dexNationalBg: { png: "pokedex/national_dex_bgtiles.png", pal: "pokedex/national_dex_bgpals.pal" },
  // The table of contents' picture for the selected row
  dexIconGrassland: { png: "pokedex/cat_icon_grassland.png" },
  dexIconForest: { png: "pokedex/cat_icon_forest.png" },
  dexIconWatersEdge: { png: "pokedex/cat_icon_waters_edge.png" },
  dexIconSea: { png: "pokedex/cat_icon_sea.png" },
  dexIconCave: { png: "pokedex/cat_icon_cave.png" },
  dexIconMountain: { png: "pokedex/cat_icon_mountain.png" },
  dexIconRoughTerrain: { png: "pokedex/cat_icon_rough_terrain.png" },
  dexIconUrban: { png: "pokedex/cat_icon_urban.png" },
  dexIconRare: { png: "pokedex/cat_icon_rare.png" },
  dexIconNumerical: { png: "pokedex/cat_icon_numerical.png" },
  dexIconAtoZ: { png: "pokedex/cat_icon_abc.png" },
  dexIconType: { png: "pokedex/cat_icon_type.png" },
  dexIconLightest: { png: "pokedex/cat_icon_lightest.png" },
  dexIconSmallest: { png: "pokedex/cat_icon_smallest.png" },
  dexIconCancel: { png: "pokedex/cat_icon_cancel.png" },
  // Habitat pages: the round window behind each Pokémon, its name card and caught mark
  dexPageIconMap: { bin: "pokedex/page_icon_tilemap.bin" },
  dexMiniPage: { png: "pokedex/mini_page.png" },
  dexCaughtMarker: { png: "pokedex/caught_marker.png" },
  // The caught Poké Ball's colors in the lists (beside menu_info's type colors)
  dexCaughtBallPal: { pal: "interface/dex_caught_pokeball.pal" },
  // Area page: Kanto's map, the "AREA UNKNOWN" ellipse, the size comparison's silhouettes
  dexMapKanto: { png: "pokedex/map_kanto.png" },
  dexWideEllipse: { png: "pokedex/blit_wide_ellipse.png" },
  dexSilhouettePal: { pal: "pokedex/silhouette_sprite_pal.pal" },
  // The red outline around the selected Pokémon of a habitat page (ListMenuAddRedOutlineCursorObject)
  selectorOutline: { png: "interface/selector_outline.png" },
} satisfies Record<string, GraphicFiles>;

export type GraphicId = keyof typeof BOOT_GRAPHICS | keyof typeof NEW_GAME_GRAPHICS | keyof typeof POKEDEX_GRAPHICS;

/** The window frames, TYPE1 to TYPE10. */
export const FRAME_TYPES = 10;

/** The user's window frame (GetUserWindowGraphics): `frame` is 1 to 10. */
export function userFrame(frame: number): GraphicId {
  return `textWindowFrame${frame >= 1 && frame <= FRAME_TYPES ? frame : 1}` as GraphicId;
}

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
  "se_pc_login",
  "se_pc_off",
  "se_card_open",
  "se_card_flip",
  "se_card_flipping",
  "se_bag_cursor",
  "se_bag_pocket",
  "se_repel",
  "se_glass_flute",
  "se_ball_tray_enter",
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

/** An item's name and description (`make text`, by item ID). */
interface ItemText {
  name: number[];
  description: number[];
}

/**
 * The move a TM or HM teaches, as the TM CASE shows it (`make text`, by item ID): its name,
 * FireRed's type number (TYPE_NORMAL 0 to TYPE_DARK 17), power, accuracy and PP.
 */
export interface TmMove {
  name: number[];
  type: number;
  power: number;
  accuracy: number;
  pp: number;
}

/** An item's icon: 24×24 pixels and its palette. */
export type ItemIcon = Pick<Graphic, "image" | "palette">;

/**
 * A species as the FireRed art style shows it (`make pokemon`, by national number): name,
 * category and description encoded, and the area page's size comparison (pokemonScale,
 * pokemonOffset, trainerScale, trainerOffset).
 */
export interface SpeciesText {
  name: number[];
  category: number[];
  description: number[];
  scale: [number, number, number, number];
}

/** A species' pictures: the front pic (64×64, or two frames stacked), its icon (two 32×32 frames) and footprint (16×16). */
export interface PokemonArt {
  front: IndexedImage;
  frontPalette: Uint16Array;
  icon: IndexedImage;
  iconPalette: Uint16Array;
  footprint: IndexedImage;
}

const nnn = (n: number) => String(n).padStart(3, "0");

const json = <T>(path: string): Promise<T> =>
  fetch(`${ROOT}/${path}`).then((r) => {
    if (!r.ok) throw new Error(`asset ${path}: ${r.status}`);
    return r.json() as Promise<T>;
  });

export class Assets {
  private newGame: Promise<void> | null = null;
  private strings: Record<string, number[]> = {};
  private itemTexts: Record<string, ItemText> = {};
  private tmMoves: Record<string, TmMove> = {};
  /** Each item's icon and palette files (`make graphics`, by item ID; "0" the question mark). */
  private itemIconFiles: Record<string, [string, string]> = {};
  private readonly itemIcons = new Map<number, Promise<ItemIcon>>();
  private pokedex: Promise<void> | null = null;
  private speciesTexts: Record<string, SpeciesText> = {};
  private readonly pokemonArts = new Map<number, Promise<PokemonArt>>();
  private readonly loadedArts = new Map<number, PokemonArt>();
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
      json<Record<string, ItemText>>("text/items.json"),
      json<Record<string, TmMove>>("text/tm-moves.json"),
      json<Record<string, [string, string]>>("graphics/items/icons.json"),
    ]).then(([entries, normalCopy1, male, small, strings, itemTexts, tmMoves, itemIconFiles]) => {
      for (const [id, g] of entries) this.graphics.set(id, g);
      this.fontWidths = { normal: this.fontWidths.normal, normalCopy1, male, small };
      this.strings = strings;
      this.itemTexts = itemTexts;
      this.tmMoves = tmMoves;
      this.itemIconFiles = itemIconFiles;
    });
    return this.newGame;
  }

  /** The Pokédex set: its graphics and every species' text; loaded once. */
  loadPokedex(): Promise<void> {
    this.pokedex ??= Promise.all([loadGraphics(POKEDEX_GRAPHICS), json<Record<string, SpeciesText>>("pokemon/species.json")]).then(([entries, texts]) => {
      for (const [id, g] of entries) this.graphics.set(id, g);
      this.speciesTexts = texts;
    });
    this.pokedex.catch(() => (this.pokedex = null));
    return this.pokedex;
  }

  /** A species' text (loadPokedex first); EOS strings for an unknown one. */
  species(n: number): SpeciesText {
    return this.speciesTexts[n] ?? { name: [0xff], category: [0xff], description: [0xff], scale: [256, 0, 256, 0] };
  }

  /** A species' pictures, loaded the first time they're asked for. */
  pokemonArt(n: number): Promise<PokemonArt> {
    let art = this.pokemonArts.get(n);
    if (!art) {
      const dir = `${ROOT}/pokemon/${nnn(n)}`;
      art = Promise.all([fetchPng(`${dir}/front.png`), fetchPal(`${dir}/front.pal`), fetchPng(`${dir}/icon.png`), fetchPal(`${dir}/icon.pal`), fetchPng(`${dir}/footprint.png`)]).then(
        ([front, frontPalette, icon, iconPalette, footprint]) => {
          const a = { front, frontPalette, icon, iconPalette, footprint };
          this.loadedArts.set(n, a);
          return a;
        },
      );
      art.catch(() => this.pokemonArts.delete(n));
      this.pokemonArts.set(n, art);
    }
    return art;
  }

  /** The species' pictures once loaded (pokemonArt), else null. */
  loadedPokemonArt(n: number): PokemonArt | null {
    return this.loadedArts.get(n) ?? null;
  }

  get(id: GraphicId): Graphic {
    return this.graphics.get(id)!;
  }

  /** One of the game's strings, encoded; ends with EOS. */
  text(id: TextId): Text {
    return this.strings[id] ?? [0xff];
  }

  /** The item's name, encoded; ends with EOS. */
  itemName(item: number): Text {
    return this.itemTexts[item]?.name ?? [0xff];
  }

  /** The item's description, encoded; ends with EOS. */
  itemDescription(item: number): Text {
    return this.itemTexts[item]?.description ?? [0xff];
  }

  /** The move a TM or HM teaches; undefined for other items. */
  tmMove(item: number): TmMove | undefined {
    return this.tmMoves[item];
  }

  /** The item's icon (the question mark when it has none), loaded the first time it's asked for. */
  itemIcon(item: number): Promise<ItemIcon> {
    let icon = this.itemIcons.get(item);
    if (!icon) {
      const [png, pal] = this.itemIconFiles[item] ?? this.itemIconFiles[0];
      icon = Promise.all([fetchPng(`${ROOT}/graphics/${png}`), fetchPal(`${ROOT}/graphics/${pal}`)]).then(([image, palette]) => ({ image, palette }));
      icon.catch(() => this.itemIcons.delete(item));
      this.itemIcons.set(item, icon);
    }
    return icon;
  }

  static soundUrl(id: string, ext: string): string {
    return `${ROOT}/audio/${id}.${ext}`;
  }

  /** The sound ID of a species' cry (by national number), loaded on demand from cryUrl. */
  static cryId(n: number): string {
    return `cry_${nnn(n)}`;
  }

  static cryUrl(id: string, ext: string): string {
    return `${ROOT}/audio/cries/${id.slice("cry_".length)}.${ext}`;
  }

  /** A map tileset's sheets, rendered by `make maps` (maps.md#outputs). */
  static tilesetArt(id: string): TilesetArt {
    return { below: `${ROOT}/tilesets/${id}.png`, above: `${ROOT}/tilesets/${id}.above.png` };
  }
}
