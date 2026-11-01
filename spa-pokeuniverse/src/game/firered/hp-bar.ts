// How FireRed sizes and colors an HP bar (battle_interface.c), shared by the party menu, the
// summary and the battle's healthboxes: the bar is 48 pixels long, green over half, yellow over
// a fifth, red below.

/** The HP bar's length in pixels (B_HEALTHBAR_NUM_PIXELS). */
export const HP_BAR_PIXELS = 48;

export const enum HpBarLevel {
  Empty,
  Red,
  Yellow,
  Green,
  Full,
}

/** GetScaledHPFraction: `hp` out of `maxHp` in `scale` pixels, at least 1 while it has HP. */
export function scaledHpFraction(hp: number, maxHp: number, scale: number): number {
  const fraction = maxHp > 0 ? Math.trunc((hp * scale) / maxHp) : 0;
  return fraction === 0 && hp > 0 ? 1 : fraction;
}

/** GetHPBarLevel. */
export function hpBarLevel(hp: number, maxHp: number): HpBarLevel {
  if (hp === maxHp) return HpBarLevel.Full;
  const fraction = scaledHpFraction(hp, maxHp, HP_BAR_PIXELS);
  if (fraction > (HP_BAR_PIXELS * 50) / 100) return HpBarLevel.Green;
  if (fraction > Math.trunc((HP_BAR_PIXELS * 20) / 100)) return HpBarLevel.Yellow;
  return fraction > 0 ? HpBarLevel.Red : HpBarLevel.Empty;
}
