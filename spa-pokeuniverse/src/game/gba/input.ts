// The GBA buttons, read once per frame like the games do: `held` is what is down now,
// `pressed` what went down since the last frame (a quick tap between frames still counts),
// `repeated` adds the key repeat of a held combination (JOY_REPT).
// Keyboard mapping (ui.md#input): arrows or WASD, Z/Space = A, X/Backspace = B,
// Enter = Start, Shift = Select. With the L=A button mode, L also presses A.

export const Button = {
  A: 1,
  B: 2,
  Select: 4,
  Start: 8,
  Right: 16,
  Left: 32,
  Up: 64,
  Down: 128,
  R: 256,
  L: 512,
} as const;

const KEYS: Record<string, number> = {
  ArrowUp: Button.Up,
  ArrowDown: Button.Down,
  ArrowLeft: Button.Left,
  ArrowRight: Button.Right,
  KeyW: Button.Up,
  KeyS: Button.Down,
  KeyA: Button.Left,
  KeyD: Button.Right,
  KeyZ: Button.A,
  Space: Button.A,
  KeyX: Button.B,
  Backspace: Button.B,
  Enter: Button.Start,
  NumpadEnter: Button.Start,
  ShiftLeft: Button.Select,
  ShiftRight: Button.Select,
};

/** A text field has the keys (chat): the game doesn't read them (ui.md#desktop). */
function typing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
}

export class Input {
  held = 0;
  pressed = 0;
  repeated = 0;
  /** Frames before a held combination repeats, then between repeats (gKeyRepeat*Delay). */
  repeatStartDelay = 40;
  repeatContinueDelay = 5;
  /** The L=A button mode: L counts as A in `pressed` and `held`. */
  lEqualsA = false;
  private repeatCounter = 0;
  /** What is down without the L=A remap. */
  private heldRaw = 0;
  private down = 0;
  private latched = 0;
  private readonly onKeyDown = (e: KeyboardEvent) => {
    const button = KEYS[e.code];
    if (!button || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    e.preventDefault();
    if (!e.repeat) this.press(button);
  };
  private readonly onKeyUp = (e: KeyboardEvent) => {
    const button = KEYS[e.code];
    if (button) this.release(button);
  };
  private readonly onBlur = () => (this.down = 0);
  /** Typing starts: nothing stays held from before. */
  private readonly onFocusIn = (e: FocusEvent) => {
    if (typing(e.target)) this.down = 0;
  };

  constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("focusin", this.onFocusIn);
  }

  press(button: number): void {
    this.down |= button;
    this.latched |= button;
  }

  release(button: number): void {
    this.down &= ~button;
  }

  /** Start of a frame. */
  update(): void {
    const keys = this.down | this.latched;
    this.pressed = this.latched & ~this.heldRaw;
    this.repeated = this.pressed;
    if (keys && keys === this.heldRaw) {
      if (--this.repeatCounter === 0) {
        this.repeated = keys;
        this.repeatCounter = this.repeatContinueDelay;
      }
    } else this.repeatCounter = this.repeatStartDelay;
    this.held = this.heldRaw = this.down;
    this.latched = 0;
    // ReadKeys remaps after the key repeat, which stays as pressed.
    if (this.lEqualsA) {
      if (this.pressed & Button.L) this.pressed |= Button.A;
      if (this.held & Button.L) this.held |= Button.A;
    }
  }

  isPressed(buttons: number): boolean {
    return (this.pressed & buttons) !== 0;
  }

  isRepeated(buttons: number): boolean {
    return (this.repeated & buttons) !== 0;
  }

  isHeld(buttons: number): boolean {
    return (this.held & buttons) !== 0;
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("focusin", this.onFocusIn);
  }
}
