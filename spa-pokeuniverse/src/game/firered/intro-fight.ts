// Intro scenes 1-3: the grass close-up, the forest pan with Gengar and Nidorino, and
// their fight. Behavior, timings and numbers follow FireRed; the code is our own.

import { PALETTES_ALL } from "../gba/palette";
import { callbackDummy, type Sprite, type SpriteCallback, type SpriteTemplate } from "../gba/sprites";
import type { Task } from "../gba/tasks";
import { RAND_MULT, SIN } from "../gba/trig";
import { Layer, RGB_BLACK, RGB_WHITE } from "../gba/video";
import { initBg, loadBg, loadBgMap, loadBgTiles, resetBgPositions } from "./common";
import type { Flow } from "./flow";
import { exitToTitle, type Intro } from "./intro";

const ALL_BUT_BG0 = PALETTES_ALL & ~1;

// The fight needs the machine from its sprite callbacks; set when scene 1 loads.
let flow: Flow;

const sprites = () => flow.gba.sprites;

// Scene 1: grass close-up

export function startScene1(intro: Intro): void {
  intro.set(scene1);
  scene1(intro);
}

function scene1(intro: Intro): void {
  flow = intro.flow;
  const { gba, assets } = flow;
  const { video, palettes, tasks } = gba;
  const [grass, bg] = [video.bgs[0], video.bgs[1]];
  switch (intro.state) {
    case 0:
      palettes.load(assets.get("scene1Grass").palette, 1 * 16, 16);
      palettes.load(assets.get("scene1Bg").palette, 2 * 16, 16);
      palettes.blendPalettes((1 << 1) | (1 << 2), 16, RGB_WHITE);
      initBg(grass, 2, 0);
      initBg(bg, 2, 0);
      loadBg(bg, assets.get("scene1Bg"));
      bg.visible = true;
      grass.visible = video.bgs[2].visible = video.bgs[3].visible = false;
      loadFightSceneGraphics();
      intro.state++;
      break;
    case 1:
      loadBg(grass, assets.get("scene1Grass"));
      resetBgPositions(gba);
      bg.visible = true;
      intro.state++;
      break;
    case 2:
      grass.visible = true;
      tasks.create(animateGrass, 0);
      palettes.beginFade((1 << 1) | (1 << 2), -2, 16, 0, RGB_WHITE);
      intro.state++;
      break;
    case 3:
      if (!palettes.fadeActive) {
        flow.playBgm("mus_intro_fight");
        intro.timer = 0;
        intro.state++;
      }
      break;
    case 4:
      intro.tick();
      if (intro.timer === 20) {
        tasks.create(bgZoom, 0);
        tasks.find(animateGrass)!.data[GRASS_EXITING] = 1;
      }
      if (intro.timer >= 30) {
        palettes.blendPalettes(ALL_BUT_BG0, 16, RGB_WHITE);
        tasks.destroy(tasks.find(animateGrass));
        tasks.destroy(tasks.find(bgZoom));
        intro.set(scene2);
      }
      break;
  }
}

const GRASS_TIMER = 0;
const GRASS_FRAME = 1;
const GRASS_EXITING = 2;
const GRASS_SCROLL = 3;

/** The grass frames sit one above the other in the tilemap (128 px apart). */
function animateGrass(task: Task): void {
  const d = task.data;
  const grass = flow.gba.video.bgs[0];
  if (++d[GRASS_TIMER] > 5) {
    d[GRASS_TIMER] = 0;
    if (++d[GRASS_FRAME] >= 3) d[GRASS_FRAME] = 0;
    grass.y = d[GRASS_FRAME] << 15;
  }
  // Meant to scroll the grass away; the frame change above resets it, so it "stutters", as in the game.
  if (d[GRASS_EXITING]) {
    d[GRASS_SCROLL] += 0x120;
    grass.y -= d[GRASS_SCROLL];
  }
}

/** The forest silhouette "zooms" through frames stacked in its tilemap. */
function bgZoom(task: Task): void {
  const d = task.data;
  if (++d[0] > 3) {
    d[0] = 0;
    if (d[1] < 2) d[1]++;
    flow.gba.video.bgs[1].y = d[1] << 15;
  }
}

// Scene 2: forest pan, then a close-up of both

const SCENE2_GENGAR: SpriteTemplate = { sheet: "scene2Gengar", palette: "gengar", width: 64, height: 64, priority: 1 };
const SCENE2_NIDORINO: SpriteTemplate = { sheet: "scene2Nidorino", palette: "nidorino", width: 64, height: 64, priority: 1 };

