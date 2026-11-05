// FireRed art style manifest (tech-stack.md#decoupled-presentation): the screens ask for
// graphic, sound and text IDs, this maps them to the files `make assets` puts in public/firered/.
// A graphic's palette is its .pal file when it has one, otherwise the PNG's own palette.
// The boot set (intro, title, menu) loads first; the New Game set loads in the background; the
// Pokédex set the first time the Pokédex opens, the party set (party menu and summary, with
// ability and nature names) the first time POKéMON opens, both with every species' text; the
// battle set (with the party set) when the first battle starts; each species' art and cry when
// it's first shown, its back picture and faint cry when it first battles.

import { fetchBin, fetchBytes, fetchPal, fetchPng, toTiles, type IndexedImage } from "../gba/assets";
import type { SoundInfo } from "../gba/sound";
import type { Charmap, Text } from "../gba/text";
import type { TilesetArt } from "../world/view";

const ROOT = "/firered";

interface GraphicFiles {
  png?: string;
  pal?: string;
  bin?: string;
  /** A table of bytes (INCBIN_U8), e.g. tile numbers. */
  bytes?: string;
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
  // Overworld NPCs (npc-sprite.ts): their frames and palettes
  owCooltrainerM: { png: "object_events/pics/people/cooltrainer_m.png" },
  owMom: { png: "object_events/pics/people/mom.png" },
  owNpcBluePal: { pal: "object_events/palettes/npc_blue.pal" },
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

/**
 * The party menu (party_menu.c) and the summary (pokemon_summary_screen.c): their backgrounds,
 * slot layouts, icons and bars, every ball's icon, and the Gen 4 move category icons
 * (pokeemerald-expansion's, phase-5 D10).
 */
const PARTY_GRAPHICS = {
  partyBg: { png: "party_menu/bg.png", bin: "party_menu/bg.bin", bpp4: true },
  // The item scene (pokemon_special_anim_scene.c), opened from the party menu.
  useItemBg: { png: "pokemon_special_anim/bg.png", pal: "pokemon_special_anim/bg.pal", bin: "pokemon_special_anim/bg.bin", bpp4: true },
  useItemDots: { png: "pokemon_special_anim/outward_spiral_dots.png", bpp4: true },
  useItemMachinePal: { pal: "pokemon_special_anim/bg_tm_hm.pal" },
  useItemStar: { png: "pokemon_special_anim/star.png", bpp4: true },
  // The slots' layouts: tile numbers in the background's tiles (sSlotTilemap_*)
  partySlotMain: { bytes: "party_menu/slot_main.bin" },
  partySlotMainNoHp: { bytes: "party_menu/slot_main_no_hp.bin" },
  partySlotWide: { bytes: "party_menu/slot_wide.bin" },
  partySlotWideNoHp: { bytes: "party_menu/slot_wide_no_hp.bin" },
  partySlotWideEmpty: { bytes: "party_menu/slot_wide_empty.bin" },
  partyCancelButton: { bin: "party_menu/cancel_button.bin" },
  partyHoldIcons: { png: "party_menu/hold_icons.png" },
  partyPokeball: { png: "party_menu/pokeball.png" },
  statusIcons: { png: "interface/status_icons.png" },
  // Summary: the pages' tilemaps over one set of tiles and colors
  summaryBg: { png: "summary_screen/bg.png", bpp4: true },
  summaryPageInfo: { bin: "summary_screen/page_info.bin" },
  summaryPageSkills: { bin: "summary_screen/page_skills.bin" },
  summaryPageMoves: { bin: "summary_screen/page_moves.bin" },
  summaryPageMovesInfo: { bin: "summary_screen/page_moves_info.bin" },
  summaryMovesPage: { bin: "summary_screen/moves_page.bin" },
  summaryMovesInfoPage: { bin: "summary_screen/moves_info_page.bin" },
  summaryTextHeaderPal: { pal: "summary_screen/text_header.pal" },
  summaryTextMovesPal: { pal: "summary_screen/text_moves.pal" },
  summaryHpBar: { png: "summary_screen/hp_bar.png" },
  summaryExpBar: { png: "summary_screen/exp_bar.png" },
  summaryHpBarYellowPal: { pal: "summary_screen/hp_bar_yellow.pal" },
  summaryHpBarRedPal: { pal: "summary_screen/hp_bar_red.pal" },
  summaryStatusIcons: { png: "summary_screen/status_ailment_icons.png" },
  summaryShinyStar: { png: "summary_screen/shiny_star.png" },
  summaryCursorLeft: { png: "summary_screen/move_selection_cursor_left.png" },
  summaryCursorRight: { png: "summary_screen/move_selection_cursor_right.png" },
  summaryCursorPal: { pal: "summary_screen/move_selection_cursor.pal" },
  ballMaster: { png: "interface/ball/master.png" },
  ballUltra: { png: "interface/ball/ultra.png" },
  ballGreat: { png: "interface/ball/great.png" },
  ballPoke: { png: "interface/ball/poke.png" },
  ballSafari: { png: "interface/ball/safari.png" },
  ballNet: { png: "interface/ball/net.png" },
  ballDive: { png: "interface/ball/dive.png" },
  ballNest: { png: "interface/ball/nest.png" },
  ballRepeat: { png: "interface/ball/repeat.png" },
  ballTimer: { png: "interface/ball/timer.png" },
  ballLuxury: { png: "interface/ball/luxury.png" },
  ballPremier: { png: "interface/ball/premier.png" },
  categoryIcons: { png: "expansion/interface/category_icons.png" },
} satisfies Record<string, GraphicFiles>;

/**
 * The battle screen (phase-5 M7): the textbox and its menus' tiles, the building terrain
 * (indoor maps), healthboxes, their bars and the party balls, the PP colors, and the trainer
 * pictures (the opponent's front, the player's back with its throwing frames).
 */
const BATTLE_GRAPHICS = {
  levelUpStripes: { png: "pokemon_special_anim/level_up.png", bpp4: true },
  evolutionSparkle: { png: "evolution_scene/sparkle.png", bpp4: true },
  evolutionBg: { png: "evolution_scene/bg.png", bin: "evolution_scene/bg.bin", bpp4: true },
  evolutionBg2: { bytes: "evolution_scene/bg2.bin" },
  evolutionPal: { pal: "evolution_scene/transition.pal" },
  battleTextbox: { png: "battle_interface/textbox.png", bin: "battle_interface/textbox.bin" },
  battleTextboxPal1: { pal: "battle_interface/textbox1.pal" },
  battleTextboxPal2: { pal: "battle_interface/textbox2.pal" },
  battleTerrainBuilding: { png: "battle_terrain/building/terrain.png", pal: "battle_terrain/building/terrain.pal", bin: "battle_terrain/building/terrain.bin" },
  healthboxPlayer: { png: "battle_interface/healthbox_singles_player.png" },
  healthboxOpponent: { png: "battle_interface/healthbox_singles_opponent.png" },
  healthboxDoublesPlayer: { png: "battle_interface/healthbox_doubles_player.png" },
  healthboxDoublesOpponent: { png: "battle_interface/healthbox_doubles_opponent.png" },
  healthboxPal: { pal: "battle_interface/healthbox.pal" },
  healthbarPal: { pal: "battle_interface/healthbar.pal" },
  healthboxElements: { png: "battle_interface/healthbox_elements.png", bpp4: true },
  partySummaryBar: { png: "battle_interface/party_summary_bar.png" },
  ppTextPal: { pal: "interface/text_pp.pal" },
  trainerCooltrainerM: { png: "trainers/front_pics/cool_trainer_m_front_pic.png", pal: "trainers/palettes/cool_trainer_m.pal" },
  backPicRed: { png: "trainers/back_pics/red_back_pic.png", pal: "trainers/palettes/red_back_pic.pal" },
  backPicLeaf: { png: "trainers/back_pics/leaf_back_pic.png", pal: "trainers/palettes/leaf_back_pic.pal" },
} satisfies Record<string, GraphicFiles>;

/** A trainer's front picture by BattleTrainer.pic. */
export const TRAINER_PICS: Record<string, keyof typeof BATTLE_GRAPHICS> = {
  cooltrainer_m: "trainerCooltrainerM",
};

/** Each ball's icon, by its item ID (ITEM_MASTER_BALL 1 to ITEM_PREMIER_BALL 12). */
export const BALL_ICONS = [
  "ballMaster",
  "ballUltra",
  "ballGreat",
  "ballPoke",
  "ballSafari",
  "ballNet",
  "ballDive",
  "ballNest",
  "ballRepeat",
  "ballTimer",
  "ballLuxury",
  "ballPremier",
] as const satisfies readonly (keyof typeof PARTY_GRAPHICS)[];

/** The box screen (pokemon_storage_system_*.c); the wallpapers load one by one (`wallpaper`). */
const STORAGE_GRAPHICS = {
  storageMenu: { png: "pokemon_storage/menu.png", bin: "pokemon_storage/menu.bin", bpp4: true },
  storageScrollingBg: { png: "pokemon_storage/scrolling_bg.png", bin: "pokemon_storage/scrolling_bg.bin", bpp4: true },
  storageInterfacePal: { pal: "pokemon_storage/interface.pal" },
  storageNoDisplayMonPal: { pal: "pokemon_storage/interface_no_display_mon.pal" },
  storagePartyPal: { pal: "pokemon_storage/party_menu.pal" },
  storageMiscPal: { pal: "pokemon_storage/misc2.pal" },
  storageItemFrame: { png: "pokemon_storage/item_info_frame.png" },
  storagePkmnData: { bin: "pokemon_storage/pkmn_data.bin" },
  storagePartyMenu: { bin: "pokemon_storage/party_menu.bin" },
  storageCloseBox: { bin: "pokemon_storage/close_box_button.bin" },
  storageSlotFilled: { bin: "pokemon_storage/party_slot_filled.bin" },
  storageSlotEmpty: { bin: "pokemon_storage/party_slot_empty.bin" },
  storageCursor: { png: "pokemon_storage/cursor.png", bpp4: true },
  storageCursorShadow: { png: "pokemon_storage/cursor_shadow.png", bpp4: true },
  storageArrow: { png: "pokemon_storage/box_scroll_arrow.png", bpp4: true },
  storageWaveform: { png: "pokemon_storage/waveform.png", bpp4: true },
};

/** FireRed's wallpapers, by number. */
const WALLPAPERS = ["forest", "city", "desert", "savanna", "crag", "volcano", "snow", "cave", "beach", "seafloor", "river", "sky", "stars", "pokecenter", "tiles", "simple"];

export type GraphicId =
  | keyof typeof STORAGE_GRAPHICS
  | keyof typeof BOOT_GRAPHICS
  | keyof typeof NEW_GAME_GRAPHICS
  | keyof typeof POKEDEX_GRAPHICS
  | keyof typeof PARTY_GRAPHICS
  | keyof typeof BATTLE_GRAPHICS;

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
  "se_use_item",
  // The item scene (use-item-scene.ts)
  "se_ball_tray_exit",
  "se_m_swagger2",
  "se_m_milk_drink",
  "se_m_reversal",
  "se_ball_tray_enter",
  "se_save",
  "se_exit",
] as const;
/** The battle's music and sounds, loaded with the battle set. */
export const BATTLE_SOUNDS = [
  "mus_vs_trainer",
  "mus_victory_trainer",
  "mus_level_up",
  "mus_poke_flute",
  "mus_evolution_intro",
  "mus_evolution",
  "mus_evolved",
  "se_exp",
  "se_exp_max",
  "se_m_spit_up",
  "se_switch",
  "se_rs_shop",
  "se_ball_bounce_1",
  "se_failure",
  "se_m_bubble_beam2",
  "se_shiny",
  "se_m_petal_dance",
  "se_ball_throw",
  "se_effective",
  "se_super_effective",
  "se_not_effective",
  "se_faint",
  "se_low_health",
  "se_m_stat_increase",
  "se_m_stat_decrease",
  // Move animations' sounds (battle/anims)
  "se_m_comet_punch",
  "se_m_swift",
  "se_m_mega_kick",
  "se_m_gust",
  "se_m_toxic",
  "se_m_sand_attack",
  "se_m_rock_throw",
  "se_m_absorb",
  "se_m_lick",
  "se_m_harden",
  "se_m_flame_wheel",
  "se_m_bubble",
  "se_m_razor_wind2",
  "se_m_thunderbolt",
  "se_m_psybeam",
  "se_m_icy_wind",
  "se_m_dragon_rage",
  "se_m_bite",
] as const;
/** Script music (ScriptStep.music), loaded when a script plays it. */
export const SCRIPT_MUSIC = ["mus_encounter_boy"] as const;
export type SoundId = (typeof SOUNDS)[number] | (typeof NEW_GAME_SOUNDS)[number] | (typeof BATTLE_SOUNDS)[number] | (typeof SCRIPT_MUSIC)[number];

