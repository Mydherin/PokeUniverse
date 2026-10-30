import { getSession } from "../../auth/session";
import { Species } from "../../assets/sprites";
import { news, roadmap, type Milestone } from "../../content/news";
import { sprite } from "../../ui/art";
import { h } from "../../ui/dom";
import { icon } from "../../ui/icons";
import { avatar, firstName, memberSince, trainerId } from "./avatar";

const starters = [Species.bulbasaur, Species.charmander, Species.squirtle];

export function overviewSection(): HTMLElement {
  const account = getSession()!.account;

  const hero = h(
    "section",
    { class: "panel relative overflow-hidden p-6 sm:p-10", "aria-labelledby": "welcome" },
    h("div", { class: "pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-volt-400/10 blur-3xl", "aria-hidden": "true" }),
    h(
      "div",
      { class: "relative flex flex-col items-center gap-8 text-center md:flex-row md:justify-between md:text-left" },
      h(
        "div",
        { class: "min-w-0 max-w-xl" },
        h("p", { class: "chip" }, h("span", { class: "size-2 animate-twinkle rounded-full bg-leaf-400" }), "Kanto · Early access"),
        h(
          "h1",
          { id: "welcome", class: "mt-4 font-display text-4xl font-bold leading-tight break-words sm:text-5xl" },
          "Welcome back, ",
          h("span", { class: "text-gradient" }, firstName(account)),
        ),
        h("p", { class: "mt-3 text-lg text-ink-soft" }, "Your adventure through Kanto is being built. Step in and see the world take shape."),
        h(
          "div",
          { class: "mt-8 flex flex-col items-center gap-4 sm:flex-row md:items-center" },
          h("a", { href: "/play", "data-link": true, class: "btn btn-play pixel-cut w-full sm:w-auto" }, icon("play", "size-6"), "PLAY"),
          h("span", { class: "text-sm text-ink-muted" }, "Desktop: keyboard · Mobile: touch controls"),
        ),
      ),
      h(
        "div",
        { class: "relative flex shrink-0 items-end gap-1 sm:gap-3", "aria-hidden": "true" },
        ...starters.map((s, i) => {
          const img = sprite(s, `size-24 animate-float sm:size-32 ${i === 1 ? "mb-6" : ""}`);
          img.loading = "eager";
          img.style.setProperty("animation-delay", `${i * 0.4}s`);
          return img;
        }),
        h("span", { class: "absolute inset-x-2 -bottom-2 h-4 rounded-[50%] bg-black/40 blur-md" }),
      ),
    ),
  );

  const trainerCard = h(
    "a",
    { href: "/trainer", "data-link": true, class: "panel group flex items-center gap-4 p-5 transition-colors hover:bg-night-700/60" },
    avatar(account, "size-14"),
    h(
      "div",
      { class: "min-w-0 flex-1" },
      h("p", { class: "text-xs font-semibold tracking-widest text-ink-muted uppercase" }, "Trainer card"),
      h("p", { class: "truncate text-lg font-semibold" }, account.displayName),
      h("p", { class: "text-sm text-ink-muted" }, `${trainerId(account)} · Since ${memberSince(account)}`),
    ),
    icon("arrow", "size-5 shrink-0 text-ink-muted transition-transform group-hover:translate-x-1"),
  );

  const latest = h(
    "section",
    { class: "panel p-5", "aria-labelledby": "latest" },
    h(
      "div",
      { class: "flex items-center justify-between gap-2" },
      h("h2", { id: "latest", class: "font-display text-xl font-bold" }, "Latest news"),
      h("a", { href: "/news", "data-link": true, class: "btn min-h-11 px-3 text-sm text-aqua-300 hover:text-aqua-400" }, "See all"),
    ),
    h(
      "ul",
      { class: "mt-2 divide-y divide-white/5" },
      ...news.slice(0, 2).map((n) =>
        h("li", { class: "py-3" }, h("p", { class: "font-semibold" }, n.title), h("p", { class: "mt-1 line-clamp-2 text-sm text-ink-muted" }, n.body)),
      ),
    ),
  );

  const road = h(
    "section",
    { class: "panel p-5 md:row-span-2", "aria-labelledby": "road" },
    h("h2", { id: "road", class: "font-display text-xl font-bold" }, "Road to Kanto"),
    h("p", { class: "mt-1 text-sm text-ink-muted" }, "What we're building, in order."),
    h("ol", { class: "mt-5 space-y-4" }, ...roadmap.map(milestone)),
  );

  return h(
    "div",
    { class: "space-y-6" },
    hero,
    h("div", { class: "grid gap-6 md:grid-cols-2" }, h("div", { class: "space-y-6" }, trainerCard, latest), road),
  );
}

function milestone(m: Milestone): HTMLElement {
  const marker = {
    done: h("span", { class: "grid size-7 place-items-center rounded-full bg-leaf-400 text-night-950" }, icon("check", "size-4")),
    now: h("span", { class: "grid size-7 place-items-center rounded-full bg-volt-400/20 ring-2 ring-volt-400" }, h("span", { class: "size-2.5 animate-twinkle rounded-full bg-volt-300" })),
    next: h("span", { class: "grid size-7 place-items-center rounded-full ring-2 ring-night-500" }),
  }[m.state];
  const label = { done: "Done", now: "In progress", next: "Up next" }[m.state];
  return h(
    "li",
    { class: "flex items-start gap-3" },
    marker,
    h(
      "div",
      { class: "min-w-0" },
      h("p", { class: `font-semibold ${m.state === "next" ? "text-ink-soft" : ""}` }, m.title, h("span", { class: "sr-only" }, ` (${label})`)),
      h("p", { class: "text-sm text-ink-muted" }, m.detail),
    ),
  );
}
