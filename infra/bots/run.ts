// Dev bots (phase-8 M1, D16): N bot players that log in through POST /api/dev/bots, enter the world
// over the real WebSocket protocol and walk at FireRed's pace, printing latency and traffic.
//
//   node infra/bots/bots.ts --count 5 --map pallet_town_players_house_2f [--first 1] [--url http://localhost:8080] [--secret …]
//     [--verbose] [--idle] [--chat] [--flood] [--say <line> …] [--friend <n>]
//
// Each bot tracks the other players in its zone (phase-8 M2) from its snapshot and `zone_events`;
// --verbose prints every event the last bot (bot-N) receives: one bot's view, readable; a second
// script run would re-spawn bot-1 and take it over. --idle keeps that bot standing where it spawned,
// so it stays in the zone for a whole test case. --first runs bot-<first> on (default 1), so several
// runs can play side by side, each with its own bots.
//
// Chat (phase-8 M5): --chat makes each bot say a random line every 20-60 s, --flood 10 lines a
// second (to see the limit), --say (repeatable) the given lines once each after entering, 2.1 s
// apart. The verbose bot prints every ChatMessage, its own included; stats count the lines received.
//
// Load (phase-8 M8): --ramp adds bots in steps, 25, 50, 100, 200 on --map, then 500 (250 there and
// 250 on --map2, the other floor by default); bots stay on their map (no stairs, as --stay does).
// Each step settles 10 s, measures --hold seconds (default 30), then prints the bots' stats, each
// replica's zone stats (GET /api/dev/stats) and `docker stats`. --map2's bots are bot-<first+500> on.
//
// Friends (phase-9 M1): --friend n makes the last bot (bot-N) send a friend request to each of
// bot-<first> … bot-<first+n-1> over HTTP, and each of them accept it. The verbose bot prints every
// SocialEvent it receives (requests, accepted, closed, removed, presence).
//
// The secret defaults to BOTS_SECRET from the environment or the repository's .env. Ctrl-C closes
// every socket. Nothing here is used by the game.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { create, fromBinary, fromJson, toBinary, toJson, type MessageInitShape } from "@bufbuild/protobuf";
import { ReplicaStatsSchema, SpawnBotsSchema, SpawnedBotsSchema, type ReplicaStats, type SpawnedBot } from "../../lib-contracts/gen/ts/src/pokeuniverse/dev/v1/bots_pb.ts";
import { ClientMapSchema, Direction, TileBehavior, type ClientMap } from "../../lib-contracts/gen/ts/src/pokeuniverse/map/v1/map_pb.ts";
import { ClientMessageSchema, ErrorCode, ServerMessageSchema } from "../../lib-contracts/gen/ts/src/pokeuniverse/realtime/v1/realtime_pb.ts";
import { SocialEventSchema } from "../../lib-contracts/gen/ts/src/pokeuniverse/social/v1/social_pb.ts";
import type { OtherPlayer, ZoneEvent } from "../../lib-contracts/gen/ts/src/pokeuniverse/world/v1/world_pb.ts";
import { behaviorAt, elevationAt, warpAt } from "../../spa-pokeuniverse/src/game/world/map.ts";
import { checkStep, Collision, DELTAS, elevationAfter } from "../../spa-pokeuniverse/src/game/world/rules.ts";

const ROOT = new URL("../../", import.meta.url);

