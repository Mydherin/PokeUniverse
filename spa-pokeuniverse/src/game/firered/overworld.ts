// The overworld, entered from CONTINUE or the end of New Game: the map the server says the
// trainer is on, its music, and the fade in from black (FieldCB_WarpExitFadeFromBlack).
// The player, movement and the map's events come next (Phase 4).

import type { Location } from "@pokeuniverse/contracts/trainer/v1/trainer";
import { PALETTES_ALL } from "../gba/palette";
import { RGB_BLACK } from "../gba/video";
import { loadMap, TILE } from "../world/map";
import type { Flow } from "./flow";
import { Assets } from "./manifest";

/** The player's tile on screen: 7 tiles in, under the BG scrolled 40 pixels down (field_camera.c). */
const PLAYER_X = 7 * TILE;
const PLAYER_Y = 7 * TILE - 40;

export function startOverworld(flow: Flow): void {
  const { gba, world } = flow;
  // The screen stays black while the map loads; a map that can't load goes back to the title.
  gba.setMain(() => {});
  const location = flow.trainer?.location;
  void (location ? loadWorld(flow, location) : Promise.reject(new Error("no location"))).then(
    (music) => enterWorld(flow, music),
    () => {
      world.hide();
      flow.toTitle();
    },
  );
}

/** Draws the map (under the still black screen) and loads its music; gives the music. */
async function loadWorld(flow: Flow, location: Location): Promise<string> {
  const { world, gba } = flow;
  const map = await loadMap(location.map);
  world.setFade(16, RGB_BLACK);
  await Promise.all([world.show(map, Assets.tilesetArt(map.tileset)), map.music && gba.sound.load([map.music], Assets.soundUrl)]);
  world.setCamera(location.x * TILE - PLAYER_X, location.y * TILE - PLAYER_Y);
  return map.music;
}

function enterWorld(flow: Flow, music: string): void {
  const { gba, world } = flow;
  const { video, palettes } = gba;
  gba.setVBlank(null);
  gba.reset();
  video.transparentBackdrop = true;
  if (music) gba.sound.playBgm(music);
  palettes.beginFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
  gba.setMain(() => {
    flow.runFrame();
    world.setFade(palettes.fadeY, palettes.fadeColor);
  });
  gba.setVBlank(gba.standardVBlank);
}
