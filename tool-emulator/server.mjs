// Serves the original FireRed in EmulatorJS, to compare it with our game, and keeps its save states as files.
// Usage: node server.mjs <port>. Folders (gitignored): rom/firered.gba, vendor/ (EmulatorJS), states/.
import { createServer } from "node:http";
import { readFile, writeFile, readdir, mkdir, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";

const root = import.meta.dirname;
const port = Number(process.argv[2] ?? 8090);
const statesDir = join(root, "states");

const types = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".wasm": "application/wasm", ".png": "image/png", ".svg": "image/svg+xml",
};

// Only plain names, so a state can never be written outside states/.
const validName = (name) => /^[\w.-]{1,80}$/.test(name) && !name.startsWith(".");

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function sendFile(res, path) {
  try {
    const data = await readFile(path);
    res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404).end("not found");
  }
}

// Newest first, each with its screenshot when there is one.
async function listStates() {
  await mkdir(statesDir, { recursive: true });
  const files = (await readdir(statesDir)).filter((f) => f.endsWith(".state"));
  const states = await Promise.all(files.map(async (f) => ({
    name: f.slice(0, -".state".length),
    savedAt: (await stat(join(statesDir, f))).mtimeMs,
  })));
  return states.sort((a, b) => b.savedAt - a.savedAt);
}

async function handleStates(req, res, name) {
  if (!name) {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(await listStates()));
  }
  const file = name.replace(/\.(state|png)$/, "");
  if (!validName(file)) return res.writeHead(400).end("bad name");
  if (req.method === "PUT") {
    await mkdir(statesDir, { recursive: true });
    await writeFile(join(statesDir, name), await readBody(req));
    return res.writeHead(204).end();
  }
  return sendFile(res, join(statesDir, name));
}

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (path.startsWith("/states")) return handleStates(req, res, path.slice("/states/".length));
  if (path === "/firered.gba") return sendFile(res, join(root, "rom", "firered.gba"));
  if (path.startsWith("/emulatorjs/")) {
    const file = normalize(path.slice("/emulatorjs/".length));
    if (file.startsWith("..")) return res.writeHead(400).end();
    return sendFile(res, join(root, "vendor", file));
  }
  if (path === "/" || path === "/index.html") return sendFile(res, join(root, "index.html"));
  res.writeHead(404).end("not found");
}).listen(port, () => console.log(`FireRed emulator on http://localhost:${port}`));