// FireRed's pace at 60 fps: a walking step is 16 frames, a running one 8.
const WALK_MS = (16 * 1000) / 60;
const RUN_MS = (8 * 1000) / 60;
const PING_EVERY_MS = 5_000;
const FLOOD_EVERY_MS = 100;
const SAY_EVERY_MS = 2_100;
const LINES = ["Hello!", "Anyone up for a battle?", "Nice weather in PALLET TOWN.", "Where is PROF. OAK?", "brb", "Trading PIDGEY, anyone?", "GG!", "I love my MOM's cooking."];
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
    first: { type: "string", default: "1" },
    chat: { type: "boolean", default: false },
    flood: { type: "boolean", default: false },
    say: { type: "string", multiple: true, default: [] },
    verbose: { type: "boolean", default: false },
    idle: { type: "boolean", default: false },
    stay: { type: "boolean", default: false },
    ramp: { type: "boolean", default: false },
    map2: { type: "string", default: "" },
    hold: { type: "string", default: "30" },
    friend: { type: "string", default: "0" },
  },
});
const base = new URL(args.url);
const count = Number(args.count);
const first = Number(args.first);
if (!args.secret) fail("no secret: set BOTS_SECRET in .env (and restart mic-core) or pass --secret");
if (!Number.isInteger(count) || count < 1 || count > 500) fail("--count must be 1 to 500");
if (!Number.isInteger(first) || first < 1 || first > 500) fail("--first must be 1 to 500");
const stay = args.stay || args.ramp;
const map2 = args.map2 || (args.map.endsWith("_1f") ? args.map.replace(/_1f$/, "_2f") : args.map.replace(/_2f$/, "_1f"));
const hold = Number(args.hold);
if (!(hold > 0)) fail("--hold must be a number of seconds");

const maps = new Map<string, ClientMap>();
function loadMap(id: string): ClientMap {
  let m = maps.get(id);
  if (!m) {
    m = fromBinary(ClientMapSchema, readFileSync(new URL(`spa-pokeuniverse/public/maps/${id}.binpb`, ROOT)));
    maps.set(id, m);
  }
  return m;
}

