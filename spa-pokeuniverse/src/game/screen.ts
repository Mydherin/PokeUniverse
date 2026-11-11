// Where the 240×160 screen goes on the page (ui.md#game-screen). The game draws at exactly
// 240×160; the browser scales that one image with nearest neighbour, so every device pixel
// shows one game pixel and nothing can open between tiles or sprites at any scale.

import { HEIGHT, WIDTH } from "./gba/video";

/** As large as the box allows at 3:2, centered (to compare layouts; placeScreen draws it). */
export function fitScreen(width: number, height: number): { scale: number; left: number; top: number } {
  const scale = Math.max(0, Math.min(width / WIDTH, height / HEIGHT));
  return { scale, left: Math.round((width - WIDTH * scale) / 2), top: Math.round((height - HEIGHT * scale) / 2) };
}

/**
 * Sizes and places the game's canvas in its cell, for every layout: the largest 3:2 size in
 * whole device pixels, centered on a whole device pixel. Run on any change of the cell's
 * size or place, the window, the visual viewport or the pixel ratio.
 */
export function placeScreen(cell: HTMLElement, canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1;
  const box = cell.getBoundingClientRect();
  // 3u × 2u device pixels keeps 3:2 exact.
  const unit = Math.max(0, Math.floor(Math.min((box.width * dpr) / 3, (box.height * dpr) / 2)));
  const w = 3 * unit;
  const h = 2 * unit;
  const x = Math.round(box.left * dpr + (box.width * dpr - w) / 2);
  const y = Math.round(box.top * dpr + (box.height * dpr - h) / 2);
  const style = canvas.style;
  style.setProperty("--screen-w", `${w / dpr}px`);
  style.setProperty("--screen-h", `${h / dpr}px`);
  style.setProperty("--screen-x", `${x / dpr - box.left}px`);
  style.setProperty("--screen-y", `${y / dpr - box.top}px`);
}
