// WebSocket to mic-core: Protocol Buffers envelopes, authenticated with the access token.
// It also carries the world (WorldLink): entering it, the player's intents and the server's answers.
// One copy of the game plays a trainer at a time: entering the world from the game (CONTINUE,
// New Game) takes the trainer from any other copy, which stops for good (`onEnded("replaced")`).
// Re-entering after a reconnect never takes it back: a copy replaced meanwhile stops too.
// A lost connection is retried with backoff; after MAX_RETRIES failed tries in a row it stops
// for good too (`onEnded("disconnected")`).

import { create, fromBinary, toBinary, type MessageInitShape } from "@bufbuild/protobuf";
import type { BagChanged, ItemResult } from "@pokeuniverse/contracts/item/v1/bag";
import type { Item, Pocket } from "@pokeuniverse/contracts/item/v1/catalog";
import type { PcChanged } from "@pokeuniverse/contracts/item/v1/pc";
import type { Direction } from "@pokeuniverse/contracts/map/v1/map";
import type { PartyChanged } from "@pokeuniverse/contracts/party/v1/party";
import { ClientMessageSchema, ErrorCode, ServerMessageSchema } from "@pokeuniverse/contracts/realtime/v1/realtime";
import type { Correction, Script, WorldSnapshot } from "@pokeuniverse/contracts/world/v1/world";
import { getSession, onSessionChange, refresh } from "../auth/session";

export type ConnectionStatus =
  | { state: "connecting" }
  | { state: "online"; accountId: bigint; latencyMs?: number }
  | { state: "offline"; retryInMs: number }
  | { state: "replaced" }
  | { state: "disconnected" }
  | { state: "signed-out" };

/** Why the connection stopped for good: the game can't go on, only back home. */
export type EndReason = "replaced" | "disconnected";

/** What the server says about the world. */
export interface WorldEvents {
  /** Where the player is: on entering, and again after every reconnect. */
  snapshot(s: WorldSnapshot): void;
  correction(c: Correction): void;
  script(s: Script): void;
  /** Bag pockets that changed (before the ItemResult that changed them), or a correction. */
  bagChanged(b: BagChanged): void;
  /** What the PC stores (before the ItemResult that changed it), or a correction. */
  pcChanged(p: PcChanged): void;
  /** The whole party (before the ItemResult that changed it), or a correction. */
  partyChanged(p: PartyChanged): void;
  /** What using, giving, tossing, withdrawing or depositing an item, or giving or taking a held one, did. */
  itemResult(r: ItemResult): void;
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
  /** USE from the bag, or the registered item with SELECT (`field`); answered with an ItemResult. */
  useItem(item: Item, field: boolean): void;
  /** GIVE from the bag, or from the PC (`pc`). */
  giveItem(item: Item, pc: boolean): void;
  tossItem(item: Item, quantity: number): void;
  registerItem(item: Item): void;
  moveItem(pocket: Pocket, from: number, to: number): void;
  /** While the PC is on: its items to the bag, the bag's to it, and SELECT's moves. */
  withdrawItem(item: Item, quantity: number): void;
  depositItem(item: Item, quantity: number): void;
  movePcItem(from: number, to: number): void;
  /** SWITCH in the party menu (slots from 0); shown at once, corrected with PartyChanged if refused. */
  swapPartySlots(from: number, to: number): void;
  /** A party Pokémon holds the item, from the bag or the PC (`pc`); answered with an ItemResult. */
  givePartyItem(item: Item, slot: number, pc: boolean): void;
  /** A party Pokémon's held item into the bag; answered with an ItemResult. */
  takePartyItem(slot: number): void;
  /** SWITCH on the summary's move page (slots and moves from 0); shown at once, corrected like swapPartySlots. */
  swapPokemonMoves(slot: number, from: number, to: number): void;
}

