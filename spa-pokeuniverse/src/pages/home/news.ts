import { Species } from "../../assets/sprites";
import { news } from "../../content/news";
import { sprite } from "../../ui/art";
import { h } from "../../ui/dom";

export function newsSection(): HTMLElement {
  return h(
    "div",
    { class: "mx-auto max-w-3xl" },
    h(
      "header",
      { class: "flex items-center gap-4" },
      sprite(Species.clefairy, "size-16 shrink-0 animate-float sm:size-20"),
      h("div", {}, h("h1", { class: "font-display text-4xl font-bold" }, "News"), h("p", { class: "mt-1 text-ink-muted" }, "What's new in PokeUniverse.")),
    ),
    h(
      "ol",
      { class: "mt-8 space-y-4" },
      ...news.map((n) =>
        h(
          "li",
          {},
          h(
            "article",
            { class: "panel p-5 sm:p-6" },
            h(
              "div",
              { class: "flex flex-wrap items-center gap-2 text-sm text-ink-muted" },
              h("span", { class: "chip text-volt-300" }, n.tag),
              h("time", { datetime: n.date }, new Date(`${n.date}T12:00:00`).toLocaleDateString("en", { dateStyle: "long" })),
            ),
            h("h2", { class: "mt-3 text-xl font-semibold" }, n.title),
            h("p", { class: "mt-2 text-ink-soft" }, n.body),
          ),
        ),
      ),
    ),
  );
}
