// mic-battles runs battles only. It never talks to players; only mic-core calls it, over NATS.

import { createServer } from "node:http";
import { connect } from "@nats-io/transport-node";
import { createClient, type RedisClientType } from "redis";
import { Battles } from "./battles.ts";
import { loadConfig } from "./config.ts";
import { subscribe } from "./handlers.ts";
import { log } from "./log.ts";
import { checkRules } from "./rules.ts";
import { Store } from "./store.ts";

async function main(): Promise<void> {
  const cfg = loadConfig();
  checkRules();

  const [host, port] = cfg.redisAddr.split(":");
  const redis = createClient({ socket: { host, port: Number(port) }, username: cfg.redisUser, password: cfg.redisPassword });
  redis.on("error", (err) => log.warn("redis error", { err: String(err) }));
  await redis.connect();

  const nc = await connect({
    servers: cfg.natsUrl,
    name: "mic-battles",
    user: cfg.natsUser,
    pass: cfg.natsPassword,
    maxReconnectAttempts: -1,
  });
  subscribe(nc, new Battles(new Store(redis as RedisClientType)));

  // Liveness and readiness for the container healthcheck (internal network only).
  const http = createServer((req, res) => {
    const ok = req.url === "/healthz" || (req.url === "/readyz" && !nc.isClosed() && !nc.isDraining() && redis.isReady);
    res.writeHead(ok ? 200 : 503).end();
  });
  http.listen(cfg.httpPort, () => log.info("mic-battles listening", { port: cfg.httpPort }));

  const shutdown = async () => {
    log.info("shutting down");
    http.close();
    await nc.drain();
    await redis.close();
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

main().catch((err) => {
  log.error("mic-battles stopped", { err: String(err) });
  process.exit(1);
});
