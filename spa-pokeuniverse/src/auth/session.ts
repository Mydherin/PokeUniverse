// Client session: the access token lives in memory only; the refresh token is an
// HttpOnly cookie the browser sends to /auth (tech-stack.md#authentication).

import { fromJson } from "@bufbuild/protobuf";
import { RefreshResponseSchema, type Account } from "@pokeuniverse/contracts/auth/v1/auth";

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
  inflight ??= (navigator.locks ? navigator.locks.request("pokeuniverse-refresh", requestRefresh) : requestRefresh()).finally(
    () => (inflight = null),
  );
  return inflight;
}

export async function logout(): Promise<void> {
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

// Signing out in one tab signs out every tab.
channel?.addEventListener("message", (e) => {
  if (e.data === "logout") set(null);
});
