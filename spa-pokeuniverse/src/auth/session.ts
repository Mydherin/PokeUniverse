// Client session: the access token lives in memory only; the refresh token is an
// HttpOnly cookie the browser sends to /auth (tech-stack.md#authentication).

import { create, fromJson } from "@bufbuild/protobuf";
import { AccountSchema, RefreshResponseSchema, type Account } from "@pokeuniverse/contracts/auth/v1/auth";

export type Session = {
  accessToken: string;
  expiresAt: number;
  account: Account;
};

type Listener = (session: Session | null) => void;

/** Thrown when the server can't be reached (as opposed to "not signed in"). */
export class OfflineError extends Error {}

const REFRESH_EARLY_MS = 60_000;
const channel = "BroadcastChannel" in window ? new BroadcastChannel("pokeuniverse-auth") : null;

// Dev builds only (phase-8 D16): /play?bot=<token> plays a bot account of infra/bots instead of the
// Google one, so a second tab can be a second player. The token is kept for the tab and not renewed.
const botToken = import.meta.env.DEV || import.meta.env.VITE_BOT_LOGIN === "1" ? takeBotToken() : null;

let current: Session | null = null;
let inflight: Promise<Session | null> | null = null;
let timer: number | undefined;
const listeners = new Set<Listener>();

export function getSession(): Session | null {
  return current;
}

export function onSessionChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Gets a fresh access token by rotating the refresh cookie.
 * One refresh at a time per tab, and across tabs via the Web Locks API,
 * so two tabs never send the same (soon revoked) refresh token.
 */
export function refresh(): Promise<Session | null> {
  if (botToken) return Promise.resolve(current ?? botSession(botToken));
  inflight ??= (navigator.locks ? navigator.locks.request("pokeuniverse-refresh", requestRefresh) : requestRefresh()).finally(
    () => (inflight = null),
  );
  return inflight;
}

export async function logout(): Promise<void> {
  if (botToken) return set(null);
  try {
    await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
  } catch {
    // Signing out locally still matters even if the server is unreachable.
  }
  set(null);
  channel?.postMessage("logout");
}

async function requestRefresh(): Promise<Session | null> {
  let res: Response;
  try {
    res = await fetch("/auth/refresh", { method: "POST", credentials: "same-origin" });
  } catch {
    throw new OfflineError("server unreachable");
  }
  if (res.status === 401) {
    set(null);
    return null;
  }
  if (!res.ok) throw new OfflineError(`refresh failed: ${res.status}`);
  const body = fromJson(RefreshResponseSchema, await res.json());
  set({
    accessToken: body.accessToken,
    expiresAt: Date.now() + body.expiresInSeconds * 1000,
    account: body.account!,
  });
  return current;
}

function set(session: Session | null): void {
  current = session;
  window.clearTimeout(timer);
  if (session) {
    const wait = Math.max(session.expiresAt - Date.now() - REFRESH_EARLY_MS, 5_000);
    timer = window.setTimeout(() => void refresh().catch(retryLater), wait);
  }
  for (const listener of listeners) listener(session);
}

function retryLater(): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void refresh().catch(retryLater), 15_000);
}

// Background tabs throttle timers: refresh as soon as the tab is visible again if needed.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && current && current.expiresAt - Date.now() < REFRESH_EARLY_MS * 2) {
    void refresh().catch(retryLater);
  }
});

// Signing out in one tab signs out every tab (but a bot's).
channel?.addEventListener("message", (e) => {
  if (e.data === "logout" && !botToken) set(null);
});

function takeBotToken(): string | null {
  const url = new URL(location.href);
  const token = url.searchParams.get("bot");
  try {
    if (token) sessionStorage.setItem("pokeuniverse-bot", token);
    else return sessionStorage.getItem("pokeuniverse-bot");
  } catch {
    // No storage: the token lasts until the page reloads.
  }
  url.searchParams.delete("bot");
  history.replaceState(history.state, "", url);
  return token;
}

/** The session a bot's access token stands for (its claims; the server checks the signature). */
function botSession(token: string): Session {
  const claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { sub: string; exp: number; roles: string[] };
  const session = {
    accessToken: token,
    expiresAt: claims.exp * 1000,
    account: create(AccountSchema, { id: BigInt(claims.sub), displayName: `bot ${claims.sub}`, roles: claims.roles }),
  };
  set(session);
  return session;
}
