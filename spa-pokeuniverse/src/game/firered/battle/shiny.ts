// The shiny sparkle (TryShinyAnimation, AnimTask_ShinySparkles): as a shiny Pokémon's healthbox
// slides in, after 60 frames two rounds of gold stars, one circling it and one crossing it, with SE_SHINY.

import type { Sprite } from "../../gba/sprites";
import type { Flow } from "../flow";
import { animTagArt } from "./anims";
import { cos, sin } from "./anims/behaviors/util";

const SHEETS = ["shinyStar", "shinyMini4", "shinyMini5"] as const;

/** The sparkle around the Pokémon standing at (x, y) (its spot, BATTLER_COORD_X / Y). */
export function* shinySparkle(flow: Flow, x: number, y: number): Generator<void, void, void> {
  const { gba, assets } = flow;
  const files = animTagArt("ANIM_TAG_GOLD_STARS");
  if (!files) return;
  let art: Awaited<ReturnType<typeof assets.animArt>> | null = null;
  let ready = false;
  assets.animArt(files).then(
    (g) => ((art = g), (ready = true)),
    () => (ready = true),
  );
  // Its 60-frame wait covers the art's loading.
  for (let i = 0; i < 60 || !ready; i++) yield;
  const g = art as Awaited<ReturnType<typeof assets.animArt>> | null;
  if (!g) return;
  // The 16×16 star is tiles 0-3, the small ones tiles 4 and 5.
  gba.sprites.loadSheet(SHEETS[0], g.tiles.subarray(0, 4 * 64));
  gba.sprites.loadSheet(SHEETS[1], g.tiles.subarray(4 * 64, 5 * 64));
  gba.sprites.loadSheet(SHEETS[2], g.tiles.subarray(5 * 64, 6 * 64));
  gba.palettes.loadSpritePalette("shinyStars", g.palette);

  // Both tasks: a star every 4 frames, five each; the first round circles, the second crosses.
  const stars: { sprite: Sprite; round: number; t: number }[] = [];
  for (let frame = 0, made = 0; made < 5 || stars.length > 0; frame++) {
    if (made < 5 && (frame & 3) === 0) {
      const sheet = SHEETS[made === 0 ? 0 : made < 4 ? 1 : 2];
      const size = made === 0 ? 16 : 8;
      for (const round of [0, 1]) {
        const sprite = gba.sprites.create({ sheet, palette: "shinyStars", width: size, height: size, priority: 1 }, x, y, 5);
        if (!sprite) continue;
        if (round === 1) {
          sprite.x2 = -32;
          sprite.y2 = 32;
          sprite.invisible = true;
          if (made === 0) flow.play("se_shiny");
        }
        stars.push({ sprite, round, t: 0 });
      }
      made++;
    }
    for (let i = stars.length - 1; i >= 0; i--) {
      const s = stars[i];
      let done: boolean;
      if (s.round === 0) {
        // SpriteCB_ShinySparkles_1
        s.sprite.x2 = sin(s.t, 24);
        s.sprite.y2 = cos(s.t, 24);
        s.t += 12;
        done = s.t > 0xff;
      } else if (s.t < 4) {
        // SpriteCB_ShinySparkles_2
        s.t++;
        done = false;
      } else {
        s.sprite.invisible = false;
        s.sprite.x2 += 5;
        s.sprite.y2 -= 5;
        done = s.sprite.x2 > 32;
      }
      if (done) {
        gba.sprites.destroy(s.sprite);
        stars.splice(i, 1);
      }
    }
    yield;
  }
  for (const sheet of SHEETS) gba.sprites.freeSheet(sheet);
  gba.palettes.freeSpritePalette("shinyStars");
}