function scene2(intro: Intro): void {
  const { gba, assets } = flow;
  const { video, palettes, tasks } = gba;
  const [plants, nidorino, gengar, bg] = video.bgs;
  switch (intro.state) {
    case 0:
      palettes.blendPalettes(ALL_BUT_BG0, 16, RGB_WHITE);
      initBg(bg, 2, 3);
      initBg(plants, 0, 0);
      initBg(gengar, 0, 2);
      initBg(nidorino, 0, 1);
      loadBg(bg, assets.get("scene2Bg"));
      bg.visible = true;
      intro.state++;
      break;
    case 1:
      palettes.load(assets.get("scene2Bg").palette, 1 * 16);
      palettes.load(assets.get("gengarPal").palette, 5 * 16, 16);
      palettes.load(assets.get("scene2NidorinoClose").palette, 6 * 16, 16);
      palettes.blendPalettes(ALL_BUT_BG0, 16, RGB_WHITE);
      loadBg(plants, assets.get("scene2Plants"));
      loadBg(nidorino, assets.get("scene2NidorinoClose"));
      loadBg(gengar, assets.get("scene2GengarClose"));
      resetBgPositions(gba);
      plants.visible = true;
      nidorino.visible = gengar.visible = false;
      gengar.y = 0x1ce00;
      nidorino.y = 0x2800;
      tasks.create(panForest, 0);
      intro.scene2Nidorino = sprites().create(SCENE2_NIDORINO, 168, 80, 11);
      intro.scene2Gengar = sprites().create(SCENE2_GENGAR, 72, 80, 12);
      palettes.blendPalettes(ALL_BUT_BG0, 16, RGB_WHITE);
      intro.state++;
      break;
    case 2:
      palettes.beginFade(ALL_BUT_BG0, -2, 16, 0, RGB_WHITE);
      intro.state++;
      break;
    case 3:
      if (!palettes.fadeActive) {
        intro.timer = 0;
        intro.state++;
      }
      break;
    case 4:
      intro.tick();
      if (intro.timer >= 60) {
        intro.timer = 0;
        tasks.destroy(tasks.find(panForest));
        sprites().destroy(intro.scene2Gengar);
        sprites().destroy(intro.scene2Nidorino);
        tasks.create(panMons, 0);
        // The close-up is the lower half of the background tilemap.
        bg.y = 0x10000;
        plants.visible = false;
        bg.visible = nidorino.visible = gengar.visible = true;
        intro.state++;
      }
      break;
    case 5:
      intro.timer = 0;
      intro.state++;
      break;
    case 6:
      intro.tick();
      if (intro.timer >= 60) {
        tasks.destroy(tasks.find(panMons));
        intro.set(scene3Entrance);
      }
      break;
  }
}

/** Trees pan right, plants pan left. */
function panForest(): void {
  const [plants, , , bg] = flow.gba.video.bgs;
  bg.x -= 0xe0;
  plants.x += 0x110;
}

/** Gengar pans up, Nidorino down. */
function panMons(): void {
  const [, nidorino, gengar] = flow.gba.video.bgs;
  gengar.y += 0x20;
  nidorino.y -= 0x24;
}

// Scene 3: the fight

const ANIM_NORMAL = 0;
const ANIM_CRY = 1;
const ANIM_CROUCH = 2;
const ANIM_HOP = 3;
const ANIM_ATTACK = 4;
const AFFINE_ZOOM = 1;

const MON_AFFINE_ANIMS: SpriteTemplate["affineAnims"] = [
  [{ xScale: 256, yScale: 256, duration: 0 }, "end"],
  [{ xScale: 256, yScale: 256, duration: 0 }, { xScale: 32, yScale: 32, duration: 8 }, "end"],
];

