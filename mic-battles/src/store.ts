// Battles in Redis (phase-5 D2): hash battle:<id> with the Showdown state, our meta, the
// StartBattle and the last reply. A save only lands if the stored step is still the one played
// (Lua compare-and-set), so two replicas playing the same step can't both win.

import type { RedisClientType } from "redis";

export type Saved = {
  /** The step the next choices must carry. */
  step: number;
  /** StartBattle, base64. */
  start: string;
  /** Showdown's serialized battle (JSON). */
  state: string;
  /** Our own state (JSON): see battles.ts. */
  meta: string;
  /** The last BattleUpdate, base64: answered again for a repeated step. */
  reply: string;
};

/** Kept a week while active (a player may come back); an hour once over, for late retries. */
export const ACTIVE_TTL = 7 * 24 * 3600;
export const ENDED_TTL = 3600;

const SAVE = `
local current = redis.call('HGET', KEYS[1], 'step') or ''
if current ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[1], 'step', ARGV[2], 'start', ARGV[3], 'state', ARGV[4], 'meta', ARGV[5], 'reply', ARGV[6])
redis.call('EXPIRE', KEYS[1], ARGV[7])
return 1`;

const key = (id: string) => `battle:${id}`;

export class Store {
  constructor(private readonly redis: RedisClientType) {}

  async load(id: string): Promise<Saved | null> {
    const h = await this.redis.hGetAll(key(id));
    if (!h.step) return null;
    return { step: Number(h.step), start: h.start, state: h.state, meta: h.meta, reply: h.reply };
  }

  /** Saves if the stored step is still `expected` (undefined: the battle must not exist yet). */
  async save(id: string, expected: number | undefined, saved: Saved, ttl: number): Promise<boolean> {
    const args = [expected === undefined ? "" : String(expected), String(saved.step), saved.start, saved.state, saved.meta, saved.reply, String(ttl)];
    return (await this.redis.eval(SAVE, { keys: [key(id)], arguments: args })) === 1;
  }
}
