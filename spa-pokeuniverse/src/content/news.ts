// Static news entries shown on the home page. Newest first.

export type NewsEntry = { date: string; tag: string; title: string; body: string };

export const news: NewsEntry[] = [
  {
    date: "2026-10-30",
    tag: "Accounts",
    title: "Trainer accounts are open",
    body: "Continue with Google to create your trainer. Keep playing and you stay signed in: sessions renew for 30 days every time you come back.",
  },
  {
    date: "2026-10-30",
    tag: "Kanto",
    title: "Kanto is under construction",
    body: "Maps, movement and the first towns come next, starting with Pallet Town. Every step will be decided by the server, so the world is the same for everyone.",
  },
  {
    date: "2026-10-30",
    tag: "Platform",
    title: "Install it like an app",
    body: "PokeUniverse runs in Safari, Chrome, Edge and Firefox. On your phone, add it to your home screen to play full screen.",
  },
];

export type Milestone = { title: string; detail: string; state: "done" | "now" | "next" };

/** Road to the MVP (docs/phases). */
export const roadmap: Milestone[] = [
  { title: "Foundations", detail: "Servers, contracts and infrastructure", state: "done" },
  { title: "Web app and accounts", detail: "Sign in, home and sessions", state: "now" },
  { title: "Maps and art", detail: "Kanto's maps in the new format", state: "next" },
  { title: "Walk the world", detail: "Movement, warps and controls", state: "next" },
  { title: "Play together", detail: "Other trainers and chat", state: "next" },
  { title: "Pokémon and battles", detail: "Your team, wild encounters, Gen 4 rules", state: "next" },
];
