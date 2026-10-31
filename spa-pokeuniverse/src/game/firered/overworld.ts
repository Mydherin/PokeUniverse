// The overworld, entered from CONTINUE or the end of New Game: mic-core says where the trainer
// is (a snapshot), the map fades in from black with its music (FieldCB_WarpExitFadeFromBlack),
// and the player walks, predicted here and checked by the server step by step. The camera
// keeps the player at FireRed's spot on screen. A checks what the player faces; the server
// answers with a script (messages, sounds) during which the player can't move.

import type { ClientMap } from "@pokeuniverse/contracts/map/v1/map";
import { Direction } from "@pokeuniverse/contracts/map/v1/map";
import type { Correction, Script, ScriptStep, WorldSnapshot } from "@pokeuniverse/contracts/world/v1/world";
import { Button } from "../gba/input";
import { PALETTES_ALL } from "../gba/palette";
import { expandPlaceholders, PLACEHOLDER_PLAYER, type Text } from "../gba/text";
import { RGB_BLACK } from "../gba/video";
import { Avatar, type AvatarInput } from "../world/avatar";
import { loadMap, TILE } from "../world/map";
import { FieldMessage } from "./field-message";
import type { Flow } from "./flow";
import { Assets, WORLD_TEXTS } from "./manifest";
import { PlayerSprite } from "./player-sprite";

/** The player's cell on screen: 7 tiles in, under the BG scrolled 40 pixels down (field_camera.c). */
const PLAYER_X = 7 * TILE;
const PLAYER_Y = 7 * TILE - 40;

export function startOverworld(flow: Flow): void {
  const { gba, world, link } = flow;
  // The screen stays black until the server says where the trainer is and the map is loaded.
  gba.setMain(() => {});
  let overworld: Overworld | null = null;
  // While a map loads, the newest snapshot (a reconnect may send another one).
  let pending: WorldSnapshot | null = null;
  const enter = (snapshot: WorldSnapshot) => {
    pending = snapshot;
    overworld?.destroy();
    overworld = null;
    void Promise.all([flow.newGameReady(), loadWorld(flow, snapshot.map)]).then(
      ([, map]) => {
        const latest = pending!;
        pending = null;
        if (latest.map !== map.id) return enter(latest);
        overworld = new Overworld(flow, map, latest);
      },
      () => leave(),
    );
  };
  const leave = () => {
    link.leave();
    overworld?.destroy();
    world.hide();
    flow.toTitle();
  };
  link.enter({
    snapshot: (s) => {
      if (pending) pending = s;
      else if (overworld?.mapId === s.map) overworld.resume(s);
      else enter(s);
    },
    correction: (c) => overworld?.correct(c),
    script: (s) => overworld?.run(s),
    noTrainer: leave,
  });
}

/** Draws the map (under the still black screen) and loads its music. */
async function loadWorld(flow: Flow, id: string): Promise<ClientMap> {
  const { world, gba } = flow;
  const map = await loadMap(id);
  world.setFade(16, RGB_BLACK);
  await Promise.all([world.show(map, Assets.tilesetArt(map.tileset)), map.music && gba.sound.load([map.music], Assets.soundUrl)]);
  return map;
}

/** The held direction as FireRed reads it: up, then down, left, right. */
function heldDirection(held: number): Direction {
  if (held & Button.Up) return Direction.NORTH;
  if (held & Button.Down) return Direction.SOUTH;
  if (held & Button.Left) return Direction.WEST;
  if (held & Button.Right) return Direction.EAST;
  return Direction.UNSPECIFIED;
}

/** A script the server sent, step by step. */
interface Running {
  id: number;
  steps: ScriptStep[];
  index: number;
  /** The current message is printed: waiting for A or B. */
  waiting: boolean;
}

class Overworld {
  readonly mapId: string;
  private readonly avatar: Avatar;
  private readonly sprite: PlayerSprite;
  private readonly message: FieldMessage;
  private script: Running | null = null;
  private readonly playerName: Text;

