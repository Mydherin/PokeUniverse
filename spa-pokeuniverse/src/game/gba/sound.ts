// Sound players on Web Audio, shaped like the games' music players: one BGM at a time
// (with seamless loops and the per-frame fade out), and separate players for sound
// effects and cries that play over it (audio.md#playback).

export interface SoundInfo {
  /** Loop start and end in samples at 48 kHz, for looping songs. */
  loop?: [number, number];
}

const RATE = 48000;

interface Player {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export class Sound {
  private readonly buffers = new Map<string, AudioBuffer>();
  private bgm: Player | null = null;
  private readonly others = new Map<string, Player>();
  // Fade out: the volume drops 1/16 every `fadeSpeed` frames.
  private fadeSpeed = 0;
  private fadeCounter = 0;
  private fadeLevel = 16;

  constructor(
    private readonly ctx: AudioContext,
    private readonly manifest: Record<string, SoundInfo>,
  ) {}

  /** Loads and decodes the sounds not loaded yet; `url(id, ext)` gives each file. */
  async load(ids: string[], url: (id: string, ext: string) => string): Promise<void> {
    const ext = new Audio().canPlayType('audio/webm; codecs="opus"') ? "webm" : "m4a";
    await Promise.all(
      ids.filter((id) => !this.buffers.has(id)).map(async (id) => {
        const res = await fetch(url(id, ext));
        if (!res.ok) throw new Error(`sound ${id}: ${res.status}`);
        this.buffers.set(id, await this.ctx.decodeAudioData(await res.arrayBuffer()));
      }),
    );
  }

  /** Starts a song on the BGM player, stopping the one playing. */
  playBgm(id: string): void {
    this.stopBgm();
    this.bgm = this.start(id);
    const player = this.bgm;
    if (player) player.source.onended = () => this.bgm === player && (this.bgm = null);
  }

  /** Plays on a separate player (one sound at a time per player), over the BGM. */
  play(id: string, player = "se"): void {
    this.others.get(player)?.source.stop();
    const p = this.start(id);
    if (!p) return;
    this.others.set(player, p);
    p.source.onended = () => this.others.get(player) === p && this.others.delete(player);
  }

  /** True while a sound plays on that player (IsCryFinished is !isPlaying("cry")). */
  isPlaying(player: string): boolean {
    return this.others.has(player);
  }

  stopBgm(): void {
    this.bgm?.source.stop();
    this.bgm = null;
    this.fadeSpeed = 0;
  }

  fadeOutBgm(speed: number): void {
    if (!this.bgm) return;
    this.fadeSpeed = this.fadeCounter = speed;
    this.fadeLevel = 16;
  }

  /** True once the BGM has ended or faded out. */
  get bgmStopped(): boolean {
    return this.bgm === null;
  }

  /** Once per frame. */
  update(): void {
    if (!this.fadeSpeed || !this.bgm || --this.fadeCounter) return;
    this.fadeCounter = this.fadeSpeed;
    this.fadeLevel--;
    if (this.fadeLevel <= 0) this.stopBgm();
    else this.bgm.gain.gain.value = this.fadeLevel / 16;
  }

  stopAll(): void {
    this.stopBgm();
    for (const p of this.others.values()) p.source.stop();
    this.others.clear();
  }

  private start(id: string): Player | null {
    const buffer = this.buffers.get(id);
    if (!buffer) return null;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const loop = this.manifest[id]?.loop;
    if (loop) {
      source.loop = true;
      source.loopStart = loop[0] / RATE;
      source.loopEnd = loop[1] / RATE;
    }
    const gain = this.ctx.createGain();
    source.connect(gain).connect(this.ctx.destination);
    source.start();
    return { source, gain };
  }
}
