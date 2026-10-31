// The play time as FireRed keeps it (play_time.c): once in the world it counts every frame, on
// every screen, and stops at 999:59:59. mic-core counts the real time; each world snapshot sets
// it again, and this counts on from there between them.

const MAX_HOURS = 999;
const FRAMES_PER_SECOND = 60;

export class PlayTime {
  hours = 0;
  minutes = 0;
  seconds = 0;
  /** Frames into the current second (playTimeVBlanks). */
  frames = 0;
  private running = false;

  /** PlayTimeCounter_Start from the server's count. */
  start(totalSeconds: number): void {
    const hours = Math.floor(totalSeconds / 3600);
    if (hours > MAX_HOURS) return this.setToMax();
    this.hours = hours;
    this.minutes = Math.floor(totalSeconds / 60) % 60;
    this.seconds = totalSeconds % 60;
    this.frames = 0;
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  /** PlayTimeCounter_Update: one frame. */
  update(): void {
    if (!this.running || ++this.frames < FRAMES_PER_SECOND) return;
    this.frames = 0;
    if (++this.seconds < 60) return;
    this.seconds = 0;
    if (++this.minutes < 60) return;
    this.minutes = 0;
    if (++this.hours > MAX_HOURS) this.setToMax();
  }

  private setToMax(): void {
    this.running = false;
    this.hours = MAX_HOURS;
    this.minutes = this.seconds = 59;
  }
}
