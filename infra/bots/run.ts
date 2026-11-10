// Dev bots (phase-8 M1, D16): N bot players that log in through POST /api/dev/bots, enter the world
// over the real WebSocket protocol and walk at FireRed's pace, printing latency and traffic.
//
//   node infra/bots/bots.ts --count 5 --map pallet_town_players_house_2f [--url http://localhost:8080] [--secret …]
//
// The secret defaults to BOTS_SECRET from the environment or the repository's .env. Ctrl-C closes
// every socket. Nothing here is used by the game.

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { create, fromBinary, fromJson, toBinary, toJson, type MessageInitShape } from "@bufbuild/protobuf";
import { SpawnBotsSchema, SpawnedBotsSchema, type SpawnedBot } from "../../lib-contracts/gen/ts/src/pokeuniverse/dev/v1/bots_pb.ts";
import { ClientMapSchema, Direction, TileBehavior, type ClientMap } from "../../lib-contracts/gen/ts/src/pokeuniverse/map/v1/map_pb.ts";
import { ClientMessageSchema, ErrorCode, ServerMessageSchema } from "../../lib-contracts/gen/ts/src/pokeuniverse/realtime/v1/realtime_pb.ts";
import { behaviorAt, elevationAt, warpAt } from "../../spa-pokeuniverse/src/game/world/map.ts";
import { checkStep, Collision, DELTAS, elevationAfter } from "../../spa-pokeuniverse/src/game/world/rules.ts";

const ROOT = new URL("../../", import.meta.url);

// FireRed's pace at 60 fps: a walking step is 16 frames, a running one 8.
const WALK_MS = (16 * 1000) / 60;
const RUN_MS = (8 * 1000) / 60;
const PING_EVERY_MS = 5_000;
const STATS_EVERY_MS = 10_000;
// tech-stack.md#movement: 1, 2, 4, 8, then 15 s, ±25%; 8 failures in a row stop the bot.
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000];
const MAX_RETRIES = 8;
// Close codes after which a copy of the game doesn't reconnect (tech-stack.md).
const FINAL_CLOSES = new Set([4001, 4003, 4004]);
const DIRECTIONS = [Direction.NORTH, Direction.SOUTH, Direction.WEST, Direction.EAST];

const dotenv = readDotenv();
const { values: args } = parseArgs({
  options: {
    count: { type: "string", default: "5" },
    map: { type: "string", default: "pallet_town_players_house_2f" },
    url: { type: "string", default: `http://localhost:${dotenv.SPA_PORT ?? "8080"}` },
    secret: { type: "string", default: process.env.BOTS_SECRET ?? dotenv.BOTS_SECRET ?? "" },
    chat: { type: "boolean", default: false },
  },
});
const base = new URL(args.url);
const count = Number(args.count);
if (!args.secret) fail("no secret: set BOTS_SECRET in .env (and restart mic-core) or pass --secret");
if (!Number.isInteger(count) || count < 1 || count > 100) fail("--count must be 1 to 100");
if (args.chat) console.log("--chat: bots don't chat yet (Phase 8's chat milestone adds it)");

const maps = new Map<string, ClientMap>();
function loadMap(id: string): ClientMap {
  let m = maps.get(id);
  if (!m) {
    m = fromBinary(ClientMapSchema, readFileSync(new URL(`spa-pokeuniverse/public/maps/${id}.binpb`, ROOT)));
    maps.set(id, m);
  }
  return m;
}

const stats = { steps: 0, corrections: 0, messages: 0, bytes: 0, battles: 0, reconnects: 0, pings: [] as number[] };
let stopping = false;

class Bot {
  private ws: WebSocket | undefined;
  private seq = 0;
  private step = 0;
  private map: ClientMap | undefined;
  private x = 0;
  private y = 0;
  private elevation = 0;
  private facing = Direction.SOUTH;
  private canRun = false;
  private walking = false;
  private warping = false;
  private retries = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly instance = crypto.randomUUID();
  connected = false;

  constructor(
    readonly n: number,
    public token: string,
  ) {}

  connect(): void {
    if (stopping) return;
    const url = new URL("/ws", base);
    url.protocol = base.protocol === "https:" ? "wss:" : "ws:";
    // Node's WebSocket (undici) may send the Origin the server only accepts from the app.
    const ws = new WebSocket(url, { headers: { Origin: base.origin } } as unknown as string[]);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    ws.onopen = () => this.send({ case: "authenticate", value: { accessToken: this.token, instance: this.instance } });
    ws.onmessage = (e) => this.receive(new Uint8Array(e.data as ArrayBuffer));
    ws.onclose = (e) => this.closed(e.code, e.reason);
    ws.onerror = () => {};
  }