const SCENE3_NIDORINO: SpriteTemplate = {
  sheet: "scene3Nidorino",
  palette: "nidorino",
  width: 64,
  height: 64,
  priority: 1,
  affine: true,
  anims: [0, 64, 128, 192, 256].map((image) => [{ image, duration: 1 }, "end"]),
  affineAnims: MON_AFFINE_ANIMS,
};
const SCENE3_GENGAR: SpriteTemplate = {
  sheet: "scene3Gengar",
  palette: "gengar",
  width: 64,
  height: 64,
  priority: 1,
  affine: true,
  anims: [0, 64, 96, 160].map((image) => [{ image, duration: 0 }, "end"]),
  affineAnims: MON_AFFINE_ANIMS,
};
const GRASS: SpriteTemplate = {
  sheet: "scene3Grass",
  palette: "scene3Grass",
  width: 64,
  height: 32,
  priority: 0,
  anims: [[{ image: 0, duration: 0 }, "end"]],
};
const SWIPE: SpriteTemplate = {
  sheet: "scene3Swipe",
  palette: "scene3Swipe",
  width: 32,
  height: 64,
  priority: 1,
  anims: [
    [{ image: 0, duration: 8 }, { image: 32, duration: 4 }, "end"],
    [{ image: 64, duration: 8 }, { image: 72, duration: 4 }, "end"],
  ],
  callback: (s) => {
    s.invisible = !s.invisible;
    if (s.animEnded) sprites().destroy(s);
  },
};
const RECOIL_DUST: SpriteTemplate = {
  sheet: "scene3RecoilDust",
  palette: "scene3RecoilDust",
  width: 16,
  height: 16,
  priority: 1,
  anims: [[{ image: 0, duration: 10 }, { image: 4, duration: 10 }, { image: 8, duration: 10 }, { image: 12, duration: 8 }, "end"]],
  callback: recoilDustCallback,
};

function loadFightSceneGraphics(): void {
  const { gba, assets } = flow;
  const sheets = ["scene2Gengar", "scene2Nidorino", "scene3Nidorino", "scene3Grass", "scene3GengarStatic", "scene3Swipe", "scene3RecoilDust"] as const;
  for (const id of sheets) gba.sprites.loadSheet(id === "scene3GengarStatic" ? "scene3Gengar" : id, assets.get(id).tiles);
  gba.palettes.loadSpritePalette("gengar", assets.get("gengarPal").palette);
  gba.palettes.loadSpritePalette("nidorino", assets.get("nidorinoPal").palette);
  gba.palettes.loadSpritePalette("scene3Grass", assets.get("scene3Grass").palette);
  gba.palettes.loadSpritePalette("scene3Swipe", assets.get("scene3Swipe").palette);
  gba.palettes.loadSpritePalette("scene3RecoilDust", assets.get("scene3RecoilDust").palette);
}

function scene3Entrance(intro: Intro): void {
  const { gba, assets } = flow;
  const { video, palettes, tasks } = gba;
  const [gengar, bg] = video.bgs;
  switch (intro.state) {
    case 0:
      palettes.load(assets.get("scene3Bg").palette, 1 * 16);
      palettes.load(assets.get("gengarPal").palette, 5 * 16, 16);
      palettes.blendPalettes(ALL_BUT_BG0, 16, RGB_WHITE);
      initBg(bg, 0, 1);
      initBg(gengar, 2, 0);
      loadBg(bg, assets.get("scene3Bg"));
      bg.visible = true;
      gengar.visible = video.bgs[2].visible = video.bgs[3].visible = false;
      resetBgPositions(gba);
      intro.state++;
      // Gengar is hidden on the left half until it slides past the middle.
      video.win0On = true;
      video.winIn0 = (video.winIn0 | Layer.BG1 | Layer.OBJ) & ~Layer.BG0;
      Object.assign(video.win0, { left: 0, right: 120, top: 32, bottom: 128 });
      break;
    case 1:
      loadBgTiles(gengar, assets.get("scene3GengarAnim"));
      loadBgMap(gengar, assets.get("scene3GengarAnim"));
      gengar.x = 0x1800;
      gengar.y = 0x1f000;
      intro.state++;
      break;
    case 2:
      palettes.blendPalettes(ALL_BUT_BG0, 0, RGB_WHITE);
      gengar.visible = true;
      tasks.create(gengarBounce, 0);
      intro.scene3Nidorino = sprites().create(SCENE3_NIDORINO, 0, 0, 9);
      startNidorinoEntrance(intro.scene3Nidorino!, 0, 180, 52);
      tasks.create(gengarEnter, 0);
      tasks.create(bgScroll, 0);
      intro.timer = 0;
      intro.state++;
      break;
    case 3:
      intro.tick();
      if (intro.timer === 16) {
        const grass = sprites().create(GRASS, 296, 112, 7);
        if (grass) grass.callback = grassCallback;
      }
      if (intro.scene3Nidorino!.callback !== nidorinoEnter && !tasks.isActive(gengarEnter)) intro.set(scene3Fight);
      break;
  }
}

