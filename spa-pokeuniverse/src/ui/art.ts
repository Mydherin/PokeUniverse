import { h, trusted } from "./dom";
import { frontSprite } from "../assets/sprites";

/** Twinkling pixel stars, randomly placed. Purely decorative. */
export function starfield(count = 70): HTMLElement {
  const field = h("div", { class: "pointer-events-none absolute inset-0 overflow-hidden", "aria-hidden": "true" });
  for (let i = 0; i < count; i++) {
    const size = Math.random() < 0.15 ? 3 : 2;
    const star = h("span", { class: "absolute bg-ink animate-twinkle" });
    star.style.setProperty("left", `${Math.random() * 100}%`);
    star.style.setProperty("top", `${Math.random() * 100}%`);
    star.style.setProperty("width", `${size}px`);
    star.style.setProperty("height", `${size}px`);
    star.style.setProperty("animation-delay", `${(Math.random() * 3).toFixed(2)}s`);
    star.style.setProperty("animation-duration", `${(2 + Math.random() * 3).toFixed(2)}s`);
    field.append(star);
  }
  return field;
}

/** Stepped pixel hills along the bottom of a scene. */
export function horizon(): Element {
  const layer = (heights: number[], step: number, fill: string, base: number) => {
    let d = `M0 ${base}`;
    heights.forEach((height, i) => {
      d += ` V${base - height} H${(i + 1) * step}`;
    });
    return `<path d="${d} V${base} Z" fill="${fill}"/>`;
  };
  const far = [40, 48, 56, 64, 72, 76, 72, 64, 60, 56, 60, 68, 80, 88, 92, 88, 80, 72, 64, 56, 52, 48, 52, 60, 68, 72, 68, 60, 52, 44, 40, 36];
  const near = [24, 28, 28, 32, 36, 36, 32, 28, 24, 24, 28, 32, 40, 44, 44, 40, 36, 32, 28, 28, 32, 36, 40, 40, 36, 32, 28, 24, 24, 20, 20, 24];
  return trusted(
    `<svg class="pointer-events-none absolute inset-x-0 bottom-0 h-28 w-full sm:h-36" viewBox="0 0 1280 120" preserveAspectRatio="none" shape-rendering="crispEdges" aria-hidden="true">
      ${layer(far, 40, "#17133b", 120)}
      ${layer(near, 40, "#0b0920", 120)}
    </svg>`,
  );
}

/** A Pokémon sprite, scaled with crisp pixels. Decorative unless given a label. */
export function sprite(species: number, className: string, label?: string): HTMLImageElement {
  const img = h("img", {
    src: frontSprite(species),
    width: 64,
    height: 64,
    alt: label ?? "",
    loading: "lazy",
    decoding: "async",
    draggable: "false",
    class: `sprite ${className}`,
  });
  if (!label) img.setAttribute("aria-hidden", "true");
  return img;
}

/** The PokeUniverse wordmark. */
export function wordmark(className = "text-2xl"): HTMLElement {
  return h(
    "span",
    { class: `font-display font-bold tracking-wide ${className}` },
    h("span", { class: "text-gradient" }, "Poke"),
    h("span", { class: "text-ink" }, "Universe"),
  );
}
