// The copyright screen: fades in from white, holds, fades to black, then the intro.
// It can't be skipped. Behavior from FireRed (rev 0); the code is our own.

import { PALETTES_ALL } from "../gba/palette";
import { RGB_BLACK, RGB_WHITE } from "../gba/video";
import type { Flow } from "./flow";

/** Frames from the start of the fade in to the start of the fade out. */
const HOLD = 140;

export function startCopyright(flow: Flow): void {
  const { gba, assets } = flow;
  const { video, palettes } = gba;
  gba.setMain(() => {
    const state = gba.state;
    if (state === 0) {
      gba.setVBlank(null);
      gba.reset();
      video.palette.fill(0);
      video.palette[0] = RGB_WHITE;
      const copyright = assets.get("copyright");
      const bg = video.bgs[0];
      bg.tiles = copyright.tiles;
      bg.map.set(copyright.map!.subarray(0, bg.map.length));
      palettes.load(copyright.palette, 0, 16);
      palettes.beginFade(PALETTES_ALL, 0, 16, 0, RGB_WHITE);
      bg.visible = true;
      gba.setVBlank(gba.standardVBlank);
    }
    if (state < HOLD) {
      palettes.updateFade();
      gba.state++;
    } else if (state === HOLD) {
      palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
      gba.state++;
    } else if (state === HOLD + 1) {
      if (!palettes.updateFade()) gba.state++;
    } else {
      gba.setMain(() => {
        if (!palettes.updateFade()) flow.toIntro();
      });
    }
  });
}