/** The game's strings `make text` encodes (src/game/firered/texts.json lists them). */
export type TextId = string;

/** The world's text IDs (sent by mic-core) as FireRed's strings. */
export const WORLD_TEXTS: Record<string, TextId> = {
  "pallet_town_players_house_2f.played_with_nes": "PalletTown_PlayersHouse_2F_Text_PlayedWithNES",
  "pallet_town_players_house_2f.press_lr_for_help": "PalletTown_PlayersHouse_2F_Text_PressLRForHelp",
  "common.player_booted_up_pc": "Text_PlayerBootedUpPC",
  "pallet_town_players_house_1f.mom": "PalletTown_PlayersHouse_1F_Text_AllBoysLeaveOakLookingForYou",
  "pallet_town_players_house_1f.mom_girl": "PalletTown_PlayersHouse_1F_Text_AllGirlsLeaveOakLookingForYou",
  "pallet_town_players_house_1f.tv": "PalletTown_PlayersHouse_1F_Text_MovieOnTVFourBoysOnRailroad",
  "pallet_town_players_house_1f.tv_girl": "PalletTown_PlayersHouse_1F_Text_MovieOnTVGirlOnBrickRoad",
  // Test content (phase-5): the room's test trainer, removed in Phase 10.
  "test_trainer.question": "Route13_Text_SheilaIntro",
  "test_trainer.intro": "VictoryRoad_1F_Text_RolandoIntro",
  "test_trainer.defeat": "VictoryRoad_1F_Text_RolandoDefeat",
  "test_trainer.post_battle": "VictoryRoad_1F_Text_RolandoPostBattle",
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
  bytes: Uint8Array | null;
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
      const [image, pal, map, bytes] = await Promise.all([
        f.png ? fetchPng(`${ROOT}/graphics/${f.png}`) : null,
        f.pal ? fetchPal(`${ROOT}/graphics/${f.pal}`) : null,
        f.bin ? fetchBin(`${ROOT}/graphics/${f.bin}`) : null,
        f.bytes ? fetchBytes(`${ROOT}/graphics/${f.bytes}`) : null,
      ]);
      if (image && f.bpp4) for (let i = 0; i < image.pixels.length; i++) image.pixels[i] &= 15;
      const graphic: Graphic = {
        image,
        tiles: image ? toTiles(image, f.meta) : new Uint8Array(0),
        palette: pal ?? image?.palette ?? new Uint16Array(16),
        map,
        bytes,
      };
      return [id as GraphicId, graphic] as [GraphicId, Graphic];
    }),
  );
}

