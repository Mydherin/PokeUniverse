import type { View } from "../app/router";
import { Species } from "../assets/sprites";
import { h, trusted } from "../ui/dom";
import { horizon, sprite, starfield, wordmark } from "../ui/art";
import { icon, type IconName } from "../ui/icons";

const errors: Record<string, string> = {
  cancelled: "Sign-in was cancelled. You can try again whenever you're ready.",
  expired: "That sign-in took too long. Please try again.",
  failed: "We couldn't sign you in with Google. Please try again.",
  unavailable: "Google sign-in isn't available right now. Please try again in a moment.",
  offline: "We can't reach the PokeUniverse servers. Check your connection and try again.",
};

const features: { icon: IconName; title: string; body: string }[] = [
  { icon: "sparkle", title: "Gen 3 art, Gen 4 Pokémon", body: "All 493 Pokémon and Gen 4 battle rules, in classic pixel art." },
  { icon: "users", title: "One shared world", body: "Explore Kanto with other trainers, live." },
  { icon: "device", title: "Any screen", body: "Play in the browser on phone or desktop. Nothing to install." },
];

export function loginPage(): View {
  const error = errors[new URLSearchParams(location.search).get("error") ?? ""];

  const signIn = h(
    "a",
    {
      href: "/auth/google",
      class:
        "btn w-full gap-3 rounded-full border border-[#747775] bg-white text-[15px] font-medium text-[#1f1f1f] hover:bg-[#f2f2f2] font-[Roboto,system-ui,sans-serif]",
      on: { click: () => signIn.setAttribute("aria-busy", "true") },
    },
    googleLogo(),
    "Continue with Google",
  );

  const card = h(
    "section",
    { class: "panel w-full max-w-md p-6 sm:p-8 animate-rise", "aria-labelledby": "login-title" },
    h("h1", { id: "login-title", class: "font-display text-3xl font-bold leading-tight sm:text-4xl" }, "Your journey starts here"),
    h("p", { class: "mt-3 text-ink-muted" }, "Sign in or create your trainer in one step."),
    error &&
      h(
        "p",
        { role: "alert", class: "mt-5 rounded-xl border border-berry-400/40 bg-berry-400/10 px-4 py-3 text-sm text-ink" },
        error,
      ),
    h("div", { class: "mt-6" }, signIn),
    h(
      "p",
      { class: "mt-5 flex items-start gap-2 text-sm text-ink-muted" },
      icon("shield", "mt-0.5 size-4 shrink-0 text-leaf-400"),
      "We never see or store your password. Google only confirms who you are.",
    ),
  );

  const hero = h(
    "div",
    { class: "w-full max-w-xl text-center lg:text-left" },
    h("p", { class: "chip mx-auto lg:mx-0" }, h("span", { class: "size-2 rounded-full bg-leaf-400" }), "Fan-made MMO · Free forever"),
    h("div", { class: "mt-5" }, wordmark("text-5xl sm:text-6xl lg:text-7xl")),
    h(
      "p",
      { class: "mx-auto mt-4 max-w-md text-lg text-ink-soft lg:mx-0" },
      "A whole Pokémon world, live in your browser. Catch, battle and trade with trainers everywhere.",
    ),
    h(
      "ul",
      { class: "mt-8 hidden gap-4 lg:grid" },
      ...features.map((f) =>
        h(
          "li",
          { class: "flex items-start gap-3" },
          h("span", { class: "grid size-10 shrink-0 place-items-center rounded-xl bg-night-700 text-volt-300" }, icon(f.icon)),
          h("span", {}, h("span", { class: "block font-semibold" }, f.title), h("span", { class: "block text-sm text-ink-muted" }, f.body)),
        ),
      ),
    ),
  );

  const el = h(
    "main",
    { class: "relative isolate flex min-h-dvh flex-col overflow-hidden bg-gradient-to-b from-night-700 via-night-900 to-night-950" },
    starfield(),
    h("div", { class: "pointer-events-none absolute -top-40 left-1/2 -z-10 size-[36rem] -translate-x-1/2 rounded-full bg-night-500/30 blur-3xl", "aria-hidden": "true" }),
    floatingSprites(),
    h(
      "div",
      { class: "safe-x safe-top relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-10 pb-40 pt-10 lg:flex-row lg:justify-between lg:gap-16" },
      hero,
      card,
    ),
    horizon(),
    h(
      "footer",
      { class: "safe-x safe-bottom relative z-10 mx-auto w-full max-w-6xl text-center text-xs text-ink-muted lg:text-left" },
      "Non-commercial fan project. Pokémon © Nintendo, Creatures Inc. and GAME FREAK inc.",
    ),
  );

  return { el };
}

/** Pokémon standing on the hills, away from the content; fewer on small screens. */
function floatingSprites(): HTMLElement {
  const placed: [number, string, string][] = [
    [Species.pikachu, "left-[6%] bottom-12 size-20 sm:bottom-16 sm:size-24", "0s"],
    [Species.charmander, "left-[24%] bottom-14 hidden size-24 sm:block sm:bottom-20", "1.2s"],
    [Species.squirtle, "right-[24%] bottom-14 hidden size-24 sm:block sm:bottom-20", "2.1s"],
    [Species.bulbasaur, "right-[6%] bottom-12 size-20 sm:bottom-16 sm:size-24", "0.6s"],
    [Species.mew, "left-[44%] bottom-24 hidden size-20 md:block", "2.6s"],
    [Species.dragonite, "right-[4%] top-[6%] hidden size-28 xl:block", "1.8s"],
  ];
  const layer = h("div", { class: "pointer-events-none absolute inset-0 z-0", "aria-hidden": "true" });
  for (const [species, position, delay] of placed) {
    const img = sprite(species, `absolute animate-float opacity-90 drop-shadow-[0_8px_12px_rgba(0,0,0,0.5)] ${position}`);
    img.loading = "eager";
    img.style.setProperty("animation-delay", delay);
    layer.append(img);
  }
  return layer;
}

/** Google's "G" mark, as required by Google's sign-in branding guidelines. */
function googleLogo(): Element {
  return trusted(`<svg class="size-5" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>`);
}