  /** Sends a renewed token on the open socket, as the SPA does. */
  renew(token: string): void {
    this.token = token;
    if (this.connected) this.send({ case: "authenticate", value: { accessToken: token, instance: this.instance } });
  }

  close(): void {
    this.clearTimers();
    this.ws?.close(1000);
  }

  private send(payload: MessageInitShape<typeof ClientMessageSchema>["payload"]): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(toBinary(ClientMessageSchema, create(ClientMessageSchema, { seq: ++this.seq, payload })));
  }

  private receive(data: Uint8Array): void {
    stats.messages++;
    stats.bytes += data.byteLength;
    const msg = fromBinary(ServerMessageSchema, data).payload;
    switch (msg.case) {
      case "welcome":
        this.retries = 0;
        this.send({ case: "enterWorld", value: { takeOver: this.firstEntry() } });
        break;
      case "snapshot": {
        const p = msg.value.player;
        this.place(msg.value.map, p?.x ?? 0, p?.y ?? 0, p?.facing ?? Direction.SOUTH);
        this.canRun = msg.value.canRun;
        if (!this.connected) {
          this.connected = true;
          this.every(PING_EVERY_MS, () => this.send({ case: "ping", value: { clientTime: BigInt(Date.now()) } }));
        }
        if (!this.walking) this.walk();
        break;
      }
      case "pong":
        stats.pings.push(Date.now() - Number(msg.value.clientTime));
        break;
      case "correction":
        stats.corrections++;
        this.x = msg.value.x;
        this.y = msg.value.y;
        this.facing = msg.value.facing;
        this.elevation = this.map ? elevationAt(this.map, this.x, this.y) : 0;
        this.warping = false;
        break;
      case "warped":
        this.place(msg.value.map, msg.value.x, msg.value.y, msg.value.facing);
        this.canRun = msg.value.canRun;
        this.warping = false;
        break;
      case "script":
        this.send({ case: "scriptDone", value: { script: msg.value.id } });
        break;
      case "battleStarted":
        // Bots stay off the test grass; a battle here is a bug to look at.
        stats.battles++;
        console.warn(`bot-${this.n}: in a battle at ${this.x},${this.y}`);
        break;
      case "error":
        if (msg.value.code !== ErrorCode.TOKEN_EXPIRED) console.warn(`bot-${this.n}: error ${ErrorCode[msg.value.code]}`);
        break;
    }
  }

  private entered = false;
  /** take_over only on the first entry: a reconnect re-enters without it (tech-stack.md). */
  private firstEntry(): boolean {
    const first = !this.entered;
    this.entered = true;
    return first;
  }

  private place(mapID: string, x: number, y: number, facing: Direction): void {
    this.map = loadMap(mapID);
    this.x = x;
    this.y = y;
    this.facing = facing;
    this.elevation = elevationAt(this.map, x, y);
  }

  /** One step (or turn, pause, warp) at a time, at FireRed's pace. */
  private walk(): void {
    this.walking = true;
    const next = (ms: number) => this.after(ms, () => this.walk());
    if (!this.connected || !this.map || this.warping) return next(WALK_MS);
    const r = Math.random();
    if (r < 0.03) return next(Math.random() * 3_000);
    if (r < 0.06) {
      this.facing = pick(DIRECTIONS);
      this.send({ case: "turn", value: { direction: this.facing } });
      return next(WALK_MS / 2);
    }
    const d = Math.random() < 0.7 ? this.facing : pick(DIRECTIONS);
    const collision = checkStep(this.map, this.x, this.y, this.elevation, d);
    if (collision === Collision.StairWarp) {
      // The stairs, now and then, so both floors fill.
      if (Math.random() < 0.15) {
        this.warping = true;
        this.facing = d;
        this.send({ case: "useWarp", value: { direction: d, x: this.x, y: this.y } });
        return next(WALK_MS);
      }
      this.facing = pick(DIRECTIONS.filter((o) => o !== d));
      return next(0);
    }
    const [dx, dy] = DELTAS[d];
    const tx = this.x + dx;
    const ty = this.y + dy;
    if (collision !== Collision.None || this.avoid(tx, ty)) {
      this.facing = pick(DIRECTIONS.filter((o) => o !== d));
      return next(0);
    }
    const run = this.canRun && Math.random() < 0.25;
    this.send({ case: "move", value: { step: ++this.step, direction: d, run, x: this.x, y: this.y } });
    stats.steps++;
    this.elevation = elevationAfter(this.map, this.elevation, this.x, this.y, tx, ty);
    this.x = tx;
    this.y = ty;
    this.facing = d;
    next(run ? RUN_MS : WALK_MS);
  }

  /** The test grass (no battles for bots) and warps that aren't stairs (doors to maps not written yet). */
  private avoid(x: number, y: number): boolean {
    const m = this.map!;
    const b = behaviorAt(m, x, y);
    if (b === TileBehavior.TALL_GRASS) return true;
    return warpAt(m, x, y) && !(b >= TileBehavior.UP_RIGHT_STAIR_WARP && b <= TileBehavior.DOWN_LEFT_STAIR_WARP);
  }

  private closed(code: number, reason: string): void {
    const wasConnected = this.connected;
    this.connected = false;
    this.walking = false;
    this.clearTimers();
    if (stopping) return;
    if (FINAL_CLOSES.has(code)) {
      console.warn(`bot-${this.n}: closed ${code} ${reason}: stopped`);
      return;
    }
    if (++this.retries > MAX_RETRIES) {
      console.warn(`bot-${this.n}: ${MAX_RETRIES} reconnects failed: stopped`);
      return;
    }
    if (wasConnected) stats.reconnects++;
    const ms = BACKOFF_MS[Math.min(this.retries - 1, BACKOFF_MS.length - 1)] * (0.75 + Math.random() * 0.5);
    setTimeout(() => this.connect(), ms);
  }

  private after(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  private every(ms: number, fn: () => void): void {
    const t = setInterval(fn, ms);
    this.timers.add(t);
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }
}

