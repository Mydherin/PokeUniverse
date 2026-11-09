// AI_PreferBatonPass: with Baton Pass and a Pokémon to pass to, set up first.

import type { AiView, Considered } from "../view.ts";

export function preferBatonPass(v: AiView, c: Considered): number {
  if (!v.bench(v.user).length || v.power(c) !== "discouraged") return 0;
  if (!v.hasEffect(v.user, "BATON_PASS") && v.chance(80)) return 0;
  return v.chance(20) ? 0 : 3;
}
