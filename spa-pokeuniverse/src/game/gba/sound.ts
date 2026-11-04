// Sound players on Web Audio, shaped like the games' music players: one BGM at a time
// (with seamless loops and the per-frame fade out), and separate players for sound
// effects and cries that play over it (audio.md#playback). All of them go through one
// output, mono or stereo.

export interface SoundInfo {
  /** Loop start and end in samples at 48 kHz, for looping songs. */
  loop?: [number, number];
}

const RATE = 48000;

interface Player {
  source: AudioBufferSourceNode;
  gain: GainNode;
  panner: StereoPannerNode;
}

export class Sound {
  private readonly buffers = new Map<string, AudioBuffer>();
  private bgm: Player | null = null;
  private readonly others = new Map<string, Player>();
  // Fade out: the volume drops 1/16 every `fadeSpeed` frames.
  private fadeSpeed = 0;
  private fadeCounter = 0;
  private fadeLevel = 16;
  /** Every player's output, before the speakers. */
  private readonly output: GainNode;

  constructor(
    private readonly ctx: AudioContext,
    private readonly manifest: Record<string, SoundInfo>,
  ) {
    this.output = ctx.createGain();
    this.output.channelInterpretation = "speakers";
    this.output.connect(ctx.destination);
    this.stereo = false;
  }

  /** The SOUND option: in mono (the game's default) both speakers play the same mix. */
  set stereo(on: boolean) {
    this.output.channelCountMode = on ? "max" : "explicit";
    this.output.channelCount = on ? 2 : 1;
  }

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

  /**
   * Plays on a separate player (one sound at a time per player), over the BGM; `pan` from -1 (left)
   * to 1 (right), heard in stereo only.
   */
  play(id: string, player = "se", pan = 0): void {
    this.others.get(player)?.source.stop();
    const p = this.start(id);
    if (!p) return;
    p.panner.pan.value = pan;
    this.others.set(player, p);
    p.source.onended = () => this.others.get(player) === p && this.others.delete(player);
  }

  /** PlayFanfare: a song over the BGM, which stays silent until it ends. */
  playFanfare(id: string): void {
    this.others.get("fanfare")?.source.stop();
    const p = this.start(id);
    if (!p) return;
    if (this.bgm) this.bgm.gain.gain.value = 0;
    this.others.set("fanfare", p);
    p.source.onended = () => {
      if (this.others.get("fanfare") !== p) return;
      this.others.delete("fanfare");
      if (this.bgm) this.bgm.gain.gain.value = this.fadeSpeed ? this.fadeLevel / 16 : 1;
    };
  }

  /** IsFanfareTaskInactive's opposite: a fanfare is still playing. */
  get fanfarePlaying(): boolean {
    return this.others.has("fanfare");
  }

  /** Moves what a player plays to another pan (SE12PanpotControl). */
  setPan(player: string, pan: number): void {
    const p = this.others.get(player);
    if (p) p.panner.pan.value = pan;
  }

  /** Stops what a player plays (StopCryAndClearCrySongs is stop("cry")). */
  stop(player: string): void {
    this.others.get(player)?.source.stop();
    this.others.delete(player);
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
    const panner = this.ctx.createStereoPanner();
    source.connect(gain).connect(panner).connect(this.output);
    source.start();
    return { source, gain, panner };
  }
}