  constructor(
    private readonly flow: Flow,
    map: ClientMap,
    snapshot: WorldSnapshot,
  ) {
    const { gba, world, link } = flow;
    const p = snapshot.player!;
    this.mapId = map.id;
    this.playerName = flow.encode(flow.trainer?.name ?? "");
    this.avatar = new Avatar(map, p.x, p.y, p.facing, snapshot.canRun, {
      move: (step, d, run, x, y) => link.move(step, d, run, x, y),
      turn: (d) => link.turn(d),
      interact: (walkInto) => link.interact(walkInto),
      bump: () => flow.play("se_wall_hit"),
    });
    this.sprite = new PlayerSprite(world, flow.assets, p.gender);

    gba.setVBlank(null);
    gba.reset();
    gba.video.transparentBackdrop = true;
    this.message = new FieldMessage(flow);
    this.draw();
    if (map.music) gba.sound.playBgm(map.music);
    gba.palettes.beginFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
    gba.setMain(() => {
      this.frame();
      flow.runFrame();
      world.setFade(gba.palettes.fadeY, gba.palettes.fadeColor);
    });
    gba.setVBlank(gba.standardVBlank);
  }

  /** Back in the world after a reconnect: where the server has the player, no script running. */
  resume(s: WorldSnapshot): void {
    const p = s.player!;
    this.avatar.snap(p.x, p.y, p.facing);
    this.avatar.waiting = false;
    this.endScript(false);
  }

  correct(c: Correction): void {
    this.avatar.snap(c.x, c.y, c.facing);
  }

  /** The answer to an interaction: nothing, or a script to show. */
  run(s: Script): void {
    this.avatar.waiting = false;
    if (s.steps.length) this.script = { id: s.id, steps: s.steps, index: 0, waiting: false };
  }

  destroy(): void {
    this.sprite.destroy();
    this.message.hide();
  }

  private frame(): void {
    const { input } = this.flow.gba;
    if (this.script) this.runScript();
    const controls: AvatarInput = {
      direction: heldDirection(input.held),
      run: input.isHeld(Button.B),
      check: input.isPressed(Button.A),
    };
    // Messages lock the player, and so does being offline: steps the server can't check aren't taken.
    this.avatar.update(controls, this.script !== null || !this.flow.link.inWorld || this.flow.gba.palettes.fadeActive);
    this.draw();
  }

  private draw(): void {
    this.sprite.update(this.avatar);
    this.flow.world.setCamera(this.avatar.pixelX - PLAYER_X, this.avatar.pixelY - PLAYER_Y);
  }

  /** One frame of the running script: sounds play at once; messages wait for A or B once printed. */
  private runScript(): void {
    const s = this.script!;
    for (;;) {
      const step = s.steps[s.index];
      if (!step) return this.endScript(true);
      if (step.action.case === "sound") {
        this.flow.gba.sound.play(step.action.value);
        s.index++;
        continue;
      }
      if (step.action.case !== "message") {
        s.index++;
        continue;
      }
      const msg = step.action.value;
      if (!s.waiting) {
        const text = this.flow.assets.text(WORLD_TEXTS[msg.text] ?? "");
        this.message.show(expandPlaceholders(text, { [PLACEHOLDER_PLAYER]: this.playerName }), msg.sign);
        s.waiting = true;
        return;
      }
      if (this.message.printing || !this.flow.gba.input.isPressed(Button.A | Button.B)) return;
      s.waiting = false;
      s.index++;
      // Pressed this frame: the player doesn't also act on it.
      this.flow.gba.input.pressed &= ~(Button.A | Button.B);
    }
  }

  private endScript(done: boolean): void {
    if (this.script && done) this.flow.link.scriptDone(this.script.id);
    this.script = null;
    this.message.hide();
  }
}