/** Trees pan right: fast while the two slide in, slowly afterwards. */
function bgScroll(task: Task): void {
  flow.gba.video.bgs[1].x -= task.data[0] ? 0x20 : 0x400;
}

const BOUNCE_PAUSED = 0;
const BOUNCE_TIMER = 1;
const BOUNCE_STATE = 2;

/** Gengar's idle bounce: two frames stacked in its tilemap, swapped every 30 frames. */
function gengarBounce(task: Task): void {
  const d = task.data;
  if (d[BOUNCE_PAUSED] || ++d[BOUNCE_TIMER] < 30) return;
  d[BOUNCE_TIMER] = 0;
  d[BOUNCE_STATE] ^= 1;
  flow.gba.video.bgs[0].y = (d[BOUNCE_STATE] << 15) + 0x1f000;
}

const setBounce = (paused: boolean) => (flow.gba.tasks.find(gengarBounce)!.data[BOUNCE_PAUSED] = paused ? 1 : 0);

/** Gengar scrolls in, slowing after 40 moves. */
function gengarEnter(task: Task): void {
  const d = task.data;
  const { video, tasks } = flow.gba;
  if (d[0] === 0) {
    d[1] = 0x400;
    d[0]++;
  }
  if (++d[2] >= 40 && d[1] > 16) d[1] -= 16;
  const gengar = video.bgs[0];
  gengar.x += d[1];
  if (gengar.x >= 0x8000) video.win0On = false;
  if (gengar.x >= 0xef00) {
    gengar.x = 0xef00;
    tasks.destroy(task);
  }
}

function grassCallback(s: Sprite): void {
  const d = s.data;
  if (d[0] === 0) {
    d[1] = s.x << 5;
    d[2] = 160;
    d[0]++;
  }
  if (d[0] === 1) {
    d[1] -= d[2];
    s.x = d[1] >> 5;
    if (s.x <= 52) {
      flow.gba.tasks.find(bgScroll)!.data[0] = 1;
      d[0]++;
    }
  } else {
    d[1] -= 32;
    s.x = d[1] >> 5;
    if (s.x <= -32) {
      s.invisible = true;
      d[0]++;
      sprites().destroy(s);
    }
  }
}

function startNidorinoEntrance(s: Sprite, xStart: number, xEnd: number, time: number): void {
  s.data[0] = xStart << 4;
  s.data[1] = Math.trunc(((xEnd - xStart) << 4) / time);
  s.data[2] = time;
  s.data[3] = xEnd;
  s.data[4] = 0;
  s.x = xStart;
  s.y = 100;
  s.callback = nidorinoEnter;
}

function nidorinoEnter(s: Sprite): void {
  const d = s.data;
  if (++d[4] >= 40 && d[1] > 1) d[1]--;
  d[0] += d[1];
  s.x = d[0] >> 4;
  if (s.x >= d[3]) {
    s.x = d[3];
    s.callback = callbackDummy;
  }
}

const nidorinoBusy = (intro: Intro) => intro.scene3Nidorino!.callback !== callbackDummy;

