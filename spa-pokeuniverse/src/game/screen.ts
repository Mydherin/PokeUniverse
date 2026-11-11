// Where the 240×160 screen goes on the page, shared by every layer drawn on it.

import { HEIGHT, WIDTH } from "./gba/video";

/** As large as the box allows at 3:2, centered (ui.md#game-screen). */
export function fitScreen(width: number, height: number): { scale: number; left: number; top: number } {
  const scale = Math.max(0, Math.min(width / WIDTH, height / HEIGHT));
  return { scale, left: Math.round((width - WIDTH * scale) / 2), top: Math.round((height - HEIGHT * scale) / 2) };
}
