// AI_PreferStrongestMove. As in FireRed, it encourages the moves get_how_powerful_move_is calls
// "discouraged" (status moves, Explosion…): the script's comparison is inverted.

import type { AiView, Considered } from "../view.ts";

export function preferStrongestMove(v: AiView, c: Considered): number {
  return v.power(c) === "discouraged" && !v.chance(100) ? 2 : 0;
}
