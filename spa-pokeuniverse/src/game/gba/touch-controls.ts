// On-screen GBA buttons for touch screens (ui.md#mobile): a D-pad you can slide across,
// A, B and Start. Shown on coarse pointers only; the layout places them beside the game.

import { h } from "../../ui/dom";
import { Button, type Input } from "./input";

const DIRECTIONS = Button.Up | Button.Down | Button.Left | Button.Right;

/** Holds a button while a pointer is down on the element. */
function hold(el: HTMLElement, input: Input, button: number): void {
  const release = (e: PointerEvent) => {
    if (!el.hasPointerCapture(e.pointerId)) return;
    el.releasePointerCapture(e.pointerId);
    input.release(button);
    el.dataset.down = "";
  };
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    input.press(button);
    el.dataset.down = "true";
  });
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
}

/** The D-pad: the direction follows the finger from the pad's center (8 ways). */
function dpad(input: Input): HTMLElement {
  const arm = "absolute flex items-center justify-center bg-white/12 text-ink-soft";
  const el = h(
    "div",
    { class: "relative size-36 shrink-0 touch-none select-none", role: "group", "aria-label": "D-pad" },
    h("div", { class: `${arm} inset-x-12 top-0 h-13 rounded-t-xl`, "aria-hidden": "true" }, "▲"),
    h("div", { class: `${arm} inset-x-12 bottom-0 h-13 rounded-b-xl`, "aria-hidden": "true" }, "▼"),
    h("div", { class: `${arm} inset-y-12 left-0 w-13 rounded-l-xl`, "aria-hidden": "true" }, "◀"),
    h("div", { class: `${arm} inset-y-12 right-0 w-13 rounded-r-xl`, "aria-hidden": "true" }, "▶"),
    h("div", { class: "absolute inset-12 bg-white/12", "aria-hidden": "true" }),
  );
  let current = 0;
  const set = (buttons: number) => {
    input.release(current & ~buttons);
    input.press(buttons & ~current);
    current = buttons;
  };
  const follow = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    // A small dead zone in the middle; diagonals within 22.5° of 45°.
    if (Math.hypot(dx, dy) < r.width * 0.12) return set(0);
    const angle = Math.atan2(dy, dx) / (Math.PI / 4);
    const sector = (Math.round(angle) + 8) % 8;
    set([Button.Right, Button.Right | Button.Down, Button.Down, Button.Down | Button.Left, Button.Left, Button.Left | Button.Up, Button.Up, Button.Up | Button.Right][sector]);
  };
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    follow(e);
  });
  el.addEventListener("pointermove", (e) => el.hasPointerCapture(e.pointerId) && follow(e));
  const end = (e: PointerEvent) => {
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    set(current & ~DIRECTIONS);
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  return el;
}

function round(label: string, input: Input, button: number, extra: string): HTMLElement {
  const el = h(
    "button",
    {
      type: "button",
      class: `flex size-16 touch-none select-none items-center justify-center rounded-full bg-white/12 font-display text-2xl text-ink-soft data-[down=true]:bg-white/25 ${extra}`,
      "aria-label": `${label} button`,
      tabindex: "-1",
    },
    label,
  );
  hold(el, input, button);
  return el;
}

/** The left (D-pad) and right (A, B, Start) groups. */
export function touchControls(input: Input): { left: HTMLElement; right: HTMLElement } {
  const start = h(
    "button",
    {
      type: "button",
      class: "min-h-11 min-w-20 touch-none select-none rounded-full bg-white/12 px-4 text-xs font-semibold tracking-widest text-ink-soft data-[down=true]:bg-white/25",
      "aria-label": "Start button",
      tabindex: "-1",
    },
    "START",
  );
  hold(start, input, Button.Start);
  const left = h("div", { class: "flex flex-col items-center gap-4" }, dpad(input));
  const right = h(
    "div",
    { class: "flex flex-col items-center gap-5" },
    h("div", { class: "flex items-end gap-3" }, round("B", input, Button.B, "mt-8"), round("A", input, Button.A, "mb-8")),
    start,
  );
  return { left, right };
}