function scene3Fight(intro: Intro): void {
  const { video, palettes } = flow.gba;
  const nidorino = intro.scene3Nidorino!;
  switch (intro.state) {
    case 0:
      intro.timer = 0;
      intro.state++;
      break;
    case 1:
      intro.tick();
      if (intro.timer > 30) {
        startNidorinoCry(nidorino);
        intro.state++;
      }
      break;
    case 2:
      if (!nidorinoBusy(intro)) {
        intro.timer = 0;
        intro.state++;
      }
      break;
    case 3:
      intro.tick();
      if (intro.timer > 30) {
        setBounce(true);
        startGengarAttack(intro);
        intro.timer = 0;
        intro.state++;
      }
      break;
    case 4:
      if (intro.gengarAttackLanded) {
        startNidorinoRecoil(nidorino);
        intro.state++;
      }
      break;
    case 5:
      if (!nidorinoBusy(intro)) {
        setBounce(false);
        intro.timer = 0;
        intro.state++;
      }
      break;
    case 6:
      intro.tick();
      // Two short hops back before the attack.
      if (intro.timer > 16) {
        startNidorinoHop(nidorino, 8, 12, 5);
        intro.state++;
      }
      break;
    case 7:
      if (!nidorinoBusy(intro)) {
        startNidorinoHop(nidorino, 8, 12, 5);
        intro.state++;
      }
      break;
    case 8:
      if (!nidorinoBusy(intro)) {
        intro.timer = 0;
        intro.state++;
      }
      break;
    case 9:
      intro.tick();
      if (intro.timer > 20) {
        startNidorinoAttack(nidorino);
        intro.timer = 0;
        intro.state++;
      }
      break;
    case 10:
      if (!flow.gba.tasks.find(gengarBounce)!.data[BOUNCE_STATE]) {
        setBounce(true);
        createGengarSprites(intro);
        intro.state++;
      }
      break;
    case 11:
      // Gengar is now the 4 sprites, so it can zoom.
      video.bgs[0].visible = false;
      intro.timer = 0;
      intro.state++;
      break;
    case 12:
      intro.tick();
      if (intro.timer === 48) palettes.beginFade((1 << 1) | (1 << 2), 2, 0, 16, RGB_WHITE);
      if (intro.timer > 120) {
        nidorinoZoom(nidorino);
        intro.scene3Gengars.forEach((s, i) => s && gengarZoom(s, i));
        intro.state++;
        intro.timer = 0;
      }
      break;
    case 13:
      intro.tick();
      if (intro.timer > 8) {
        palettes.unfaded.fill(RGB_WHITE, 1 * 16, 3 * 16);
        palettes.beginFade(ALL_BUT_BG0, -2, 0, 16, RGB_BLACK);
        intro.state++;
      }
      break;
    case 14:
      if (!palettes.fadeActive) {
        intro.timer = 0;
        intro.state++;
      }
      break;
    case 15:
      intro.tick();
      if (intro.timer > 60) intro.set(exitToTitle);
      break;
  }
}

const GENGAR_ANCHORS: [number, number][] = [
  [63, 63],
  [0, 63],
  [63, 0],
  [0, 0],
];

/** Gengar as 4 sprites (64×64, 32×64, 64×64, 32×64) so it can zoom. */
function createGengarSprites(intro: Intro): void {
  intro.scene3Gengars = [0, 1, 2, 3].map((i) => {
    const s = sprites().create(SCENE3_GENGAR, (i & 1) * 48 + 49, (i >> 1) * 64 + 72, 8);
    if (!s) return null;
    s.startAnim(i);
    if (i & 1) s.setSize(32, 64);
    return s;
  });
}

function nidorinoZoom(s: Sprite): void {
  s.x += s.x2;
  s.y += s.y2;
  s.setMatrixAnchor(0, 42);
  s.callback = callbackDummy;
  s.startAffineAnim(AFFINE_ZOOM);
}

function gengarZoom(s: Sprite, i: number): void {
  s.startAffineAnim(AFFINE_ZOOM);
  s.callback = () => {};
  s.setMatrixAnchor(...GENGAR_ANCHORS[i]);
}

// Gengar's swipe: a task moving its bg along an arc.

const ATK_STATE = 0;
const ATK_TIMER = 1;
const ATK_SIN = 3;
const ATK_BASE_X = 4;
const ATK_FRAME = 7;
const ATK_MULT_Y = 8;
const ATK_MULT_X = 9;

function startGengarAttack(intro: Intro): void {
  intro.gengarAttackLanded = false;
  const task = flow.gba.tasks.create((t) => gengarAttack(t, intro), 4);
  task.data[ATK_SIN] = 64;
  task.data[ATK_BASE_X] = flow.gba.video.bgs[0].x;
}