async function spawn(refreshOnly: boolean): Promise<SpawnedBot[]> {
  const res = await fetch(new URL("/api/dev/bots", base), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Bots-Secret": args.secret },
    body: JSON.stringify(toJson(SpawnBotsSchema, create(SpawnBotsSchema, { count, map: args.map, refreshOnly }))),
  });
  if (!res.ok) fail(`POST /api/dev/bots: ${res.status} ${(await res.text()).trim()}${res.status === 404 ? " (is BOTS_SECRET set for mic-core?)" : ""}`);
  return fromJson(SpawnedBotsSchema, await res.json()).bots;
}

/** Renews every bot's token a minute before it expires. */
function scheduleRenewal(spawned: SpawnedBot[], bots: Bot[]): void {
  const expires = Math.min(...spawned.map((b) => Number(b.expiresAt) * 1000));
  setTimeout(async () => {
    try {
      const fresh = await spawn(true);
      for (const b of fresh) bots[b.n - 1]?.renew(b.accessToken);
      scheduleRenewal(fresh, bots);
    } catch (err) {
      console.warn(`token renewal failed: ${err}; retrying`);
      scheduleRenewal(spawned.map((b) => ({ ...b, expiresAt: BigInt(Math.floor(Date.now() / 1000) + 70) })), bots);
    }
  }, Math.max(expires - Date.now() - 60_000, 5_000)).unref();
}

function printStats(bots: Bot[]): void {
  const secs = STATS_EVERY_MS / 1000;
  const connected = bots.filter((b) => b.connected).length;
  const pings = stats.pings.sort((a, b) => a - b);
  const pct = (p: number) => (pings.length ? `${pings[Math.min(pings.length - 1, Math.floor(p * pings.length))]}ms` : "-");
  const per = Math.max(connected, 1);
  console.log(
    `[${new Date().toISOString().slice(11, 19)}] connected ${connected}/${bots.length}` +
      ` | steps/s ${(stats.steps / secs).toFixed(1)} | corrections ${stats.corrections}` +
      ` | per bot: ${(stats.messages / secs / per).toFixed(1)} msg/s, ${(stats.bytes / secs / per).toFixed(0)} B/s` +
      ` | ping p50 ${pct(0.5)} p99 ${pct(0.99)}` +
      (stats.reconnects ? ` | reconnects ${stats.reconnects}` : "") +
      (stats.battles ? ` | battles ${stats.battles}` : ""),
  );
  Object.assign(stats, { steps: 0, corrections: 0, messages: 0, bytes: 0, battles: 0, reconnects: 0, pings: [] });
}

function readDotenv(): Record<string, string> {
  try {
    const env: Record<string, string> = {};
    for (const line of readFileSync(new URL(".env", ROOT), "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) env[m[1]] = m[2];
    }
    return env;
  } catch {
    return {};
  }
}

function pick<T>(xs: T[]): T {
  return xs[Math.floor(Math.random() * xs.length)];
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const spawned = await spawn(false);
const bots = spawned.map((b) => new Bot(b.n, b.accessToken));
console.log(`${bots.length} bots on ${args.map} (${base.origin}); stats every ${STATS_EVERY_MS / 1000} s, Ctrl-C to stop`);
for (const b of bots) b.connect();
scheduleRenewal(spawned, bots);
const statsTimer = setInterval(() => printStats(bots), STATS_EVERY_MS);

process.on("SIGINT", () => {
  if (stopping) process.exit(1);
  stopping = true;
  clearInterval(statsTimer);
  for (const b of bots) b.close();
  console.log("closing…");
  setTimeout(() => process.exit(0), 500);
});
