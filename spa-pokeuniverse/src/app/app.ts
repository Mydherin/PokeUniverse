import { getSession, onSessionChange, OfflineError, refresh } from "../auth/session";
import { loginPage } from "../pages/login";
import { homeShell, sections } from "../pages/home/shell";
import { playPage } from "../pages/play";
import { Router } from "./router";

export async function startApp(root: HTMLElement): Promise<void> {
  const router: Router = new Router(
    root,
    [
      { paths: ["/login"], auth: false, title: "Sign in", render: loginPage },
      { paths: sections.map((s) => s.path), auth: true, title: "PokeUniverse", render: (path) => homeShell(path, (p) => router.go(p)) },
      { paths: ["/play"], auth: true, title: "Play", render: playPage },
    ],
    "/",
    (route) => {
      const signedIn = getSession() !== null;
      if (route.auth && !signedIn) return "/login";
      if (!route.auth && signedIn) return "/";
      return null;
    },
  );

  // Restore the session from the refresh cookie before the first screen.
  try {
    await refresh();
  } catch (e) {
    if (!(e instanceof OfflineError)) throw e;
    if (location.pathname !== "/login") history.replaceState(null, "", "/login?error=offline");
  }

  // Signing out (here or in another tab) or an expired session returns to the login screen.
  onSessionChange((session) => {
    if (!session && location.pathname !== "/login") router.go("/login", true);
  });

  await router.render();
}
