import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// In `pnpm dev`, auth, API and WebSocket calls go to a mic-core running on the host.
const core = process.env.MIC_CORE_URL ?? "http://localhost:8081";
// Public base path, with leading and trailing slash: "/" unless the build is served under a prefix
// (a Mooi development preview passes BASE_PATH, see src/app/base.ts).
const base = process.env.BASE_PATH || "/";
const under = (path: string) => base + path.replace(/^\//, "");

// The service worker's global, read only inside runtimeCaching's matchers.
declare const self: { registration: { scope: string } };

export default defineConfig({
  base,
  plugins: [
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      pwaAssets: { image: "public/icon.svg", preset: "minimal-2023", includeHtmlHeadLinks: true },
      manifest: {
        name: "PokeUniverse",
        short_name: "PokeUniverse",
        description: "A Pokémon MMO in your browser.",
        lang: "en",
        start_url: base,
        scope: base,
        display: "standalone",
        orientation: "any",
        background_color: "#0b0920",
        theme_color: "#0b0920",
      },
      workbox: {
        // autoUpdate: a new release takes over at once (the page reloads) instead of waiting for every tab to close.
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: under("/index.html"),
        navigateFallbackDenylist: [/^\/auth\//, /^\/api\//, /^\/ws/].map((r) => new RegExp(`^${under("/")}${r.source.slice(3)}`)),
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // Phaser and FireRed's art and sound are large; they are cached on first play instead of on install.
        globIgnores: ["**/game-*.js", "firered/**"],
        // Workbox copies these matchers into the service worker as source, so they can't use this file's
        // variables; the worker's scope is the base URL (the origin and "/" normally).
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.href.startsWith(`${self.registration.scope}assets/game-`),
            handler: "CacheFirst",
            options: { cacheName: "game-engine", expiration: { maxEntries: 4 } },
          },
          {
            // Not hashed: `make assets` can render a file again under the same name (e.g. the sound
            // manifest's loop points), so the network comes first (a cheap 304 when unchanged), the cache offline.
            urlPattern: ({ url }) => url.href.startsWith(`${self.registration.scope}firered/`),
            handler: "NetworkFirst",
            options: { cacheName: "firered", expiration: { maxEntries: 300 } },
          },
          {
            // Compiled by `make maps` under the same names, like FireRed's files.
            urlPattern: ({ url }) => url.href.startsWith(`${self.registration.scope}maps/`),
            handler: "NetworkFirst",
            options: { cacheName: "maps", expiration: { maxEntries: 500 } },
          },
          {
            urlPattern: ({ url }) => url.origin === "https://cdn.jsdelivr.net",
            handler: "CacheFirst",
            options: { cacheName: "sprites", expiration: { maxEntries: 500 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      "/auth": core,
      "/api": core,
      "/ws": { target: core, ws: true },
    },
  },
  build: { target: "es2022" },
});
