import { Species } from "../../assets/sprites";
import { sprite } from "../../ui/art";
import { h } from "../../ui/dom";

const credits: { name: string; detail: string; href?: string }[] = [
  { name: "Pokémon", detail: "© Nintendo, Creatures Inc. and GAME FREAK inc." },
  { name: "Pokémon FireRed decompilation", detail: "pret/pokefirered, used as a reference for game behavior", href: "https://github.com/pret/pokefirered" },
  { name: "Pokémon Showdown", detail: "Battle rules reference and engine", href: "https://github.com/smogon/pokemon-showdown" },
  { name: "Sprites", detail: "PokeAPI sprites collection", href: "https://github.com/PokeAPI/sprites" },
];

export function aboutSection(): HTMLElement {
  return h(
    "div",
    { class: "mx-auto max-w-3xl space-y-6" },
    h(
      "header",
      { class: "flex items-center gap-4" },
      sprite(Species.snorlax, "size-20 shrink-0 sm:size-24"),
      h("div", {}, h("h1", { class: "font-display text-4xl font-bold" }, "About"), h("p", { class: "mt-1 text-ink-muted" }, "A fan project, made with love.")),
    ),
    h(
      "section",
      { class: "panel space-y-3 p-5 text-ink-soft sm:p-6" },
      h("p", {}, "PokeUniverse is a browser-based Pokémon MMO: Gen 3-style graphics with every Pokémon and battle rule up to Gen 4, in a world shared with other trainers."),
      h("p", {}, "It starts in Kanto, inspired by FireRed, and will grow with new areas over time."),
      h(
        "p",
        { class: "rounded-xl border border-leaf-400/30 bg-leaf-400/10 px-4 py-3 text-ink" },
        "Non-commercial: no ads, no payments, no donations. Ever.",
      ),
    ),
    h(
      "section",
      { class: "panel p-5 sm:p-6", "aria-labelledby": "credits" },
      h("h2", { id: "credits", class: "font-display text-xl font-bold" }, "Credits"),
      h(
        "ul",
        { class: "mt-3 divide-y divide-white/5" },
        ...credits.map((c) =>
          h(
            "li",
            { class: "py-3" },
            c.href
              ? h("a", { href: c.href, target: "_blank", rel: "noopener noreferrer", class: "font-semibold text-aqua-300 underline-offset-4 hover:underline" }, c.name)
              : h("span", { class: "font-semibold" }, c.name),
            h("p", { class: "text-sm text-ink-muted" }, c.detail),
          ),
        ),
      ),
    ),
  );
}
