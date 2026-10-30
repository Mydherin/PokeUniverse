// WebSocket to mic-core: Protocol Buffers envelopes, authenticated with the access token.

import { create, fromBinary, toBinary, type MessageInitShape } from "@bufbuild/protobuf";
import { ClientMessageSchema, ServerMessageSchema } from "@pokeuniverse/contracts/realtime/v1/realtime";
import { getSession, onSessionChange, refresh } from "../auth/session";

export type ConnectionStatus =
  | { state: "connecting" }
  | { state: "online"; accountId: bigint; latencyMs?: number }
  | { state: "offline"; retryInMs: number }
  | { state: "signed-out" };

const PING_EVERY_MS = 5_000;
// Close codes sent by mic-core when the token is missing, invalid or expired.
const AUTH_CLOSE_CODES = new Set([4001, 4002]);

export class Connection {
  private ws: WebSocket | null = null;
  private seq = 0;
  private attempts = 0;
  private pingTimer: number | undefined;
  private retryTimer: number | undefined;
  private stopped = false;
  private readonly unsubscribe: () => void;

  constructor(private readonly onStatus: (status: ConnectionStatus) => void) {
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

    ws.onopen = () => this.send({ case: "authenticate", value: { accessToken: getSession()?.accessToken ?? "" } });
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

  private receive(data: Uint8Array): void {
    const msg = fromBinary(ServerMessageSchema, data);
    switch (msg.payload.case) {
      case "welcome":
        this.attempts = 0;
        this.onStatus({ state: "online", accountId: msg.payload.value.accountId });
        this.ping();
        window.clearInterval(this.pingTimer);
        this.pingTimer = window.setInterval(() => this.ping(), PING_EVERY_MS);
        break;
      case "pong": {
        const latencyMs = Date.now() - Number(msg.payload.value.clientTime);
        const accountId = getSession()?.account.id ?? 0n;
        this.onStatus({ state: "online", accountId, latencyMs });
        break;
      }
      case "error":
        // The close event that follows decides what to do.
        break;
    }
  }

  private ping(): void {
    this.send({ case: "ping", value: { clientTime: BigInt(Date.now()) } });
  }

  private send(payload: MessageInitShape<typeof ClientMessageSchema>["payload"]): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(toBinary(ClientMessageSchema, create(ClientMessageSchema, { seq: ++this.seq, payload })));
  }

  private async reconnect(code: number): Promise<void> {
    window.clearInterval(this.pingTimer);
    this.ws = null;
    if (this.stopped) return;
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
