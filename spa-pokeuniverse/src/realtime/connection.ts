// WebSocket to mic-core: Protocol Buffers envelopes, authenticated with the access token.
// It also carries the world (WorldLink): entering it, the player's intents and the server's answers.
// One copy of the game plays a trainer at a time: when another copy plays it, `onConflict` asks
// the player, and `takeOver` disconnects the other copy.

import { create, fromBinary, toBinary, type MessageInitShape } from "@bufbuild/protobuf";
import type { Direction } from "@pokeuniverse/contracts/map/v1/map";
import { ClientMessageSchema, ErrorCode, ServerMessageSchema } from "@pokeuniverse/contracts/realtime/v1/realtime";
import type { Correction, Script, WorldSnapshot } from "@pokeuniverse/contracts/world/v1/world";
import { getSession, onSessionChange, refresh } from "../auth/session";

export type ConnectionStatus =
  | { state: "connecting" }
  | { state: "online"; accountId: bigint; latencyMs?: number }
  | { state: "offline"; retryInMs: number }
  | { state: "replaced" }
  | { state: "signed-out" };

/** What the server says about the world. */
export interface WorldEvents {
  /** Where the player is: on entering, and again after every reconnect. */
  snapshot(s: WorldSnapshot): void;
  correction(c: Correction): void;
  script(s: Script): void;
  /** The account has no trainer (New Game creates it). */
  noTrainer(): void;
}

/** The world over the connection, as the game uses it. */
export interface WorldLink {
  /** Enters the world now and after every reconnect, until `leave`. */
  enter(events: WorldEvents): void;
  leave(): void;
  /** In the world right now (connected, snapshot received). */
  readonly inWorld: boolean;
  move(step: number, direction: Direction, run: boolean, x: number, y: number): void;
  turn(direction: Direction): void;
  interact(walkInto: boolean): void;
  scriptDone(script: number): void;
}

const PING_EVERY_MS = 5_000;
// Close codes sent by mic-core when the token is missing, invalid or expired.
const AUTH_CLOSE_CODES = new Set([4001, 4002]);
// The trainer is played from another copy of the game: don't take it back unless asked.
const CLOSE_REPLACED = 4004;

type Payload = MessageInitShape<typeof ClientMessageSchema>["payload"];

export class Connection implements WorldLink {
  private ws: WebSocket | null = null;
  private seq = 0;
  private attempts = 0;
  private pingTimer: number | undefined;
  private retryTimer: number | undefined;
  private stopped = false;
  private world: WorldEvents | null = null;
  private entered = false;
  private welcomed = false;
  private replaced = false;
  /** The player agreed to disconnect the other copy; used by the next world entry. */
  private takingOver = false;
  /** This copy of the game, for the server to tell copies apart. */
  private readonly instance = crypto.randomUUID();
  private readonly unsubscribe: () => void;

  constructor(
    private readonly onStatus: (status: ConnectionStatus) => void,
    /** Another copy of the game plays the trainer (now, or took it from this one). */
    private readonly onConflict: () => void = () => {},
  ) {
    // Every refreshed token is sent over the open socket so it is never closed for expiry.
    this.unsubscribe = onSessionChange((session) => {
      if (!session) return this.stop({ state: "signed-out" });
      if (this.ws?.readyState === WebSocket.OPEN) this.send({ case: "authenticate", value: { accessToken: session.accessToken } });
    });
  }

  connect(): void {
    const session = getSession();
    if (!session) return this.stop({ state: "signed-out" });
    this.onStatus({ state: "connecting" });

    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    ws.onopen = () => this.send({ case: "authenticate", value: { accessToken: getSession()?.accessToken ?? "", instance: this.instance } });
    ws.onmessage = (e) => this.receive(new Uint8Array(e.data as ArrayBuffer));
    ws.onclose = (e) => void this.reconnect(e.code);
  }

  /** Plays here, disconnecting the other copy of the game (the player agreed). */
  takeOver(): void {
    this.takingOver = true;
    if (this.replaced) {
      this.replaced = false;
      this.connect();
    } else if (this.welcomed && this.world) this.enterWorld();
  }

