// The on-screen keyboard (ui.md#mobile-keyboard): with `interactive-widget=resizes-visual` it
// never resizes the layout, so its size comes from the visual viewport. While it's open the
// shell is pinned to the visual viewport (iOS doesn't scroll the page to the field) and
// `--vvh` / `--vv-top` hold its height and top; `data-keyboard` on the shell says it's open.

/** Less than this between the layout and the visual viewport is browser bars, not a keyboard. */
const MIN_KEYBOARD = 120;

export interface KeyboardState {
  open: boolean;
  /** CSS pixels the keyboard takes at the bottom. */
  height: number;
}

export class KeyboardTracker {
  state: KeyboardState = { open: false, height: 0 };
  private readonly listeners = new Set<(s: KeyboardState) => void>();
  private readonly vv = window.visualViewport;

  constructor(private readonly shell: HTMLElement) {
    this.vv?.addEventListener("resize", this.update);
    this.vv?.addEventListener("scroll", this.update);
    window.addEventListener("resize", this.update);
    this.update();
  }

  onChange(listener: (s: KeyboardState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private readonly update = () => {
    const vv = this.vv;
    const full = window.innerHeight;
    // A pinch zoom shrinks the visual viewport too: only a keyboard does it at scale 1.
    const height = vv && vv.scale < 1.05 ? Math.max(0, full - vv.height - vv.offsetTop) : 0;
    const open = height >= MIN_KEYBOARD && typingFocused();
    const style = this.shell.style;
    if (open && vv) {
      style.setProperty("--vvh", `${vv.height}px`);
      style.setProperty("--vv-top", `${vv.offsetTop}px`);
      this.shell.dataset.keyboard = "true";
    } else {
      style.removeProperty("--vvh");
      style.removeProperty("--vv-top");
      delete this.shell.dataset.keyboard;
    }
    if (open === this.state.open && height === this.state.height) return;
    this.state = { open, height: open ? height : 0 };
    for (const l of this.listeners) l(this.state);
  };

  /** Focus moved to or from a field: the keyboard follows in the next viewport events. */
  refresh(): void {
    this.update();
  }

  destroy(): void {
    this.vv?.removeEventListener("resize", this.update);
    this.vv?.removeEventListener("scroll", this.update);
    window.removeEventListener("resize", this.update);
    this.listeners.clear();
    delete this.shell.dataset.keyboard;
  }
}

function typingFocused(): boolean {
  const t = document.activeElement;
  return t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}
