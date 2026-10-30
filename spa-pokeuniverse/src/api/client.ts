// HTTP API client for mic-core's /api endpoints (tech-stack.md#communication).
// Adds the in-memory access token; on 401 it refreshes once and retries.

import { getSession, refresh } from "../auth/session";

/** A non-2xx answer from the API. 401: not signed in; 403: missing role. */
export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`api error ${status}`);
  }
}

export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  let res = await send(path, init, getSession()?.accessToken);
  // The token may have expired in a background tab before the timer refreshed it.
  if (res.status === 401) {
    const session = await refresh();
    if (session) res = await send(path, init, session.accessToken);
  }
  if (!res.ok) throw new ApiError(res.status);
  return res;
}

function send(path: string, init: RequestInit, token: string | undefined): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(path, { ...init, headers, credentials: "same-origin" });
}
