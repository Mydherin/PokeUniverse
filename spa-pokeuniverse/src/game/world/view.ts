// What a screen asks of the world renderer; art styles and renderers implement it
// (tech-stack.md#decoupled-presentation).

import type { ClientMap } from "@pokeuniverse/contracts/map/v1/map";

/** A tileset's art: frames of one tile each, 16 per row, frame n being tile index n. */
export interface TilesetArt {
  /** Drawn under the characters. */
  below: string;
  /** Drawn over them. */
  above: string;
}

/** A character's frames: same-size cells side by side in one image, transparent where empty. */
export interface CharacterSheet {
  /** Unique per sheet; a sheet added twice is reused. */
  key: string;
  image: HTMLCanvasElement;
  frameWidth: number;
  frameHeight: number;
  /** Pixels added to its feet in the drawing order: a field effect drawn over whoever stands on its cell. */
  ahead?: number;
}

/** A character drawn between the map's layers. */
export interface CharacterView {
  /** The world pixel of the frame's top-left corner. */
  setPosition(x: number, y: number): void;
  setFrame(frame: number, hFlip: boolean): void;
  /** Over the tiles that usually cover characters (or under them). */
  setOverTiles(over: boolean): void;
  /** Over the screen's fade too: left out of it, as a palette fade that skips the sprite's palette. */
  setOverFade(over: boolean): void;
  setVisible(visible: boolean): void;
  destroy(): void;
}

export interface WorldView {
  /** Loads the art and draws the map, replacing the one shown. */
  show(map: ClientMap, art: TilesetArt): Promise<void>;
  hide(): void;
  /** Adds a character to the map shown (removed with it). */
  addCharacter(sheet: CharacterSheet): CharacterView;
  /** Draws another tile at a cell of the map shown (a script's change, e.g. a PC's screen). */
  setTile(x: number, y: number, tile: number): void;
  /** The world pixel at the screen's top-left corner. */
  setCamera(x: number, y: number): void;
  /** Fades toward `color` (BGR555) by y/16, as a palette fade does. */
  setFade(y: number, color: number): void;
  /** The screen as drawn now, 240×160 in BGR555 (what a battle transition distorts). */
  snapshot(): Promise<Uint16Array>;
}