  close(): void {
    this.stopped = true;
    this.unsubscribe();
    window.clearInterval(this.pingTimer);
    window.clearTimeout(this.retryTimer);
    this.ws?.close(1000);
  }

  // WorldLink

  get inWorld(): boolean {
    return this.entered && this.ws?.readyState === WebSocket.OPEN;
  }

  enter(events: WorldEvents): void {
    this.world = events;
    this.entered = false;
    // Before Welcome, Welcome sends it.
    if (this.welcomed) this.enterWorld();
  }

  leave(): void {
    this.world = null;
    this.entered = false;
  }

  move(step: number, direction: Direction, run: boolean, x: number, y: number): void {
    if (this.inWorld) this.send({ case: "move", value: { step, direction, run, x, y } });
  }

  turn(direction: Direction): void {
    if (this.inWorld) this.send({ case: "turn", value: { direction } });
  }

  interact(walkInto: boolean): void {
    if (this.inWorld) this.send({ case: "interact", value: { walkInto } });
  }

  scriptDone(script: number): void {
    if (this.inWorld) this.send({ case: "scriptDone", value: { script } });
  }

  private receive(data: Uint8Array): void {
    const msg = fromBinary(ServerMessageSchema, data);
    switch (msg.payload.case) {
      case "welcome":
        this.attempts = 0;
        this.welcomed = true;
        this.onStatus({ state: "online", accountId: msg.payload.value.accountId });
        this.ping();
        window.clearInterval(this.pingTimer);
        this.pingTimer = window.setInterval(() => this.ping(), PING_EVERY_MS);
        if (msg.payload.value.playingElsewhere && !this.takingOver) this.onConflict();
        // Back in the world after a reconnect: a fresh snapshot puts the player where the server has it.
        if (this.world) this.enterWorld();
        break;
      case "pong": {
        const latencyMs = Date.now() - Number(msg.payload.value.clientTime);
        const accountId = getSession()?.account.id ?? 0n;
        this.onStatus({ state: "online", accountId, latencyMs });
        break;
      }
      case "snapshot":
        this.entered = true;
        // Taken over once; another copy taking it back later asks again.
        this.takingOver = false;
        this.world?.snapshot(msg.payload.value);
        break;
      case "correction":
        this.world?.correction(msg.payload.value);
        break;
      case "script":
        this.world?.script(msg.payload.value);
        break;
      case "error":
        if (msg.payload.value.code === ErrorCode.NO_TRAINER) this.world?.noTrainer();
        else if (msg.payload.value.code === ErrorCode.SESSION_ACTIVE) this.onConflict();
        // Otherwise the close event that follows decides what to do.
        break;
    }
  }

  private enterWorld(): void {
    this.send({ case: "enterWorld", value: { takeOver: this.takingOver } });
  }

  private ping(): void {
    this.send({ case: "ping", value: { clientTime: BigInt(Date.now()) } });
  }

  private send(payload: Payload): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(toBinary(ClientMessageSchema, create(ClientMessageSchema, { seq: ++this.seq, payload })));
  }

  private async reconnect(code: number): Promise<void> {
    window.clearInterval(this.pingTimer);
    this.ws = null;
    this.entered = false;
    this.welcomed = false;
    if (this.stopped) return;
    if (code === CLOSE_REPLACED) {
      this.replaced = true;
      this.onStatus({ state: "replaced" });
      return this.onConflict();
    }
    if (AUTH_CLOSE_CODES.has(code)) {
      const session = await refresh().catch(() => getSession());
      if (!session) return this.stop({ state: "signed-out" });
    }
    // Exponential backoff with jitter: 1s, 2s, 4s… up to 15s.
    const retryInMs = Math.min(15_000, 1_000 * 2 ** this.attempts++) * (0.75 + Math.random() * 0.5);
    this.onStatus({ state: "offline", retryInMs });
    this.retryTimer = window.setTimeout(() => this.connect(), retryInMs);
  }

  private stop(status: ConnectionStatus): void {
    this.close();
    this.onStatus(status);
  }
}