/**
 * A battle animation's art (battle/anims/art.json): a sheet (or the pictures it joins, their tiles
 * one after another), its palette (a .pal or a picture's) and, for a background, its tilemap.
 */
export interface AnimArtFiles {
  png: string | readonly string[];
  pal: string;
  bin?: string;
}

/** An item's name and description (`make text`, by item ID). */
interface ItemText {
  name: number[];
  description: number[];
}

/** A move's or an ability's name and description, encoded (`make text`, by catalog number). */
export interface NamedText {
  name: number[];
  description: number[];
}

/** An item's icon: 24×24 pixels and its palette. */
export type ItemIcon = Pick<Graphic, "image" | "palette">;

/**
 * A species as the FireRed art style shows it (`make pokemon`, by national number): name,
 * category and description encoded, the area page's size comparison (pokemonScale,
 * pokemonOffset, trainerScale, trainerOffset), and whether the summary shows its picture unmirrored.
 */
export interface SpeciesText {
  name: number[];
  category: number[];
  description: number[];
  scale: [number, number, number, number];
  noFlip?: boolean;
  /** Where the battle draws it: front pic y offset, back pic y offset, enemy elevation. */
  coords?: [number, number, number];
  /** Where the item scene draws it (sMonPosAttributes): machine x, machine y, y offset, item x, item y. */
  itemScene: [number, number, number, number, number];
}

