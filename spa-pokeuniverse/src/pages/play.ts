import type { View } from "../app/router";
import { Connection, type ConnectionStatus } from "../realtime/connection";
import { h } from "../ui/dom";
import { icon } from "../ui/icons";

/** The game screen (FireRed's intro, title and menu) with an authenticated WebSocket connection. */
export function playPage(): View {
  const stage = h("div", { class: "absolute inset-0 touch-none select-none", "aria-label": "Game", role: "application" });
  const dot = h("span", { class: "size-2.5 rounded-full bg-volt-400" });
  const label = h("span", {}, "Connecting…");
  const status = h("p", { class: "chip min-h-11 bg-night-900/80 px-4 text-sm backdrop-blur", role: "status", "aria-live": "polite" }, dot, label);

  const fullscreen = document.fullscreenEnabled
    ? h(
        "button",
        {
          type: "button",
          class: "btn btn-ghost min-w-11 bg-night-900/80 px-3 backdrop-blur",
          "aria-label": "Toggle fullscreen",
          on: { click: () => void (document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen()) },
        },
        icon("fullscreen"),
      )
    : null;

  const el = h(
    "main",
    { class: "fixed inset-0 overflow-hidden bg-night-900" },
    stage,
    h(
      "div",
      { class: "safe-x safe-top pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3" },
      h("a", { href: "/", "data-link": true, class: "btn btn-ghost pointer-events-auto bg-night-900/80 backdrop-blur", "aria-label": "Back to home" }, icon("back"), h("span", { class: "hidden sm:inline" }, "Home")),
      h("div", { class: "pointer-events-auto flex items-center gap-2" }, status, fullscreen),
    ),
  );

  const show = (s: ConnectionStatus) => {
    const [color, text] = {
      connecting: ["bg-volt-400 animate-twinkle", "Connecting…"],
      online: ["bg-leaf-400", s.state === "online" && s.latencyMs !== undefined ? `Online · ${s.latencyMs} ms` : "Online"],
      offline: ["bg-berry-400", "Reconnecting…"],
      replaced: ["bg-berry-400", "Playing somewhere else"],
      "signed-out": ["bg-berry-400", "Signed out"],
    }[s.state];
    dot.className = `size-2.5 rounded-full ${color}`;
    label.textContent = text;
  };

  let stopGame: (() => void) | undefined;
  let destroyed = false;

  // Another copy of the game took the trainer (CONTINUE or New Game there): this game stops
  // for good, and the only way on is back home, where PLAY starts it again.
  const replaced = h(
    "div",
    { class: "absolute inset-0 z-20 flex items-center justify-center bg-night-900/85 p-6 backdrop-blur", role: "alertdialog", "aria-modal": "true", "aria-labelledby": "replaced-title", hidden: true },
    h(
      "div",
      { class: "panel max-w-sm space-y-4 p-6 text-center" },
      h("h2", { id: "replaced-title", class: "font-display text-xl" }, "Playing somewhere else"),
      h("p", { class: "text-ink-soft" }, "Your trainer is now being played in another window or device, so the game stopped here."),
      h("a", { href: "/", "data-link": true, class: "btn btn-play min-h-12 px-6 text-xl" }, "Back to home"),
    ),
  );
  el.append(replaced);
  const stop = () => {
    destroyed = true;
    stopGame?.();
    stopGame = undefined;
    replaced.hidden = false;
    replaced.querySelector<HTMLAnchorElement>("a")?.focus();
  };

  const connection = new Connection(show, stop);
  connection.connect();

  // Phaser is loaded only when the player opens the game. It starts once the stage is
  // on screen with a real size (screen transitions attach it later).
  const hasSize = new Promise<void>((resolve) => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(stage);
  });
  void Promise.all([import("../game/game"), hasSize]).then(([{ startGame }]) => {
    if (!destroyed) stopGame = startGame(stage, connection);
  });

  return {
    el,
    destroy: () => {
      destroyed = true;
      connection.close();
      stopGame?.();
    },
  };
}
