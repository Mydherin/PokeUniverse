import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// In `pnpm dev`, auth, API and WebSocket calls go to a mic-core running on the host.
const core = process.env.MIC_CORE_URL ?? "http://localhost:8081";

export default defineConfig({
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
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "any",
        background_color: "#0b0920",
        theme_color: "#0b0920",
      },
      workbox: {
        // autoUpdate: a new release takes over at once (the page reloads) instead of waiting for every tab to close.
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/auth\//, /^\/api\//, /^\/ws/],
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // Phaser and FireRed's art and sound are large; they are cached on first play instead of on install.
        globIgnores: ["**/game-*.js", "firered/**"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/assets/game-"),
            handler: "CacheFirst",
            options: { cacheName: "game-engine", expiration: { maxEntries: 4 } },
          },
          {
            // Not hashed: `make assets` can render a file again under the same name (e.g. the sound
            // manifest's loop points), so the network comes first (a cheap 304 when unchanged), the cache offline.
            urlPattern: ({ url }) => url.pathname.startsWith("/firered/"),
            handler: "NetworkFirst",
            options: { cacheName: "firered", expiration: { maxEntries: 300 } },
          },
          {
            // Compiled by `make maps` under the same names, like FireRed's files.
            urlPattern: ({ url }) => url.pathname.startsWith("/maps/"),
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