/**
 * A species' pictures: the front pic (64×64, or two frames stacked) with its normal and shiny
 * colors, its icon (two 32×32 frames) and footprint (16×16).
 */
export interface PokemonArt {
  front: IndexedImage;
  frontPalette: Uint16Array;
  shinyPalette: Uint16Array;
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
  private moveTexts: Record<string, NamedText> = {};
  /** Each item's icon and palette files (`make graphics`, by item ID; "0" the question mark). */
  private itemIconFiles: Record<string, [string, string]> = {};
  private readonly itemIcons = new Map<number, Promise<ItemIcon>>();
  private pokedex: Promise<void> | null = null;
  private party: Promise<void> | null = null;
  private storage: Promise<void> | null = null;
  private readonly wallpapers = new Map<number, Promise<Graphic>>();
  private speciesSet: Promise<void> | null = null;
  private speciesTexts: Record<string, SpeciesText> = {};
  private abilityTexts: Record<string, NamedText> = {};
  private natureNames: Record<string, number[]> = {};
  private readonly pokemonArts = new Map<number, Promise<PokemonArt>>();
  private readonly backPics = new Map<number, Promise<IndexedImage>>();
  private battle: Promise<void> | null = null;
  private readonly loadedArts = new Map<number, PokemonArt>();
  private readonly animArts = new Map<string, Promise<Graphic>>();
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
      json<Record<string, NamedText>>("text/moves.json"),
      json<Record<string, [string, string]>>("graphics/items/icons.json"),
    ]).then(([entries, normalCopy1, male, small, strings, itemTexts, moveTexts, itemIconFiles]) => {
      for (const [id, g] of entries) this.graphics.set(id, g);
      this.fontWidths = { normal: this.fontWidths.normal, normalCopy1, male, small };
      this.strings = strings;
      this.itemTexts = itemTexts;
      this.moveTexts = moveTexts;
      this.itemIconFiles = itemIconFiles;
    });
    return this.newGame;
  }

  /** The Pokédex set: its graphics and every species' text; loaded once. */
  loadPokedex(): Promise<void> {
    this.pokedex ??= Promise.all([loadGraphics(POKEDEX_GRAPHICS), this.loadSpecies()]).then(([entries]) => {
      for (const [id, g] of entries) this.graphics.set(id, g);
    });
    this.pokedex.catch(() => (this.pokedex = null));
    return this.pokedex;
  }

  /** The party set: the party menu's and summary's graphics, every species' text, abilities and natures; loaded once. */
  loadParty(): Promise<void> {
    this.party ??= Promise.all([
      loadGraphics(PARTY_GRAPHICS),
      this.loadSpecies(),
      json<Record<string, NamedText>>("text/abilities.json"),
      json<Record<string, number[]>>("text/natures.json"),
    ]).then(([entries, , abilities, natures]) => {
      for (const [id, g] of entries) this.graphics.set(id, g);
      this.abilityTexts = abilities;
      this.natureNames = natures;
    });
    this.party.catch(() => (this.party = null));
    return this.party;
  }

  /** The box screen's set, with the party set (its SUMMARY); loaded once. */
  loadStorage(): Promise<void> {
    this.storage ??= Promise.all([loadGraphics(STORAGE_GRAPHICS), this.loadParty()]).then(([entries]) => {
      for (const [id, g] of entries) this.graphics.set(id, g);
    });
    this.storage.catch(() => (this.storage = null));
    return this.storage;
  }

  /** A wallpaper's tiles, tilemap and 32 colors, by FireRed's number; each loaded once, when a box first shows it. */
  wallpaper(n: number): Promise<Graphic> {
    let wallpaper = this.wallpapers.get(n);
    if (!wallpaper) {
      const dir = `pokemon_storage/wallpapers/${WALLPAPERS[n] ?? WALLPAPERS[0]}`;
      wallpaper = loadGraphics({ wallpaper: { png: `${dir}/tiles.png`, bin: `${dir}/tilemap.bin`, bpp4: true } }).then(([[, g]]) => g);
      wallpaper.catch(() => this.wallpapers.delete(n));
      this.wallpapers.set(n, wallpaper);
    }
    return wallpaper;
  }

  /** The battle set, with the party set (the party menu and summary open in battle); loaded once. */
  loadBattle(): Promise<void> {
    this.battle ??= Promise.all([loadGraphics(BATTLE_GRAPHICS), this.loadParty()]).then(([entries]) => {
      for (const [id, g] of entries) this.graphics.set(id, g);
    });
    this.battle.catch(() => (this.battle = null));
    return this.battle;
  }

  /** A species' back picture (64×64, the front's colors), loaded the first time it battles. */
  backPic(n: number): Promise<IndexedImage> {
    let pic = this.backPics.get(n);
    if (!pic) {
      pic = fetchPng(`${ROOT}/pokemon/${nnn(n)}/back.png`);
      pic.catch(() => this.backPics.delete(n));
      this.backPics.set(n, pic);
    }
    return pic;
  }

  /** Every species' text, shared by the Pokédex and party sets. */
  private loadSpecies(): Promise<void> {
    this.speciesSet ??= json<Record<string, SpeciesText>>("pokemon/species.json").then((texts) => {
      this.speciesTexts = texts;
    });
    this.speciesSet.catch(() => (this.speciesSet = null));
    return this.speciesSet;
  }

  /** The ability's name (catalog number, loadParty first), encoded; ends with EOS. */
  abilityName(ability: number): Text {
    return this.abilityTexts[ability]?.name ?? [0xff];
  }

  /** The ability's description, encoded; ends with EOS. */
  abilityDescription(ability: number): Text {
    return this.abilityTexts[ability]?.description ?? [0xff];
  }

  /** The nature's name (catalog number, loadParty first), encoded; ends with EOS. */
  natureName(nature: number): Text {
    return this.natureNames[nature] ?? [0xff];
  }

  /** A species' text (loadPokedex or loadParty first); EOS strings for an unknown one. */
  species(n: number): SpeciesText {
    return this.speciesTexts[n] ?? { name: [0xff], category: [0xff], description: [0xff], scale: [256, 0, 256, 0], itemScene: [32, 32, 32, 32, 32] };
  }

  /** A species' pictures, loaded the first time they're asked for. */
  pokemonArt(n: number): Promise<PokemonArt> {
    let art = this.pokemonArts.get(n);
    if (!art) {
      const dir = `${ROOT}/pokemon/${nnn(n)}`;
      art = Promise.all([
        fetchPng(`${dir}/front.png`),
        fetchPal(`${dir}/front.pal`),
        fetchPal(`${dir}/shiny.pal`),
        fetchPng(`${dir}/icon.png`),
        fetchPal(`${dir}/icon.pal`),
        fetchPng(`${dir}/footprint.png`),
      ]).then(
        ([front, frontPalette, shinyPalette, icon, iconPalette, footprint]) => {
          const a = { front, frontPalette, shinyPalette, icon, iconPalette, footprint };
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

  /** The move's name (move catalog number), encoded; ends with EOS. */
  moveName(move: number): Text {
    return this.moveTexts[move]?.name ?? [0xff];
  }

  /** The move's description, encoded; ends with EOS. */
  moveDescription(move: number): Text {
    return this.moveTexts[move]?.description ?? [0xff];
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

  /** A battle animation's sprite or background art, loaded the first time a script needs it. */
  animArt(files: AnimArtFiles): Promise<Graphic> {
    const pngs = typeof files.png === "string" ? [files.png] : files.png;
    const key = [...pngs, files.pal, files.bin].join("|");
    const cached = this.animArts.get(key);
    if (cached) return cached;
    const url = (f: string) => `${ROOT}/graphics/${f}`;
    const art = Promise.all([
      Promise.all(pngs.map((f) => fetchPng(url(f)))),
      files.pal.endsWith(".pal") ? fetchPal(url(files.pal)) : fetchPng(url(files.pal)).then((i) => i.palette ?? new Uint16Array(16)),
      files.bin ? fetchBin(url(files.bin)) : null,
    ]).then(([images, palette, map]): Graphic => {
      // Tiles as gbagfx builds them (pixel % 16), the joined pictures' one after another.
      const parts = images.map((image) => {
        for (let i = 0; i < image.pixels.length; i++) image.pixels[i] &= 15;
        return toTiles(image);
      });
      const tiles = new Uint8Array(parts.reduce((n, t) => n + t.length, 0));
      parts.reduce((at, t) => (tiles.set(t, at), at + t.length), 0);
      return { image: images.length === 1 ? images[0] : null, tiles, palette, map, bytes: null };
    });
    art.catch(() => this.animArts.delete(key));
    this.animArts.set(key, art);
    return art;
  }

  static soundUrl(id: string, ext: string): string {
    return `${ROOT}/audio/${id}.${ext}`;
  }

  /** The sound ID of a species' cry (by national number), loaded on demand from cryUrl. */
  static cryId(n: number): string {
    return `cry_${nnn(n)}`;
  }

  /** The sound ID of a species' faint cry (phase-5 D15), loaded on demand from cryUrl. */
  static faintCryId(n: number): string {
    return `cry_${nnn(n)}_faint`;
  }

  static cryUrl(id: string, ext: string): string {
    return `${ROOT}/audio/cries/${id.slice("cry_".length)}.${ext}`;
  }

  /** A map tileset's sheets, rendered by `make maps` (maps.md#outputs). */
  static tilesetArt(id: string): TilesetArt {
    return { below: `${ROOT}/tilesets/${id}.png`, above: `${ROOT}/tilesets/${id}.above.png` };
  }
}
