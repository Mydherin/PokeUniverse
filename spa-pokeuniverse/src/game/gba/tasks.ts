// Per-frame tasks, run in priority order (lower first), as the games schedule their work.
// A task created during a run starts this frame if it lands after the running task.

export type TaskFn = (task: Task) => void;

export class Task {
  /** 16 signed 16-bit slots, like the games' task data. */
  readonly data = new Int16Array(16);
  active = true;
  prev: Task | null = null;
  next: Task | null = null;

  constructor(
    readonly fn: TaskFn,
    readonly priority: number,
  ) {}

  /** A 32-bit value kept in two slots (low half first). */
  word(i: number): number {
    return ((this.data[i] & 0xffff) | (this.data[i + 1] << 16)) >>> 0;
  }

  setWord(i: number, value: number): void {
    this.data[i] = value & 0xffff;
    this.data[i + 1] = value >>> 16;
  }
}

export class Tasks {
  private head: Task | null = null;

  create(fn: TaskFn, priority: number): Task {
    const task = new Task(fn, priority);
    let at = this.head;
    if (!at) {
      this.head = task;
      return task;
    }
    for (;;) {
      if (priority < at.priority) {
        task.prev = at.prev;
        task.next = at;
        if (at.prev) at.prev.next = task;
        else this.head = task;
        at.prev = task;
        return task;
      }
      if (!at.next) {
        task.prev = at;
        at.next = task;
        return task;
      }
      at = at.next;
    }
  }

  /** Unlinks a task. Its own `next` stays, so a run in progress carries on after it. */
  destroy(task: Task | undefined): void {
    if (!task?.active) return;
    task.active = false;
    if (task.prev) task.prev.next = task.next;
    else this.head = task.next;
    if (task.next) task.next.prev = task.prev;
  }

  find(fn: TaskFn): Task | undefined {
    for (let t = this.head; t; t = t.next) if (t.fn === fn) return t;
    return undefined;
  }

  isActive(fn: TaskFn): boolean {
    return this.find(fn) !== undefined;
  }

  run(): void {
    for (let t = this.head; t; t = t.next) t.fn(t);
  }

  reset(): void {
    for (let t = this.head; t; t = t.next) t.active = false;
    this.head = null;
  }
}