const PING_EVERY_MS = 5_000;
// Close codes sent by mic-core when the token is missing, invalid or expired.
const AUTH_CLOSE_CODES = new Set([4001, 4002]);
// The trainer is played from another copy of the game: this one stops, never reconnecting.
const CLOSE_REPLACED = 4004;
// Failed reconnects in a row before giving up (~1 min of backoff: 1s, 2s, 4s, 8s, then 15s each).
const MAX_RETRIES = 8;
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 15_000;

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
  /** The next world entry comes from the game, not a reconnect: it takes the trainer over. */
  private takingOver = false;
  /** This copy of the game, for the server to tell copies apart. */
  private readonly instance = crypto.randomUUID();
  private readonly unsubscribe: () => void;

  constructor(
    private readonly onStatus: (status: ConnectionStatus) => void,
    /** The connection stopped for good (another copy took the trainer, or the server stayed unreachable): the game must stop. */
    private readonly onEnded: (reason: EndReason) => void = () => {},
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
    this.takingOver = true;
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

  useItem(item: Item, field: boolean): void {
    if (this.inWorld) this.send({ case: "useItem", value: { item, field } });
  }

  giveItem(item: Item, pc: boolean): void {
    if (this.inWorld) this.send({ case: "giveItem", value: { item, pc } });
  }

  tossItem(item: Item, quantity: number): void {
    if (this.inWorld) this.send({ case: "tossItem", value: { item, quantity } });
  }

  registerItem(item: Item): void {
    if (this.inWorld) this.send({ case: "registerItem", value: { item } });
  }

  moveItem(pocket: Pocket, from: number, to: number): void {
    if (this.inWorld) this.send({ case: "moveItem", value: { pocket, from, to } });
  }

  withdrawItem(item: Item, quantity: number): void {
    if (this.inWorld) this.send({ case: "withdrawItem", value: { item, quantity } });
  }

  depositItem(item: Item, quantity: number): void {
    if (this.inWorld) this.send({ case: "depositItem", value: { item, quantity } });
  }

  movePcItem(from: number, to: number): void {
    if (this.inWorld) this.send({ case: "movePcItem", value: { from, to } });
  }

  swapPartySlots(from: number, to: number): void {
    if (this.inWorld) this.send({ case: "swapPartySlots", value: { from, to } });
  }

  givePartyItem(item: Item, slot: number, pc: boolean): void {
    if (this.inWorld) this.send({ case: "givePartyItem", value: { item, slot, pc } });
  }

  takePartyItem(slot: number): void {
    if (this.inWorld) this.send({ case: "takePartyItem", value: { slot } });
  }

  swapPokemonMoves(slot: number, from: number, to: number): void {
    if (this.inWorld) this.send({ case: "swapPokemonMoves", value: { slot, from, to } });
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
        // Taken over; reconnects from now on only re-enter.
        this.takingOver = false;
        this.world?.snapshot(msg.payload.value);
        break;
      case "correction":
        this.world?.correction(msg.payload.value);
        break;
      case "script":
        this.world?.script(msg.payload.value);
        break;
      case "bagChanged":
        this.world?.bagChanged(msg.payload.value);
        break;
      case "pcChanged":
        this.world?.pcChanged(msg.payload.value);
        break;
      case "partyChanged":
        this.world?.partyChanged(msg.payload.value);
        break;
      case "itemResult":
        this.world?.itemResult(msg.payload.value);
        break;
      case "error":
        if (msg.payload.value.code === ErrorCode.NO_TRAINER) this.world?.noTrainer();
        else if (msg.payload.value.code === ErrorCode.SESSION_ACTIVE) this.end("replaced");
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
    if (code === CLOSE_REPLACED) return this.end("replaced");
    if (AUTH_CLOSE_CODES.has(code)) {
      const session = await refresh().catch(() => getSession());
      if (!session) return this.stop({ state: "signed-out" });
    }
    // Welcome resets the count, so only failures in a row add up.
    if (this.attempts >= MAX_RETRIES) return this.end("disconnected");
    // Exponential backoff with jitter (±25%), so many clients don't all retry at once.
    const retryInMs = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** this.attempts++) * (0.75 + Math.random() * 0.5);
    this.onStatus({ state: "offline", retryInMs });
    this.retryTimer = window.setTimeout(() => this.connect(), retryInMs);
  }

  /** Closed for good: the game stops. */
  private end(reason: EndReason): void {
    if (this.stopped) return;
    this.stop({ state: reason });
    this.onEnded(reason);
  }

  private stop(status: ConnectionStatus): void {
    this.close();
    this.onStatus(status);
  }
}