const stats = { steps: 0, corrections: 0, messages: 0, bytes: 0, battles: 0, reconnects: 0, events: 0, zoneFrames: 0, chat: 0, pings: [] as number[] };
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
  /** The trainer's account ID (Welcome): events about it are ignored (phase-8 D7). */
  private id = 0n;
  /** The other players in the zone, by account ID. */
  readonly others = new Map<bigint, OtherPlayer>();
  connected = false;
  /** The bot's account ID (from the spawn), for the friend routes. */
  accountId = 0n;
  private get verbose(): boolean {
    return args.verbose && this.n === first + count - 1;
  }

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
        this.id = msg.value.accountId;
        this.retries = 0;
        this.send({ case: "enterWorld", value: { takeOver: this.firstEntry() } });
        break;
      case "snapshot": {
        const p = msg.value.player;
        this.place(msg.value.map, p?.x ?? 0, p?.y ?? 0, p?.facing ?? Direction.SOUTH);
        this.canRun = msg.value.canRun;
        this.meet(msg.value.map, msg.value.others);
        if (!this.connected) {
          this.connected = true;
          this.every(PING_EVERY_MS, () => this.send({ case: "ping", value: { clientTime: BigInt(Date.now()) } }));
          this.startChat();
        }
        if (!this.walking && !(this.verbose && args.idle)) this.walk();
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
        this.meet(msg.value.map, msg.value.others);
        break;
      case "zoneEvents":
        stats.zoneFrames++;
        for (const e of msg.value.events) this.zoneEvent(e);
        break;
      case "script":
        this.send({ case: "scriptDone", value: { script: msg.value.id } });
        break;
      case "battleStarted":
        // Bots stay off the test grass; a battle here is a bug to look at.
        stats.battles++;
        console.warn(`bot-${this.n}: in a battle at ${this.x},${this.y}`);
        break;
      case "social":
        if (this.verbose) console.log(`bot-${this.n}: social ${JSON.stringify(toJson(SocialEventSchema, msg.value))}`);
        break;
      case "error":
        if (msg.value.code !== ErrorCode.TOKEN_EXPIRED) console.warn(`bot-${this.n}: error ${ErrorCode[msg.value.code]}`);
        break;
    }
  }

  private said = 0;
  /** --chat, --flood and --say, from each (re)connect. */
  private startChat(): void {
    const say = (text: string) => this.send({ case: "sendChat", value: { text } });
    if (args.flood) this.every(FLOOD_EVERY_MS, () => say(`FLOOD ${++this.said}`));
    if (args.chat) {
      const next = () => this.after(20_000 + Math.random() * 40_000, () => (say(pick(LINES)), next()));
      next();
    }
    args.say.forEach((text, i) => this.after(SAY_EVERY_MS * (i + 1), () => say(text)));
  }

  /** A new zone (snapshot or warp): the others are exactly those listed. */
  private meet(map: string, others: OtherPlayer[]): void {
    this.others.clear();
    for (const o of others) this.others.set(o.id, o);
    if (this.verbose) console.log(`bot-${this.n}: on ${map} with ${others.map(who).join(", ") || "no one"}`);
  }

  private zoneEvent(e: ZoneEvent): void {
    const ev = e.event;
    if (ev.case === undefined) return;
    const id = ev.case === "joined" ? (ev.value.player?.id ?? 0n) : ev.value.id;
    if (ev.case === "chat") {
      // Own lines too: the client shows its own line only when it comes back (phase-8 M5).
      stats.chat++;
      const name = id === this.id ? `BOT${this.n} (own)` : (this.others.get(id)?.name ?? `${id} (unknown player)`);
      if (this.verbose) console.log(`bot-${this.n}: chat ${name}: ${JSON.stringify(ev.value.text)}`);
      return;
    }
    if (id === this.id) return;
    stats.events++;
    const o = this.others.get(id);
    let text: string;
    switch (ev.case) {
      case "joined": {
        const p = ev.value.player!;
        this.others.set(id, p); // A snapshot may already list it (sent before this tick's events).
        text = `${who(p)} joined at ${p.x},${p.y}`;
        break;
      }
      case "left":
        this.others.delete(id);
        text = `${o ? who(o) : id} left`;
        break;
      case "moved":
        if (o) Object.assign(o, { x: ev.value.x, y: ev.value.y, facing: ev.value.facing });
        text = `${o ? o.name : id} ${ev.value.run ? "ran" : "walked"} ${Direction[ev.value.facing]} to ${ev.value.x},${ev.value.y}`;
        break;
      case "turned":
        if (o) o.facing = ev.value.facing;
        text = `${o ? o.name : id} turned ${Direction[ev.value.facing]}`;
        break;
      case "follower":
        if (o) o.follower = ev.value.follower;
        text = `${o ? o.name : id} follower ${ev.value.follower ? `#${ev.value.follower.species}${ev.value.follower.shiny ? " shiny" : ""}` : "none"}`;
        break;
      case "battle":
        if (o) o.inBattle = ev.value.inBattle;
        text = `${o ? o.name : id} ${ev.value.inBattle ? "entered" : "left"} a battle`;
        break;
    }
    if (!o && ev.case !== "joined" && ev.case !== "left") text += " (unknown player)";
    if (this.verbose) console.log(`bot-${this.n}: ${text}`);
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
      if (!stay && Math.random() < 0.15) {
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

/** One spawn call (up to 100 bots): bot-<first> … on `map`. */
async function spawn(refreshOnly: boolean, from = first, n = count, map = args.map): Promise<SpawnedBot[]> {
  const res = await fetch(new URL("/api/dev/bots", base), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Bots-Secret": args.secret },
    body: JSON.stringify(toJson(SpawnBotsSchema, create(SpawnBotsSchema, { count: n, first: from, map, refreshOnly }))),
  });
  if (!res.ok) fail(`POST /api/dev/bots: ${res.status} ${(await res.text()).trim()}${res.status === 404 ? " (is BOTS_SECRET set for mic-core?)" : ""}`);
  return fromJson(SpawnedBotsSchema, await res.json()).bots;
}

/** Renews every bot's token of one spawn call a minute before it expires. */
function scheduleRenewal(spawned: SpawnedBot[], bots: Map<number, Bot>, from = first, n = count): void {
  const expires = Math.min(...spawned.map((b) => Number(b.expiresAt) * 1000));
  setTimeout(async () => {
    try {
      const fresh = await spawn(true, from, n);
      for (const b of fresh) bots.get(b.n)?.renew(b.accessToken);
      scheduleRenewal(fresh, bots, from, n);
    } catch (err) {
      console.warn(`token renewal failed: ${err}; retrying`);
      scheduleRenewal(spawned.map((b) => ({ ...b, expiresAt: BigInt(Math.floor(Date.now() / 1000) + 70) })), bots, from, n);
    }
  }, Math.max(expires - Date.now() - 60_000, 5_000)).unref();
}

function printStats(bots: Bot[], secs = STATS_EVERY_MS / 1000): void {
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
      (stats.battles ? ` | battles ${stats.battles}` : "") +
      (stats.chat ? ` | chat lines ${stats.chat}` : "") +
      ` | zone: ${(stats.events / secs).toFixed(1)} events/s, ${(stats.zoneFrames / secs / per).toFixed(1)} frames/s per bot` +
      `, others known ${othersKnown(bots)}`,
  );
  Object.assign(stats, { steps: 0, corrections: 0, messages: 0, bytes: 0, battles: 0, reconnects: 0, events: 0, zoneFrames: 0, chat: 0, pings: [] });
}