function gengarAttack(task: Task, intro: Intro): void {
  const d = task.data;
  switch (d[ATK_STATE]) {
    case 0:
      d[ATK_FRAME] = 2; // Arm up
      d[ATK_TIMER] = 0;
      d[ATK_MULT_Y] = 6;
      d[ATK_MULT_X] = 32;
      d[ATK_STATE]++;
      break;
    case 1:
      // Backward arc
      d[ATK_SIN] -= 2;
      if (++d[ATK_TIMER] > 15) {
        d[ATK_TIMER] = 0;
        d[ATK_STATE]++;
      }
      break;
    case 2:
      if (++d[ATK_TIMER] === 14) intro.gengarAttackLanded = true;
      if (d[ATK_TIMER] > 15) {
        d[ATK_TIMER] = 0;
        d[ATK_STATE]++;
      }
      break;
    case 3:
      // Forward arc and the swipe
      d[ATK_SIN] += 8;
      if (++d[ATK_TIMER] === 4) {
        createSwipeSprites();
        d[ATK_MULT_Y] = 32;
        d[ATK_MULT_X] = 48;
        d[ATK_FRAME] = 3; // Arm down
      }
      if (d[ATK_TIMER] > 7) {
        d[ATK_TIMER] = 0;
        d[ATK_STATE]++;
      }
      break;
    case 4:
      // Back to where it started
      d[ATK_SIN] -= 8;
      if (++d[ATK_TIMER] > 3) {
        d[ATK_FRAME] = 0;
        d[ATK_SIN] = 64;
        d[ATK_TIMER] = 0;
        d[ATK_STATE]++;
      }
      break;
    case 5:
      flow.gba.tasks.destroy(task);
      return;
  }
  const xSub = -((SIN[d[ATK_SIN] + 64] * d[ATK_MULT_X]) >> 8);
  const ySub = d[ATK_MULT_Y] - ((SIN[d[ATK_SIN]] * d[ATK_MULT_Y]) >> 8);
  const gengar = flow.gba.video.bgs[0];
  gengar.y = (d[ATK_FRAME] << 15) + 0x1f000 - (ySub << 8);
  gengar.x = d[ATK_BASE_X] - (xSub << 8);
}

function createSwipeSprites(): void {
  sprites().create(SWIPE, 132, 78, 6);
  const bottom = sprites().create(SWIPE, 132, 118, 6);
  if (!bottom) return;
  bottom.setSize(32, 16);
  bottom.startAnim(1);
}

// Nidorino's moves: sprite callbacks that end by going back to the dummy callback.

function startNidorinoCry(s: Sprite): void {
  s.startAnim(ANIM_CROUCH);
  s.data[0] = s.data[1] = 0;
  s.y2 = 3;
  s.callback = nidorinoCry;
}

function nidorinoCry(s: Sprite): void {
  const d = s.data;
  switch (d[0]) {
    case 0:
      if (++d[1] > 8) {
        s.startAnim(ANIM_CRY);
        s.y2 = 0;
        d[0]++;
      }
      break;
    case 1:
      flow.play("cry_nidorino_doubles", "cry");
      d[1] = 0;
      d[0]++;
      break;
    case 2:
      // A small bounce while crying.
      if (++d[2] > 1) {
        d[2] = 0;
        s.y2 = s.y2 === 0 ? 1 : 0;
      }
      if (++d[1] > 48) {
        s.startAnim(ANIM_NORMAL);
        s.y2 = 0;
        s.callback = callbackDummy;
      }
      break;
  }
}

// Shared by the recoil and the attack, as in the game.
let jumpMult = 0;
let jumpDiv = 0;
let animDelayTime = 0;

function startNidorinoRecoil(s: Sprite): void {
  jumpMult = 3;
  jumpDiv = 5;
  animDelayTime = 0;
  s.startAnim(ANIM_CROUCH);
  const d = s.data;
  d[0] = d[1] = d[2] = d[3] = d[4] = 0;
  d[7] = 40;
  s.callback = nidorinoRecoil;
}

function nidorinoRecoil(s: Sprite): void {
  const d = s.data; // 0 state, 1 timer, 2 offset x, 3 sin, 4 land timer, 5 slowdown, 6 seed, 7 speed x
  switch (d[0]) {
    case 0:
      if (++d[1] > 4) {
        s.startAnim(ANIM_HOP);
        d[0]++;
      }
      break;
    case 1:
      // Thrown backwards through the air.
      d[2] += d[7];
      d[3] += 8;
      s.x2 = d[2] >> 4;
      s.y2 = -((SIN[d[3]] * jumpMult) >> jumpDiv);
      if (++d[5] > animDelayTime) {
        d[5] = 0;
        d[7]--;
      }
      if (++d[4] > 15) {
        s.startAnim(ANIM_CROUCH);
        d[1] = 0;
        // Fixed seed: the dust lands the same way every time.
        d[6] = 0x4757;
        d[7] = 28;
        d[0]++;
      }
      break;
    case 2:
      // Sliding on the ground, kicking up dust.
      d[2] += d[7];
      s.x2 = d[2] >> 4;
      if (++d[1] > 6) {
        createRecoilDust(s.x + s.x2, s.y + s.y2, d[6]);
        d[6] = Math.imul(d[6], RAND_MULT);
      }
      if (d[1] > 12) {
        s.startAnim(ANIM_NORMAL);
        d[1] = 0;
        d[0]++;
      }
      break;
    case 3:
      if (++d[1] > 16) startNidorinoHop(s, 16, -s.x2, 4);
      break;
  }
}

