// Where the 240×160 screen goes on the page, shared by every layer drawn on it.

import { HEIGHT, WIDTH } from "./gba/video";

/** Integer scale when at least 2× fits, otherwise the largest fit; centered (ui.md#game-screen). */
export function fitScreen(width: number, height: number): { scale: number; left: number; top: number } {
  const fit = Math.min(width / WIDTH, height / HEIGHT);
  const scale = fit >= 2 ? Math.floor(fit) : fit;
  return { scale, left: Math.round((width - WIDTH * scale) / 2), top: Math.round((height - HEIGHT * scale) / 2) };
}
