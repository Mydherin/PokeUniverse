// The overworld, entered from CONTINUE or the end of New Game: mic-core says where the trainer
// is (a snapshot), the map fades in from black with its music (FieldCB_WarpExitFadeFromBlack),
// and the player walks, predicted here and checked by the server step by step. The camera
// keeps the player at FireRed's spot on screen. A checks what the player faces; the server
// answers with a script (messages, sounds) during which the player can't move. START opens the
// START menu; its screens (the Trainer Card) fade out of the world and back into it, menu open.

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
import { StartMenu, StartMenuEntry } from "./start-menu";
import { startTrainerCard } from "./trainer-card";

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
    flow.playTime.stop();
    link.leave();
    overworld?.destroy();
    world.hide();
    flow.toTitle();
  };
  link.enter({
    snapshot: (s) => {
      flow.playTime.start(s.playTimeSeconds);
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

/** Back from a screen: the menu is drawn on black, then the world fades in, then it takes input. */
const enum Return {
  None,
  Drawing,
  FadingIn,
}

/** The START menu and what it is doing. */
interface Menu {
  menu: StartMenu;
  returning: Return;
  /** The screen to open once the world faded to black. */
  opening: (() => void) | null;
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
  private message!: FieldMessage;
  private script: Running | null = null;
  private menu: Menu | null = null;
  /** Off in a screen opened from the START menu: the world waits under it. */
  private away = false;
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
      openMenu: () => this.openMenu(false),
      bump: () => flow.play("se_wall_hit"),
    });
    this.sprite = new PlayerSprite(world, flow.assets, p.gender);
    if (map.music) gba.sound.playBgm(map.music);
    this.enter(false);
  }

  /**
   * The field's screen set up again: on arriving (fading in from black at once) or back from a
   * START menu screen (CB2_ReturnToFieldWithOpenMenu: the menu drawn first, on black).
   */
  private enter(withMenu: boolean): void {
    const { gba, world } = this.flow;
    gba.setVBlank(null);
    gba.reset();
    gba.video.transparentBackdrop = true;
    this.message = new FieldMessage(this.flow);
    this.draw();
    world.setFade(16, RGB_BLACK);
    if (withMenu) this.openMenu(true);
    else this.fadeIn();
    gba.setMain(() => {
      this.frame();
      if (this.away) return;
      this.flow.runFrame();
      if (this.menu?.returning !== Return.Drawing) world.setFade(gba.palettes.fadeY, gba.palettes.fadeColor);
    });
  }

  /** FadeInFromBlack. */
  private fadeIn(): void {
    const { gba } = this.flow;
    gba.palettes.beginFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
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
    // The button that closes the menu doesn't also act in the world.
    const menuOpen = this.menu !== null;
    if (this.menu) this.runMenu();
    if (this.away) return;
    const controls: AvatarInput = {
      direction: heldDirection(input.held),
      run: input.isHeld(Button.B),
      check: input.isPressed(Button.A),
      menu: input.isPressed(Button.Start),
    };
    // Messages and menus lock the player, and so does being offline: steps the server can't check aren't taken.
    const locked = this.script !== null || menuOpen || !this.flow.link.inWorld || this.flow.gba.palettes.fadeActive;
    this.avatar.update(controls, locked);
    this.draw();
  }

  /** ShowStartMenu (with SE_WIN_OPEN), or the menu drawn again under the black screen on returning. */
  private openMenu(returning: boolean): void {
    const { flow } = this;
    if (!returning) flow.play("se_win_open");
    const menu = new StartMenu(flow, flow.gba.video.bgs[0], this.playerName, { hasPokedex: false, hasPokemon: false, helpBar: true });
    this.menu = { menu, returning: returning ? Return.Drawing : Return.None, opening: null };
    menu.draw();
  }

  private runMenu(): void {
    const m = this.menu!;
    const { palettes } = this.flow.gba;
    if (m.opening) {
      if (!palettes.fadeActive) m.opening();
      return;
    }
    if (!m.menu.draw()) return;
    if (m.returning === Return.Drawing) {
      this.fadeIn();
      m.returning = Return.FadingIn;
      return;
    }
    // Task_WaitFadeAndCreateStartMenuTask: the menu takes input once the world is back.
    if (m.returning === Return.FadingIn) {
      if (!palettes.fadeActive) m.returning = Return.None;
      return;
    }
    const chosen = m.menu.update();
    if (chosen === "closed") this.menu = null;
    else if (chosen === StartMenuEntry.Exit) {
      m.menu.close();
      this.menu = null;
    } else if (chosen === StartMenuEntry.Player) this.openScreen((back) => startTrainerCard(this.flow, this.flow.trainer!, this.playerName, back));
    // BAG, SAVE and OPTION come next (phase 4); until then choosing them does nothing more.
  }

  /** StartMenu_FadeScreenIfLeavingOverworld, then the screen; back into the world with the menu open. */
  private openScreen(open: (back: () => void) => void): void {
    const { gba } = this.flow;
    gba.palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
    this.menu!.opening = () => {
      this.menu = null;
      this.away = true;
      open(() => {
        this.away = false;
        this.enter(true);
      });
    };
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
