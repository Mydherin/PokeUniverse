// Signed-in layout: header, section navigation (top on desktop, bottom tabs on mobile) and content.

import type { View } from "../../app/router";
import type { Account } from "@pokeuniverse/contracts/auth/v1/auth";
import { getSession } from "../../auth/session";
import { h } from "../../ui/dom";
import { starfield, wordmark } from "../../ui/art";
import { onSwipe } from "../../ui/gesture";
import { icon, type IconName } from "../../ui/icons";
import { avatar } from "./avatar";
import { aboutSection } from "./about";
import { adminSection } from "./admin";
import { newsSection } from "./news";
import { overviewSection } from "./overview";
import { trainerSection } from "./trainer";

/** `role`: only accounts with it see the section. The server enforces it again on every API call. */
type Section = { path: string; label: string; icon: IconName; role?: string; render: () => HTMLElement };

export const sections: Section[] = [
  { path: "/", label: "Home", icon: "home", render: overviewSection },
  { path: "/news", label: "News", icon: "news", render: newsSection },
  { path: "/trainer", label: "Trainer", icon: "trainer", render: trainerSection },
  { path: "/about", label: "About", icon: "about", render: aboutSection },
  { path: "/admin", label: "Admin", icon: "shield", role: "admin", render: adminSection },
];

/** Whether an account may open a section path. Unknown paths are left to the router. */
export function canOpenSection(path: string, account: Account | undefined): boolean {
  const role = sections.find((s) => s.path === path)?.role;
  return !role || (account?.roles.includes(role) ?? false);
}

export function homeShell(path: string, navigate: (path: string) => void): View {
  const account = getSession()!.account;
  const visible = sections.filter((s) => canOpenSection(s.path, account));
  const content = h("div", { class: "mx-auto w-full max-w-6xl" });
  const links: HTMLAnchorElement[] = [];

  const navLink = (s: Section, mobile: boolean) => {
    const link = h(
      "a",
      {
        href: s.path,
        "data-link": true,
        "data-path": s.path,
        class: mobile
          ? "group flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-ink-muted aria-[current=page]:text-volt-300"
          : "btn h-10 min-h-10 px-4 text-sm text-ink-muted hover:text-ink aria-[current=page]:bg-night-700 aria-[current=page]:text-ink",
      },
      icon(s.icon, mobile ? "size-6 transition-transform group-aria-[current=page]:-translate-y-0.5" : "size-4"),
      s.label,
    );
    links.push(link);
    return link;
  };

  const header = h(
    "header",
    { class: "safe-top sticky top-0 z-30 border-b border-white/5 bg-night-900/80 backdrop-blur-xl" },
    h(
      "div",
      { class: "safe-x mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4" },
      h("a", { href: "/", "data-link": true, class: "shrink-0 rounded-lg", "aria-label": "PokeUniverse home" }, wordmark("text-2xl")),
      h("nav", { class: "hidden items-center gap-1 md:flex", "aria-label": "Sections" }, ...visible.map((s) => navLink(s, false))),
      h(
        "a",
        {
          href: "/trainer",
          "data-link": true,
          class: "flex min-h-11 min-w-11 items-center gap-3 rounded-full p-1 hover:bg-white/5 md:pr-4",
          "aria-label": "Your trainer profile",
        },
        avatar(account, "size-9"),
        h("span", { class: "hidden max-w-40 truncate text-sm font-semibold lg:block" }, account.displayName),
      ),
    ),
  );

  const tabBar = h(
    "nav",
    {
      class: "safe-x fixed inset-x-0 bottom-0 z-30 border-t border-white/5 bg-night-900/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden",
      "aria-label": "Sections",
    },
    h("div", { class: "mx-auto flex max-w-md" }, ...visible.map((s) => navLink(s, true))),
  );

  const main = h("main", { id: "content", class: "safe-x relative z-10 flex-1 pb-28 pt-6 md:pb-16 md:pt-10" }, content);

  const show = (p: string) => {
    const section = visible.find((s) => s.path === p);
    if (!section) return false;
    const el = section.render();
    el.classList.add("animate-rise");
    content.replaceChildren(el);
    for (const link of links) {
      if (link.dataset.path === p) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    document.title = section.path === "/" ? "PokeUniverse" : `${section.label} · PokeUniverse`;
    return true;
  };

  // Swipe between sections on touch screens.
  onSwipe(main, (direction) => {
    const i = visible.findIndex((s) => s.path === location.pathname);
    const next = visible[i + (direction === "left" ? 1 : -1)];
    if (next) navigate(next.path);
  });

  show(path);

  const el = h(
    "div",
    { class: "relative isolate flex min-h-dvh flex-col bg-gradient-to-b from-night-800 via-night-900 to-night-950" },
    h("div", { class: "pointer-events-none fixed inset-0 -z-10 opacity-60" }, starfield(50)),
    header,
    main,
    tabBar,
  );

  return {
    el,
    update: (p) => {
      const ok = show(p);
      if (ok) window.scrollTo({ top: 0 });
      return ok;
    },
  };
}
