// The public base path the build is served under (Vite `base`, from BASE_PATH at build time):
// "/" normally, a prefix such as "/preview/<id>/" in a Mooi development preview. Always ends with "/".
// App paths stay root-relative ("/play", "/api/trainer"); these turn them into URLs and back.

// Outside Vite (the dev bots import the map rules under Node) there is no env: "/".
export const BASE: string = import.meta.env?.BASE_URL ?? "/";

/** The URL of an app path ("/api/trainer") under the base path. */
export function withBase(path: string): string {
  return BASE + path.replace(/^\//, "");
}

/** The app path of a URL path under the base path ("/preview/x/play" -> "/play"). */
export function appPath(pathname: string = location.pathname): string {
  return pathname.startsWith(BASE) ? `/${pathname.slice(BASE.length)}` : pathname;
}
