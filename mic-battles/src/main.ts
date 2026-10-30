// mic-battles runs battles only. It never talks to players; only mic-core calls it, over NATS.

import { createServer } from "node:http";
import { connect } from "@nats-io/transport-node";
import { loadConfig } from "./config.ts";
import { subscribe } from "./handlers.ts";
import { log } from "./log.ts";
import { checkRules } from "./rules.ts";

async function main(): Promise<void> {
  const cfg = loadConfig();
  checkRules();

  const nc = await connect({
    servers: cfg.natsUrl,
    name: "mic-battles",
    user: cfg.natsUser,
    pass: cfg.natsPassword,
    maxReconnectAttempts: -1,
  });
  subscribe(nc);

  // Liveness and readiness for the container healthcheck (internal network only).
  const http = createServer((req, res) => {
    const ok = req.url === "/healthz" || (req.url === "/readyz" && !nc.isClosed() && !nc.isDraining());
    res.writeHead(ok ? 200 : 503).end();
  });
  http.listen(cfg.httpPort, () => log.info("mic-battles listening", { port: cfg.httpPort }));

  const shutdown = async () => {
    log.info("shutting down");
    http.close();
    await nc.drain();
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

main().catch((err) => {
  log.error("mic-battles stopped", { err: String(err) });
  process.exit(1);
});
