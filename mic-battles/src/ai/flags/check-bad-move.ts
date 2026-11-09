// AI_CheckBadMove (FireRed's data/battle_ai_scripts.s): moves that would fail or do nothing, with
// Gen 4's abilities, hazards and field effects, and Emerald's Safeguard checks.

import type { Pokemon } from "../../engine/battle.ts";
import { absorbs, type AiView, type Considered } from "../view.ts";
import { isStatDown, isStatUp, statOf, type StatId } from "../effects.ts";

/** Statuses a type or ability prevents (Gen 4). */
function canStatus(v: AiView, t: Pokemon, status: string): boolean {
  if (v.status(t) || v.sideHas(t, "safeguard") || v.volatile(t, "substitute")) return false;
  const a = v.ability(t);
  if (a === "leafguard" && v.weather() === "sunnyday") return false;
  switch (status) {
    case "slp": return a !== "insomnia" && a !== "vitalspirit" && !v.sim.field.getPseudoWeather("uproar");
    case "psn": case "tox": return a !== "immunity" && !t.hasType("Poison") && !t.hasType("Steel");
    case "par": return a !== "limber";
    case "brn": return a !== "waterveil" && !t.hasType("Fire");
    default: return true;
  }
}

/** Abilities and effects that stop the target's stats from dropping. */
function blocksDrop(v: AiView, t: Pokemon, stat: StatId): boolean {
  const a = v.ability(t);
  if (a === "clearbody" || a === "whitesmoke" || v.sideHas(t, "mist") || v.volatile(t, "substitute")) return true;
  return (stat === "atk" && a === "hypercutter") || (stat === "accuracy" && a === "keeneye");
}