/** The fewest and most others a connected bot knows: equal once every bot sees the whole zone. */
function othersKnown(bots: Bot[]): string {
  const sizes = bots.filter((b) => b.connected).map((b) => b.others.size);
  if (!sizes.length) return "-";
  const [lo, hi] = [Math.min(...sizes), Math.max(...sizes)];
  return lo === hi ? `${lo}` : `${lo}-${hi}`;
}

function who(p: OtherPlayer): string {
  return `${p.name} (${p.id})${p.inBattle ? " (in battle)" : ""}`;
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

const byN = new Map<number, Bot>();

/** Spawns and connects bot-<from> … bot-<from+n-1> on `map`, in calls of up to 100. */
async function add(from: number, n: number, map: string): Promise<void> {
  for (let i = 0; i < n; i += 100) {
    const k = Math.min(100, n - i);
    const spawned = await spawn(false, from + i, k, map);
    for (const s of spawned) {
      const b = new Bot(s.n, s.accessToken);
      b.accountId = s.accountId;
      byN.set(s.n, b);
      b.connect();
    }
    scheduleRenewal(spawned, byN, from + i, k);
  }
}

/** A friend route as bot b (phase-9 M1); prints a failure. */
async function social(b: Bot, method: string, path: string, body?: unknown): Promise<boolean> {
  const res = await fetch(new URL(path, base), {
    method,
    headers: { Authorization: `Bearer ${b.token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) console.warn(`bot-${b.n}: ${method} ${path}: ${res.status} ${(await res.text()).trim()}`);
  return res.ok;
}

/** --friend n: the last bot asks bot-<first> … bot-<first+n-1>, and each accepts. */
async function befriend(n: number): Promise<void> {
  const last = byN.get(first + count - 1);
  if (!last) return;
  let made = 0;
  for (let k = first; k < first + n && k < first + count - 1; k++) {
    const b = byN.get(k);
    if (!b) continue;
    if (!(await social(last, "POST", "/api/social/friends/requests", { id: String(b.accountId) }))) continue;
    if (await social(b, "POST", `/api/social/friends/requests/${last.accountId}/accept`)) made++;
  }
  console.log(`bot-${last.n}: ${made} friends made`);
}

/** Every replica's stats: the load balancer picks one per request, so ask until both answered. */
async function replicaStats(): Promise<ReplicaStats[]> {
  const seen = new Map<string, ReplicaStats>();
  for (let i = 0; i < 12 && seen.size < 2; i++) {
    const res = await fetch(new URL("/api/dev/stats", base), { headers: { "X-Bots-Secret": args.secret } });
    if (!res.ok) fail(`GET /api/dev/stats: ${res.status}`);
    const s = fromJson(ReplicaStatsSchema, await res.json());
    seen.set(s.replica, s);
  }
  return [...seen.values()];
}

function printServer(all: ReplicaStats[]): void {
  for (const r of all) {
    const d = r.drops!;
    console.log(`  replica ${r.replica.slice(0, 8)}: drops intent rate/size/invalid ${d.intentRate}/${d.intentSize}/${d.intentInvalid}, chat rate/invalid ${d.chatRate}/${d.chatInvalid}, slow consumers ${d.slowConsumers}`);
    for (const z of r.zones) {
      console.log(
        `    ${z.map}: local ${z.localPlayers} remote ${z.remotePlayers} | ${z.eventsPerTick.toFixed(1)} events/tick | tick p50 ${(z.tickP50Us / 1000).toFixed(2)}ms p99 ${(z.tickP99Us / 1000).toFixed(2)}ms` +
          ` | ${(Number(z.bytesPerSecond) / 1024).toFixed(1)} KB/s (${(Number(z.bytesPerSecond) / Math.max(z.localPlayers, 1) / 1024).toFixed(2)} KB/s per player)` +
          ` | NATS in ${z.batchesIn} out ${z.batchesOut} | corrections ${z.corrections} | dropped intents ${z.droppedIntents} chats ${z.droppedChats}`,
      );
    }
  }
}

function printDocker(): void {
  try {
    const out = execFileSync("docker", ["stats", "--no-stream", "--format", "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"], { encoding: "utf8" });
    for (const line of out.trim().split("\n").filter((l) => l.startsWith("pokeuniverse-")).sort()) console.log(`  docker ${line.replaceAll("\t", "  ")}`);
  } catch (err) {
    console.warn(`docker stats: ${err}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ramp(): Promise<void> {
  const plan: [number, number][] = [[25, 0], [50, 0], [100, 0], [200, 0], [250, 250]];
  let on1 = 0;
  let on2 = 0;
  console.log(`ramp on ${args.map} (then ${map2}) (${base.origin}): settle 10 s, hold ${hold} s per step, Ctrl-C to stop`);
  for (const [a, b] of plan) {
    await add(first + on1, a - on1, args.map);
    await add(first + 500 + on2, b - on2, map2);
    [on1, on2] = [a, b];
    await sleep(10_000);
    Object.assign(stats, { steps: 0, corrections: 0, messages: 0, bytes: 0, battles: 0, reconnects: 0, events: 0, zoneFrames: 0, chat: 0, pings: [] });
    const cpu = process.cpuUsage();
    await sleep(hold * 1000);
    const used = process.cpuUsage(cpu);
    console.log(`\n== step ${a + b} bots (${a} on ${args.map}${b ? `, ${b} on ${map2}` : ""}); bot process CPU ${(((used.user + used.system) / 1e6 / hold) * 100).toFixed(0)}%`);
    printStats([...byN.values()], hold);
    printServer(await replicaStats());
    printDocker();
  }
  console.log("\nramp done; bots keep walking, Ctrl-C to stop");
}

let statsTimer: ReturnType<typeof setInterval> | undefined;
if (args.ramp) {
  void ramp();
} else {
  await add(first, count, args.map);
  if (Number(args.friend) > 0) setTimeout(() => void befriend(Number(args.friend)), 2000);
  console.log(`${count} bots on ${args.map} (${base.origin}); stats every ${STATS_EVERY_MS / 1000} s, Ctrl-C to stop`);
  statsTimer = setInterval(() => printStats([...byN.values()]), STATS_EVERY_MS);
}

process.on("SIGINT", () => {
  if (stopping) process.exit(1);
  stopping = true;
  clearInterval(statsTimer);
  for (const b of byN.values()) b.close();
  console.log("closing…");
  setTimeout(() => process.exit(0), 500);
});
