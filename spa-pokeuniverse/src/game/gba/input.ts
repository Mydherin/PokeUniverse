// The GBA buttons, read once per frame like the games do: `held` is what is down now,
// `pressed` what went down since the last frame (a quick tap between frames still counts).
// Keyboard mapping (ui.md#input): arrows or WASD, X/Space = A, Z/Backspace = B,
// Enter = Start, Shift = Select.

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
  KeyX: Button.A,
  Space: Button.A,
  KeyZ: Button.B,
  Backspace: Button.B,
  Enter: Button.Start,
  NumpadEnter: Button.Start,
  ShiftLeft: Button.Select,
  ShiftRight: Button.Select,
};

export class Input {
  held = 0;
  pressed = 0;
  private down = 0;
  private latched = 0;
  private readonly onKeyDown = (e: KeyboardEvent) => {
    const button = KEYS[e.code];
    if (!button || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    if (!e.repeat) this.press(button);
  };
  private readonly onKeyUp = (e: KeyboardEvent) => {
    const button = KEYS[e.code];
    if (button) this.release(button);
  };
  private readonly onBlur = () => (this.down = 0);

  constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
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
    this.pressed = this.latched & ~this.held;
    this.held = this.down;
    this.latched = 0;
  }

  isPressed(buttons: number): boolean {
    return (this.pressed & buttons) !== 0;
  }

  isHeld(buttons: number): boolean {
    return (this.held & buttons) !== 0;
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
  }
}