export function checkBadMove(v: AiView, c: Considered): number {
  const { user: u, target: t } = v;
  const e = c.effect;
  const a = v.ability(t);

  // Damaging moves the target is immune to.
  if (v.power(c) !== "discouraged") {
    if (v.effectiveness(c.move) === 0) return absorbs(c.move, t) ? -12 : -10;
  }
  // Gen 4: these abilities take status moves of their type too (Thunder Wave into Volt Absorb).
  if (c.move.category === "Status" && c.move.target !== "self" && absorbs(c.move, t)) return -12;
  if (c.move.flags.sound && a === "soundproof") return -10;

  const stat = statOf(e);
  if (isStatUp(e) && stat) return v.stage(u, stat) === 12 ? -10 : 0;
  if (isStatDown(e) && stat) {
    if (v.stage(t, stat) === 0 || blocksDrop(v, t, stat)) return -10;
    if (stat === "spe" && a === "speedboost") return -10;
    return 0;
  }

  switch (e) {
    case "SLEEP":
    case "YAWN":
      return canStatus(v, t, "slp") && !(e === "YAWN" && v.volatile(t, "yawn")) ? 0 : -10;
    case "POISON":
    case "TOXIC":
      return canStatus(v, t, "psn") ? 0 : -10;
    case "PARALYZE":
      return v.effectiveness(c.move) === 0 || !canStatus(v, t, "par") ? -10 : 0;
    case "WILL_O_WISP":
      return v.effectiveness(c.move) === 0 || !canStatus(v, t, "brn") ? -10 : 0;
    case "EXPLOSION":
      if (v.effectiveness(c.move) === 0 || a === "damp") return -10;
      if (v.bench(u).length) return 0;
      return v.bench(t).length ? -10 : -1;
    case "DREAM_EATER":
      if (v.effectiveness(c.move) === 0) return -10;
      return v.status(t, "slp") ? 0 : -8;
    case "NIGHTMARE":
      if (v.volatile(t, "nightmare")) return -10;
      return v.status(t, "slp") ? 0 : -8;
    case "BELLY_DRUM":
      return v.hp(u) < 51 || v.stage(u, "atk") === 12 ? -10 : 0;
    case "HAZE":
    case "PSYCH_UP": {
      const stats: StatId[] = ["atk", "def", "spe", "spa", "spd", "accuracy", "evasion"];
      const worth = stats.some((s) => v.stage(u, s) < 6 || v.stage(t, s) > 6);
      return worth ? 0 : -10;
    }
    case "ROAR":
      return !v.bench(t).length || a === "suctioncups" || v.volatile(t, "ingrain") ? -10 : 0;
    case "LIGHT_SCREEN":
    case "REFLECT":
    case "SAFEGUARD":
    case "MIST":
    case "TAILWIND": {
      const id = { LIGHT_SCREEN: "lightscreen", REFLECT: "reflect", SAFEGUARD: "safeguard", MIST: "mist", TAILWIND: "tailwind" }[e];
      return v.sideHas(u, id) ? (e === "TAILWIND" ? -10 : -8) : 0;
    }
    case "OHKO":
      if (v.effectiveness(c.move) === 0 || a === "sturdy") return -10;
      return u.level < t.level ? -10 : 0;
    case "MAGNITUDE":
      return !t.isGrounded() || v.effectiveness(c.move) === 0 ? -10 : 0;
    case "BIDE": case "CHARGE": case "SUPER_FANG": case "RECHARGE": case "LEVEL_DAMAGE": case "PSYWAVE":
    case "COUNTER": case "FLAIL": case "RETURN": case "PRESENT": case "SONICBOOM": case "MIRROR_COAT":
    case "FOCUS_PUNCH": case "SUPERPOWER": case "ENDEAVOR":
      return v.effectiveness(c.move) === 0 ? -10 : 0;
    case "FOCUS_ENERGY":
      return v.volatile(u, "focusenergy") ? -10 : 0;
    case "CONFUSE":
    case "SWAGGER":
    case "FLATTER":
      if (v.volatile(t, "confusion")) return -5;
      return a === "owntempo" || v.sideHas(t, "safeguard") || v.volatile(t, "substitute") ? -10 : 0;
    case "SUBSTITUTE":
      if (v.volatile(u, "substitute")) return -8;
      return v.hp(u) < 26 ? -10 : 0;
    case "LEECH_SEED":
      return v.volatile(t, "leechseed") || t.hasType("Grass") || v.volatile(t, "substitute") ? -10 : 0;
    case "DISABLE":
      return v.volatile(t, "disable") ? -8 : 0;
    case "ENCORE":
      return v.volatile(t, "encore") || !t.lastMove ? -8 : 0;
    case "TAUNT":
      return v.volatile(t, "taunt") ? -10 : 0;
    case "SNORE":
    case "SLEEP_TALK":
      return v.status(u, "slp") ? 0 : -8;
    case "MEAN_LOOK":
      return v.volatile(t, "trapped") ? -10 : 0;
    case "CURSE":
      if (u.hasType("Ghost")) return v.volatile(t, "curse") ? -10 : 0;
      if (v.stage(u, "atk") === 12) return -10;
      return v.stage(u, "def") === 12 ? -8 : 0;
    case "SPIKES":
    case "TOXIC_SPIKES":
    case "STEALTH_ROCK": {
      const id = { SPIKES: "spikes", TOXIC_SPIKES: "toxicspikes", STEALTH_ROCK: "stealthrock" }[e];
      const layers = (t.side.sideConditions[id] as { layers?: number } | undefined)?.layers ?? (v.sideHas(t, id) ? 1 : 0);
      const max = { SPIKES: 3, TOXIC_SPIKES: 2, STEALTH_ROCK: 1 }[e];
      // Gen 4: hazards only hurt what comes in later.
      return layers >= max || !v.bench(t).length ? -10 : 0;
    }
    case "TRICK_ROOM":
      // It ends Trick Room when it's up: only worth it when the user is faster.
      return v.sim.field.getPseudoWeather("trickroom") && v.targetFaster() ? -10 : 0;
    case "FORESIGHT":
      return v.volatile(t, "foresight") || v.volatile(t, "miracleeye") ? -10 : 0;
    case "PERISH_SONG":
      return v.volatile(t, "perishsong") ? -10 : 0;
    case "SANDSTORM":
    case "RAIN_DANCE":
    case "SUNNY_DAY":
    case "HAIL": {
      const id = { SANDSTORM: "sandstorm", RAIN_DANCE: "raindance", SUNNY_DAY: "sunnyday", HAIL: "hail" }[e];
      return v.sim.field.weather === id ? -8 : 0;
    }
    case "ATTRACT": {
      if (v.volatile(t, "attract") || a === "oblivious") return -10;
      const opposite = (u.gender === "M" && t.gender === "F") || (u.gender === "F" && t.gender === "M");
      return opposite ? 0 : -10;
    }
    case "BATON_PASS":
    case "HEALING_WISH":
      return v.bench(u).length ? 0 : -10;
    case "MEMENTO":
      if (v.stage(t, "atk") === 0) return -10;
      if (v.stage(t, "spa") === 0) return -8;
      return 0;
    case "FUTURE_SIGHT":
      return t.side.slotConditions[t.position]?.futuremove ? -10 : 0;
    case "FAKE_OUT":
      return !v.firstTurn(u) || a === "innerfocus" ? -10 : 0;
    case "STOCKPILE":
      return ((u.volatiles.stockpile as { layers?: number } | undefined)?.layers ?? 0) >= 3 ? -10 : 0;
    case "SPIT_UP":
    case "SWALLOW":
      if (e === "SPIT_UP" && v.effectiveness(c.move) === 0) return -10;
      return v.volatile(u, "stockpile") ? 0 : -10;
    case "TORMENT":
      return v.volatile(t, "torment") ? -10 : 0;
    case "HELPING_HAND":
      return -10;
    case "TRICK":
    case "KNOCK_OFF":
      return a === "stickyhold" ? -10 : 0;
    case "INGRAIN":
      return v.volatile(u, "ingrain") ? -10 : 0;
    case "AQUA_RING":
      return v.volatile(u, "aquaring") ? -10 : 0;
    case "RECYCLE":
      return u.lastItem && !u.item ? 0 : -10;
    case "IMPRISON":
      return v.volatile(u, "imprison") ? -10 : 0;
    case "REFRESH":
      return v.status(u, "psn", "tox", "brn", "par") ? 0 : -10;
    case "MUD_SPORT":
      return v.volatile(u, "mudsport") ? -10 : 0;
    case "WATER_SPORT":
      return v.volatile(u, "watersport") ? -10 : 0;
    case "TICKLE":
      if (v.stage(t, "atk") === 0 || blocksDrop(v, t, "atk")) return -10;
      return v.stage(t, "def") === 0 ? -8 : 0;
    case "COSMIC_POWER":
    case "BULK_UP":
    case "CALM_MIND":
    case "DRAGON_DANCE": {
      const [first, second]: StatId[] = { COSMIC_POWER: ["def", "spd"], BULK_UP: ["atk", "def"], CALM_MIND: ["spa", "spd"], DRAGON_DANCE: ["atk", "spe"] }[e] as StatId[];
      if (v.stage(u, first) === 12) return -10;
      return v.stage(u, second) === 12 ? -8 : 0;
    }
    case "MINIMIZE":
      return v.stage(u, "evasion") === 12 ? -10 : 0;
    case "DEFENSE_CURL":
      return v.stage(u, "def") === 12 ? -10 : 0;
    case "TELEPORT":
    case "SPLASH":
      return -10;
    default:
      return 0;
  }
}
