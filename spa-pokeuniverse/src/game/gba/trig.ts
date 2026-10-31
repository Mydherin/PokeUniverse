// Fixed-point math the GBA games use, so motion matches the original frame by frame.

/** 256 steps per turn, 8.8 values (256 = 1.0), plus a quarter turn so cos(i) = SIN[i + 64]. */
export const SIN = Int16Array.from({ length: 320 }, (_, i) => Math.trunc(Math.sin((i * 2 * Math.PI) / 256) * 256));

/** The linear congruential step behind the games' random numbers (32-bit, unsigned). */
export const RAND_MULT = 1103515245;
export const randomize = (seed: number): number => (Math.imul(RAND_MULT, seed) + 24691) >>> 0;

/** Wraps a value to a signed 16-bit integer, as the games' s16 variables do. */
export const s16 = (v: number): number => (v << 16) >> 16;
