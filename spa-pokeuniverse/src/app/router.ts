// History API router. A view may handle sibling paths itself (e.g. home sections)
// so its layout stays mounted and only its content changes.

export type View = {
  el: HTMLElement;
  /** Return true if this view can show `path` without being replaced. */
  update?: (path: string) => boolean;
  destroy?: () => void;
};

export type Route = {
  paths: string[];
  auth: boolean;
  title: string;
  render: (path: string) => View | Promise<View>;
};

type Guard = (route: Route, path: string) => string | null;

export class Router {
  private view: View | null = null;
  private route: Route | null = null;
  /** The path last rendered: a history entry on the same path (an open sheet's, ui.md#mobile-keyboard) renders nothing. */
  private rendered = "";

  constructor(
    private readonly root: HTMLElement,
    private readonly routes: Route[],
    private readonly fallback: string,
    private readonly guard: Guard,
  ) {
    window.addEventListener("popstate", () => {
      if (location.pathname + location.search !== this.rendered) void this.render();
    });
    // Same-origin links are handled here instead of reloading the page.
    document.addEventListener("click", (e) => {
      const link = (e.target as Element).closest?.("a[data-link]") as HTMLAnchorElement | null;
      if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      this.go(link.pathname + link.search);
    });
  }

  go(path: string, replace = false): void {
    if (path === location.pathname + location.search) return;
    history[replace ? "replaceState" : "pushState"](null, "", path);
    void this.render();
  }

  async render(): Promise<void> {
    const path = location.pathname;
    this.rendered = path + location.search;
    const route = this.routes.find((r) => r.paths.includes(path));
    if (!route) return this.go(this.fallback, true);

    const redirect = this.guard(route, path);
    if (redirect) return this.go(redirect, true);

    document.title = route.title === "PokeUniverse" ? route.title : `${route.title} · PokeUniverse`;
    if (route === this.route && this.view?.update?.(path)) return;

    const view = await route.render(path);
    let swapped = false;
    const swap = () => {
      if (swapped) return;
      swapped = true;
      this.view?.destroy?.();
      this.root.replaceChildren(view.el);
      this.view = view;
      this.route = route;
      window.scrollTo(0, 0);
    };
    if (document.startViewTransition && document.visibilityState === "visible" && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // The animation is optional: if the browser aborts it, the swap still happens.
      const transition = document.startViewTransition(swap);
      transition.ready.catch(() => {});
      transition.updateCallbackDone.catch(swap);
      transition.finished.catch(() => {}).finally(swap);
    } else {
      swap();
    }
  }
}
