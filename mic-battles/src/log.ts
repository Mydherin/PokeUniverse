// JSON logs on stdout, one line per entry, in the same shape as mic-core (Go slog).

type Level = "INFO" | "WARN" | "ERROR";

function write(level: Level, msg: string, attrs: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify({ time: new Date().toISOString(), level, msg, ...attrs }) + "\n");
}

export const log = {
  info: (msg: string, attrs: Record<string, unknown> = {}) => write("INFO", msg, attrs),
  warn: (msg: string, attrs: Record<string, unknown> = {}) => write("WARN", msg, attrs),
  error: (msg: string, attrs: Record<string, unknown> = {}) => write("ERROR", msg, attrs),
};
