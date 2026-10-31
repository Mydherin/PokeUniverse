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

export interface WorldView {
  /** Loads the art and draws the map, replacing the one shown. */
  show(map: ClientMap, art: TilesetArt): Promise<void>;
  hide(): void;
  /** The world pixel at the screen's top-left corner. */
  setCamera(x: number, y: number): void;
  /** Fades toward `color` (BGR555) by y/16, as a palette fade does. */
  setFade(y: number, color: number): void;
}
