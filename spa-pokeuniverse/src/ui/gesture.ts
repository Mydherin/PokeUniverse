/** Calls back on a horizontal swipe (ui.md#mobile). Vertical scrolling is left alone. */
export function onSwipe(el: HTMLElement, handler: (direction: "left" | "right") => void): void {
  let startX = 0;
  let startY = 0;
  let tracking = false;
  // Let the browser scroll vertically while horizontal moves reach us.
  el.style.setProperty("touch-action", "pan-y");
  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    tracking = true;
    startX = e.clientX;
    startY = e.clientY;
  }, { passive: true });
  el.addEventListener("pointerup", (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) handler(dx < 0 ? "left" : "right");
  }, { passive: true });
  el.addEventListener("pointercancel", () => (tracking = false), { passive: true });
}