/** Two dust puffs at the same spot with different speeds; they blink in turn. */
function createRecoilDust(x: number, y: number, seed: number): void {
  for (let i = 0; i < 2; i++) {
    const s = sprites().create(RECOIL_DUST, x - 22, y + 24, 10);
    if (!s) continue;
    s.data[3] = (seed % 13) + 8;
    s.data[4] = seed % 3;
    s.data[7] = i;
    seed = (Math.imul(seed, RAND_MULT) << 16) >> 16;
  }
}

function recoilDustCallback(s: Sprite): void {
  const d = s.data; // 0 state, 1 x, 2 y, 3 speed x, 4 speed y, 7 blink timer
  if (d[0] === 0) {
    d[1] = s.x << 4;
    d[2] = s.y << 4;
    d[0]++;
  }
  d[1] -= d[3];
  d[2] += d[4];
  s.x = d[1] >> 4;
  s.y = d[2] >> 4;
  if (s.animEnded) sprites().destroy(s);
  if (++d[7] > 1) {
    d[7] = 0;
    s.invisible = !s.invisible;
  }
}

function startNidorinoHop(s: Sprite, time: number, targetX: number, heightShift: number): void {
  const d = s.data; // 0 state, 1 air time, 2 offset x, 3 speed x, 4 sin, 5 speed y, 6 timer, 7 height shift
  d[0] = 0;
  d[1] = time;
  d[2] = s.x2 << 4;
  d[3] = Math.trunc((targetX << 4) / time);
  d[4] = 0;
  d[5] = Math.trunc(0x800 / time);
  d[6] = 0;
  d[7] = heightShift;
  s.startAnim(ANIM_CROUCH);
  s.callback = nidorinoHop;
}

const nidorinoHop: SpriteCallback = (s) => {
  const d = s.data;
  switch (d[0]) {
    case 0:
      if (++d[6] > 4) {
        s.startAnim(ANIM_HOP);
        d[6] = 0;
        d[0]++;
      }
      break;
    case 1:
      if (--d[1]) {
        d[2] += d[3];
        d[4] += d[5];
        s.x2 = d[2] >> 4;
        s.y2 = -(SIN[d[4] >> 4] >> d[7]);
      } else {
        s.x2 = (d[2] & 0xffff) >> 4;
        s.y2 = 0;
        s.startAnim(ANIM_CROUCH);
        // The short hops before the attack end crouched.
        if (d[7] === 5) s.callback = callbackDummy;
        else {
          d[6] = 0;
          d[0]++;
        }
      }
      break;
    case 2:
      if (++d[6] > 4) {
        s.startAnim(ANIM_NORMAL);
        s.callback = callbackDummy;
      }
      break;
  }
};

function startNidorinoAttack(s: Sprite): void {
  const d = s.data; // 0 state, 1 timer, 2 shake timer, 7 speed
  d[0] = d[1] = d[2] = d[3] = d[4] = d[5] = 0;
  s.x += s.x2;
  s.x2 = 0;
  animDelayTime = 40;
  jumpMult = 3;
  jumpDiv = 4;
  d[7] = 36;
  s.startAnim(ANIM_CROUCH);
  s.callback = nidorinoAttack;
}

function nidorinoAttack(s: Sprite): void {
  const d = s.data;
  switch (d[0]) {
    case 0:
      // Shakes before jumping.
      if (++d[1] & 1) {
        if (++d[2] & 1) s.x2++;
        else s.x2--;
      }
      if (d[1] > 17) {
        d[1] = 0;
        d[0]++;
      }
      break;
    case 1:
      if (++d[1] >= animDelayTime) {
        s.startAnim(ANIM_ATTACK);
        d[1] = d[2] = 0;
        d[0]++;
      }
      break;
    case 2:
      // Jumps at Gengar, slowing down.
      d[1] += d[7];
      s.x2 = -(d[1] >> 4);
      s.y2 = -((SIN[d[1] >> 4] * jumpMult) >> jumpDiv);
      d[2]++;
      if (d[7] > 12) d[7]--;
      if (d[1] >> 4 > 63) s.callback = callbackDummy;
      break;
  }
}
