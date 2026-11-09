// AI_CheckViability (FireRed's data/battle_ai_scripts.s): each effect's worth now, step by step as
// the script does it (`!v.chance(n)` is its "if_random_less_than n, skip"). Adapted to Gen 4:
// physical or special is the move's category (the split), not its type; bugs marked in the
// script are fixed; Gen 4 effects (hazards, Trick Room, Tailwind, U-turn, Taunt) are added.

import type { Pokemon } from "../../engine/battle.ts";
import { effectOf, type Effect, type StatId } from "../effects.ts";
import type { AiView, Considered } from "../view.ts";

type Rule = (v: AiView, c: Considered) => number;

const MAIN: StatId[] = ["atk", "def", "spa", "spd", "evasion"];
const anyAbove = (v: AiView, p: Pokemon, n: number, stats = MAIN) => stats.some((s) => v.stage(p, s) > n);
const anyBelow = (v: AiView, p: Pokemon, n: number, stats: StatId[]) => stats.some((s) => v.stage(p, s) < n);
const weak = (v: AiView, c: Considered) => [0.25, 0.5].includes(v.effectiveness(c.move));

/** Gen 4: does the target hit physically? What it has shown, else its stats. */
function physicalAttacker(v: AiView, t: Pokemon): boolean {
  const shown = t.moveSlots.filter((s) => s.used).map((s) => v.sim.dex.moves.get(s.id).category);
  if (shown.includes("Physical")) return true;
  if (shown.includes("Special")) return false;
  return t.storedStats.atk >= t.storedStats.spa;
}

const lastEffect = (v: AiView, p: Pokemon): Effect | undefined => {
  const m = v.lastMove(p);
  return m && effectOf(m);
};
const lastPower = (v: AiView, p: Pokemon) => (v.lastMove(p)?.category ?? "Status") === "Status" ? 0 : 1;
const userFaster = (v: AiView) => v.user.getActionSpeed() > v.target.getActionSpeed();
const drained = (v: AiView, p: Pokemon) => v.status(p, "tox") || v.volatile(p, "curse") || v.volatile(p, "perishsong") || v.volatile(p, "attract") || v.volatile(p, "leechseed") || v.volatile(p, "yawn");

/** AI_CV_AttackUp / SpAtkUp: `third` is the last chance to keep the score. */
const offenseUp = (stat: StatId, third: number): Rule => (v) => {
  let s = 0;
  if (v.stage(v.user, stat) >= 9) {
    if (!v.chance(100)) s -= 1;
  } else if (v.hp(v.user) === 100 && !v.chance(128)) s += 2;
  if (v.hp(v.user) > 70) return s;
  if (v.hp(v.user) < 40 || !v.chance(third)) s -= 2;
  return s;
};

/** AI_CV_DefenseUp / SpDefUp: worth more against the matching kind of attack. */
const defenseUp = (stat: StatId, physical: boolean): Rule => (v) => {
  const u = v.user;
  let s = 0;
  if (v.stage(u, stat) >= 9) {
    if (!v.chance(100)) s -= 1;
  } else if (v.hp(u) === 100 && !v.chance(128)) s += 2;
  if (v.hp(u) >= 70 && v.chance(200)) return s;
  if (v.hp(u) < 40) return s - 2;
  if (lastPower(v, v.target)) {
    if ((v.lastMove(v.target)?.category === "Physical") !== physical) return s - 2;
    if (v.chance(60)) return s;
  }
  return v.chance(60) ? s : s - 2;
};

/** AI_CV_AttackDown / SpAtkDown. */
const offenseDown = (stat: StatId, physical: boolean): Rule => (v) => {
  const t = v.target;
  let s = 0;
  if (v.stage(t, stat) !== 6) {
    s -= 1;
    if (v.hp(v.user) <= 90) s -= 1;
    if (v.stage(t, stat) <= 3 && !v.chance(50)) s -= 2;
  }
  if (v.hp(t) <= 70) s -= 2;
  if (physicalAttacker(v, t) === physical || v.chance(50)) return s;
  return s - 2;
};

/** AI_CV_DefenseDown / SpDefDown / EvasionDown. */
const defenseDown = (stat: StatId): Rule => (v) => {
  let s = 0;
  if (v.hp(v.user) < 70 || v.stage(v.target, stat) <= 3) {
    if (!v.chance(50)) s -= 2;
  }
  return v.hp(v.target) > 70 ? s : s - 2;
};

const speedUp: Rule = (v) => (v.targetFaster() ? (v.chance(70) ? 0 : 3) : -3);
const speedDown: Rule = (v) => (v.targetFaster() ? (v.chance(70) ? 0 : 2) : -3);

const accuracyUp: Rule = (v) => {
  let s = 0;
  if (v.stage(v.user, "accuracy") >= 9 && !v.chance(50)) s -= 2;
  return v.hp(v.user) > 70 ? s : s - 2;
};

/** The shared tail of EvasionUp and AccuracyDown: the target is wasting away. */
function wearDown(v: AiView, up: [number, number, number, number]): number {
  const { user: u, target: t } = v;
  let s = 0;
  if (v.status(t, "tox") && (v.hp(u) > 50 || !v.chance(80)) && !v.chance(50)) s += up[0];
  if (v.volatile(t, "leechseed") && !v.chance(70)) s += up[1];
  if (v.volatile(u, "ingrain") && !v.chance(128)) s += up[2];
  if (v.volatile(t, "curse") && !v.chance(70)) s += up[3];
  return s;
}

const evasionUp: Rule = (v) => {
  const { user: u, target: t } = v;
  let s = 0;
  if (v.hp(u) >= 90 && !v.chance(100)) s += 3;
  if (v.stage(u, "evasion") >= 9 && !v.chance(128)) s -= 1;
  s += wearDown(v, [3, 3, 2, 3]);
  if (v.hp(u) > 70 || v.stage(u, "evasion") === 6) return s;
  if (v.hp(u) < 40 || v.hp(t) < 40 || !v.chance(70)) s -= 2;
  return s;
};

const accuracyDown: Rule = (v) => {
  const { user: u, target: t } = v;
  let s = 0;
  if ((v.hp(u) < 70 || v.hp(t) <= 70) && !v.chance(100)) s -= 1;
  if (v.stage(u, "accuracy") <= 4 && !v.chance(80)) s -= 2;
  s += wearDown(v, [2, 2, 1, 2]);
  if (v.hp(u) > 70 || v.stage(t, "accuracy") === 6) return s;
  if (v.hp(u) < 40 || v.hp(t) < 40 || !v.chance(70)) s -= 2;
  return s;
};

const heal: Rule = (v) => {
  const u = v.user;
  if (v.hp(u) === 100) return -3;
  if (!v.targetFaster()) return -8;
  if (v.hp(u) >= 70 && !v.chance(30)) return -3;
  if (v.hasEffect(v.target, "SNATCH") && v.chance(100)) return 0;
  return v.chance(20) ? 0 : 2;
};

const selfKo: Rule = (v) => {
  const { user: u, target: t } = v;
  let s = 0;
  if (v.stage(t, "evasion") >= 7) {
    s -= 1;
    if (v.stage(t, "evasion") >= 10 && !v.chance(128)) s -= 1;
  }
  if (v.hp(u) >= 80 && !v.targetFaster()) return v.chance(50) ? s : s - 3;
  if (v.hp(u) > 50) return v.chance(50) ? s : s - 1;
  if (!v.chance(128)) s += 1;
  if (v.hp(u) > 30 || v.chance(50)) return s;
  return s + 1;
};

/** Counter (physical) and Mirror Coat (special). */
const reflectDamage = (physical: boolean): Rule => (v) => {
  const { user: u, target: t } = v;
  if (v.status(t, "slp") || v.volatile(t, "attract") || v.volatile(t, "confusion")) return -1;
  let s = 0;
  if (v.hp(u) <= 30 && !v.chance(10)) s -= 1;
  if (v.hp(u) <= 50 && !v.chance(100)) s -= 1;
  if (v.volatile(t, "taunt") && !v.chance(100)) s += 1;
  if (lastPower(v, t)) {
    if ((v.lastMove(t)?.category === "Physical") !== physical) return s - 1;
    return v.chance(100) ? s : s + 1;
  }
  if (physicalAttacker(v, t) === physical || v.chance(50)) return s;
  return s - 1;
};

/** Reflect (physical) and Light Screen (special). */
const screen = (physical: boolean): Rule => (v) => {
  if (v.hp(v.user) < 50) return -2;
  return physicalAttacker(v, v.target) === physical || v.chance(50) ? 0 : -2;
};

const confuse: Rule = (v) => {
  const t = v.target;
  if (v.hp(t) > 70) return 0;
  let s = v.chance(128) ? 0 : -1;
  if (v.hp(t) > 50) return s;
  s -= 1;
  return v.hp(t) > 30 ? s : s - 1;
};

/** Haze and Roar-like resets: worth it when the target is boosted, not when the user is. */
const haze: Rule = (v) => {
  const { user: u, target: t } = v;
  const lows: StatId[] = ["atk", "def", "spa", "spd", "accuracy"];
  let s = 0;
  if ((anyAbove(v, u, 8) || anyBelow(v, t, 4, lows)) && !v.chance(50)) s -= 3;
  if (anyAbove(v, t, 8) || anyBelow(v, u, 4, lows)) return v.chance(50) ? s : s + 3;
  return v.chance(50) ? s : s - 1;
};

const trickItems = new Set(["figyberry", "wikiberry", "magoberry", "aguavberry", "iapapaberry", "machobrace", "flameorb", "toxicorb", "ironball", "laggingtail", "stickybarb"]);
const choiceItems = new Set(["choiceband", "choicescarf", "choicespecs"]);
const goodAbilities = new Set(["speedboost", "battlearmor", "sandveil", "static", "flashfire", "wonderguard", "effectspore", "swiftswim", "hugepower", "raindish", "cutecharm", "shedskin", "marvelscale", "purepower", "chlorophyll", "shielddust", "adaptability", "technician", "magicguard"]);
const encoreEffects = new Set<Effect>([
  "DREAM_EATER", "ATTACK_UP", "DEFENSE_UP", "SPEED_UP", "SPECIAL_ATTACK_UP", "HAZE", "ROAR", "CONVERSION", "TOXIC", "LIGHT_SCREEN",
  "REST", "SUPER_FANG", "SPECIAL_DEFENSE_UP_2", "CONFUSE", "POISON", "PARALYZE", "LEECH_SEED", "SPLASH", "ATTACK_UP_2", "ENCORE",
  "LOCK_ON", "HEAL_BELL", "MEAN_LOOK", "NIGHTMARE", "PROTECT", "SKILL_SWAP", "FORESIGHT", "PERISH_SONG", "SANDSTORM", "ENDURE",
  "SWAGGER", "ATTRACT", "SAFEGUARD", "RAIN_DANCE", "SUNNY_DAY", "BELLY_DRUM", "PSYCH_UP", "FUTURE_SIGHT", "FAKE_OUT", "STOCKPILE",
  "SPIT_UP", "SWALLOW", "HAIL", "TORMENT", "WILL_O_WISP", "TRICK", "ROLE_PLAY", "INGRAIN", "RECYCLE", "KNOCK_OFF", "IMPRISON",
  "REFRESH", "MUD_SPORT", "WATER_SPORT", "DRAGON_DANCE", "STEALTH_ROCK", "SPIKES", "TOXIC_SPIKES", "TRICK_ROOM", "TAILWIND", "AQUA_RING",
]);
const mirrorMoves = new Set([
  "sleeppowder", "lovelykiss", "spore", "hypnosis", "sing", "grasswhistle", "shadowpunch", "sandattack", "smokescreen", "toxic",
  "guillotine", "horndrill", "fissure", "sheercold", "crosschop", "aeroblast", "confuseray", "sweetkiss", "screech", "cottonspore",
  "scaryface", "faketears", "metalsound", "thunderwave", "glare", "poisonpowder", "shadowball", "dynamicpunch", "hyperbeam",
  "extremespeed", "thief", "covet", "attract", "swagger", "torment", "flatter", "trick", "superpower", "skillswap",
]);

const RULES: Partial<Record<Effect, Rule>> = {
  SLEEP: (v) => (v.hasEffect(v.target, "DREAM_EATER", "NIGHTMARE") && !v.chance(128) ? 1 : 0),
  ABSORB: (v, c) => (weak(v, c) && !v.chance(50) ? -3 : 0),
  EXPLOSION: selfKo,
  MEMENTO: selfKo,
  HEALING_WISH: selfKo,
  DREAM_EATER: (v, c) => (weak(v, c) ? -1 : 0),
  MIRROR_MOVE: (v) => {
    const listed = mirrorMoves.has(v.lastMove(v.target)?.id ?? "");
    if (!v.targetFaster() && listed) return v.chance(128) ? 0 : 2;
    return listed || v.chance(80) ? 0 : -1;
  },
  ATTACK_UP: offenseUp("atk", 40),
  ATTACK_UP_2: offenseUp("atk", 40),
  SPECIAL_ATTACK_UP: offenseUp("spa", 70),
  SPECIAL_ATTACK_UP_2: offenseUp("spa", 70),
  DEFENSE_UP: defenseUp("def", true),
  DEFENSE_UP_2: defenseUp("def", true),
  DEFENSE_CURL: defenseUp("def", true),
  BULK_UP: defenseUp("def", true),
  SPECIAL_DEFENSE_UP: defenseUp("spd", false),
  SPECIAL_DEFENSE_UP_2: defenseUp("spd", false),
  COSMIC_POWER: defenseUp("spd", false),
  CALM_MIND: defenseUp("spd", false),
  SPEED_UP: speedUp,
  SPEED_UP_2: speedUp,
  TAILWIND: speedUp,
  ACCURACY_UP: accuracyUp,
  ACCURACY_UP_2: accuracyUp,
  EVASION_UP: evasionUp,
  EVASION_UP_2: evasionUp,
  MINIMIZE: evasionUp,
  ALWAYS_HIT: (v) => {
    const { user: u, target: t } = v;
    let s = 0;
    if (v.stage(t, "evasion") > 10 || v.stage(u, "accuracy") < 2) s += 1;
    else if (!(v.stage(t, "evasion") > 8 || v.stage(u, "accuracy") < 4)) return 0;
    return v.chance(100) ? s : s + 1;
  },
  ATTACK_DOWN: offenseDown("atk", true),
  ATTACK_DOWN_2: offenseDown("atk", true),
  SPECIAL_ATTACK_DOWN: offenseDown("spa", false),
  SPECIAL_ATTACK_DOWN_2: offenseDown("spa", false),
  DEFENSE_DOWN: defenseDown("def"),
  DEFENSE_DOWN_2: defenseDown("def"),
  TICKLE: defenseDown("def"),
  SPECIAL_DEFENSE_DOWN: defenseDown("spd"),
  SPECIAL_DEFENSE_DOWN_2: defenseDown("spd"),
  EVASION_DOWN: defenseDown("evasion"),
  EVASION_DOWN_2: defenseDown("evasion"),
  SPEED_DOWN: speedDown,
  SPEED_DOWN_2: speedDown,
  SPEED_DOWN_HIT: speedDown,
  ACCURACY_DOWN: accuracyDown,
  ACCURACY_DOWN_2: accuracyDown,
  HAZE: haze,
  BIDE: (v) => (v.hp(v.user) > 90 ? 0 : -2),
  ROAR: (v) => (anyAbove(v, v.target, 8) ? (v.chance(128) ? 0 : 2) : -3),
  CONVERSION: (v) => {
    let s = v.hp(v.user) > 90 ? 0 : -2;
    if (v.turn() !== 0 && v.chance(200)) s -= 2;
    return s;
  },
  MORNING_SUN: (v, c) => (["hail", "raindance", "sandstorm"].includes(v.weather()) ? -2 : 0) + heal(v, c),
  RESTORE_HP: heal,
  SWALLOW: heal,
  TOXIC: (v) => {
    const { user: u, target: t } = v;
    let s = 0;
    const attacks = u.moveSlots.some((m) => v.sim.dex.moves.get(m.id).category !== "Status");
    if (attacks) {
      if (v.hp(u) <= 50 && !v.chance(50)) s -= 3;
      if (v.hp(t) <= 50 && !v.chance(50)) s -= 3;
    }
    if (v.hasEffect(u, "SPECIAL_DEFENSE_UP", "PROTECT") && !v.chance(60)) s += 2;
    return s;
  },
  LEECH_SEED: (v, c) => RULES.TOXIC!(v, c),
  LIGHT_SCREEN: screen(false),
  REFLECT: screen(true),
  REST: (v) => {
    const u = v.user;
    if (!v.targetFaster()) {
      if (v.hp(u) === 100) return -8;
      if (v.hp(u) >= 40 && (v.hp(u) > 50 || v.chance(70))) return -3;
    } else if (v.hp(u) >= 60 && (v.hp(u) > 70 || v.chance(50))) return -3;
    if (v.hasEffect(v.target, "SNATCH") && v.chance(50)) return 0;
    return v.chance(10) ? 0 : 3;
  },
  SUPER_FANG: (v) => (v.hp(v.target) > 50 ? 0 : -1),
  TRAP: (v) => (drained(v, v.target) && !v.chance(128) ? 1 : 0),
  MEAN_LOOK: (v) => (drained(v, v.target) && !v.chance(128) ? 1 : 0),
  HIGH_CRITICAL: (v, c) => {
    if (weak(v, c)) return 0;
    const strong = v.effectiveness(c.move) >= 2;
    if (!strong && v.chance(128)) return 0;
    return v.chance(128) ? 0 : 1;
  },
  CONFUSE: confuse,
  FLATTER: (v, c) => (v.chance(128) ? 0 : 1) + confuse(v, c),
  POISON: (v) => (v.hp(v.user) < 50 || v.hp(v.target) <= 50 ? -1 : 0),
  PARALYZE: (v) => (v.targetFaster() ? (v.chance(20) ? 0 : 3) : v.hp(v.user) > 70 ? 0 : -1),
  VITAL_THROW: (v) => {
    const u = v.user;
    if (v.targetFaster() || v.hp(u) > 60) return 0;
    if (v.hp(u) >= 40 && v.chance(180)) return 0;
    return v.chance(50) ? 0 : -1;
  },
  SUBSTITUTE: (v) => {
    const { user: u, target: t } = v;
    let s = 0;
    const hp = v.hp(u);
    if (hp <= 50 && !v.chance(100)) s -= 1;
    if (hp <= 70 && !v.chance(100)) s -= 1;
    if (hp <= 90 && !v.chance(100)) s -= 1;
    if (v.targetFaster()) return s;
    const last = lastEffect(v, t);
    const worth =
      (last && ["SLEEP", "TOXIC", "POISON", "PARALYZE", "WILL_O_WISP"].includes(last) && !v.status(t)) ||
      (last === "CONFUSE" && !v.volatile(t, "confusion")) ||
      (last === "LEECH_SEED" && !v.volatile(t, "leechseed"));
    return worth && !v.chance(100) ? s + 1 : s;
  },
  RECHARGE: (v, c) => {
    if (weak(v, c)) return -1;
    if (!v.targetFaster()) return v.hp(v.user) > 40 ? -1 : 0;
    return v.hp(v.user) < 60 ? 0 : -1;
  },
  DISABLE: (v) => {
    if (v.targetFaster()) return 0;
    if (lastPower(v, v.target)) return 1;
    return v.chance(100) ? 0 : -1;
  },
  COUNTER: reflectDamage(true),
  MIRROR_COAT: reflectDamage(false),
  ENCORE: (v) => {
    const t = v.target;
    if (!v.volatile(t, "disable")) {
      const last = lastEffect(v, t);
      if (v.targetFaster() || !last || !encoreEffects.has(last)) return -2;
    }
    return v.chance(30) ? 0 : 3;
  },
  PAIN_SPLIT: (v) => {
    if (v.hp(v.target) < 80) return -1;
    const limit = v.targetFaster() ? 60 : 40;
    return v.hp(v.user) > limit ? -1 : 1;
  },
  SNORE: () => 2,
  LOCK_ON: (v) => (v.chance(128) ? 0 : 2),
  SLEEP_TALK: () => 2,
  DESTINY_BOND: (v) => {
    const u = v.user;
    let s = -1;
    if (v.targetFaster() || v.hp(u) > 70) return s;
    if (!v.chance(128)) s += 1;
    if (v.hp(u) > 50) return s;
    if (!v.chance(128)) s += 1;
    if (v.hp(u) > 30 || v.chance(100)) return s;
    return s + 2;
  },
  FLAIL: (v) => {
    const hp = v.hp(v.user);
    let s = 0;
    if (!v.targetFaster()) {
      if (hp > 33) return -1;
      if (hp > 20) return 0;
      if (hp < 8) s += 1;
    } else {
      if (hp > 60) return -1;
      if (hp > 40) return 0;
    }
    return v.chance(100) ? s : s + 1;
  },
  // FireRed checks the target's party; Heal Bell cures the user's.
  HEAL_BELL: (v) => (v.user.side.pokemon.some((p) => !p.fainted && p.status) ? 0 : -5),
  THIEF: (v) => {
    const item = v.target.item;
    if (v.user.item || !item) return -2;
    const good = v.sim.dex.items.get(item).isBerry || ["leftovers", "lightball", "thickclub", "brightpowder"].includes(item);
    if (!good) return -2;
    return v.chance(50) ? 0 : 1;
  },
  CURSE: (v) => {
    const u = v.user;
    if (u.hasType("Ghost")) return v.hp(u) > 80 ? 0 : -1;
    let s = 0;
    if (v.stage(u, "def") > 9) return s;
    if (!v.chance(128)) s += 1;
    if (v.stage(u, "def") > 7) return s;
    if (!v.chance(128)) s += 1;
    if (v.stage(u, "def") > 6) return s;
    return v.chance(128) ? s : s + 1;
  },
  PROTECT: (v) => {
    const { user: u, target: t } = v;
    const count = v.protectCount(u);
    if (count > 1) return -2;
    if (drained(v, u) || v.hasEffect(t, "RESTORE_HP", "DEFENSE_CURL")) return lastEffect(v, t) === "LOCK_ON" ? -2 : 0;
    let s = 0;
    if (drained(v, t) || lastEffect(v, t) !== "LOCK_ON") s += 2;
    if (count === 0) return s;
    s -= 1;
    return v.chance(128) ? s : s - 1;
  },
  // FireRed reads the user's type and evasion; Foresight and Miracle Eye are about the target's.
  FORESIGHT: (v) => {
    const t = v.target;
    if (t.hasType("Ghost") || t.hasType("Dark")) {
      if (v.chance(80)) return 0;
    } else if (v.stage(t, "evasion") <= 8) return -2;
    return v.chance(80) ? 0 : 2;
  },
  ENDURE: (v) => {
    const hp = v.hp(v.user);
    if (hp < 4 || hp >= 35) return -1;
    return v.chance(70) ? 0 : 1;
  },
  BATON_PASS: (v) => {
    const u = v.user;
    if (anyAbove(v, u, 8)) {
      if (v.targetFaster() ? v.hp(u) > 70 : v.hp(u) > 60) return 0;
      return v.chance(80) ? 0 : 2;
    }
    if (anyAbove(v, u, 7)) {
      if (v.targetFaster()) return v.hp(u) < 70 ? 0 : -2;
      return v.hp(u) > 60 ? -2 : 0;
    }
    return -2;
  },
  PURSUIT: (v) => {
    const t = v.target;
    if (v.firstTurn(v.user)) return 0;
    return (t.hasType("Ghost") || t.hasType("Psychic")) && !v.chance(128) ? 1 : 0;
  },
  RAIN_DANCE: (v) => {
    const u = v.user;
    if (!userFaster(v) && v.ability(u) === "swiftswim") return 1;
    if (v.hp(u) < 40) return -1;
    return ["hail", "sunnyday", "sandstorm"].includes(v.weather()) || v.ability(u) === "raindish" ? 1 : 0;
  },
  SUNNY_DAY: (v) => (v.hp(v.user) < 40 ? -1 : ["hail", "raindance", "sandstorm"].includes(v.weather()) ? 1 : 0),
  HAIL: (v) => (v.hp(v.user) < 40 ? -1 : ["sunnyday", "raindance", "sandstorm"].includes(v.weather()) ? 1 : 0),
  BELLY_DRUM: (v) => (v.hp(v.user) < 90 ? -2 : 0),
  PSYCH_UP: (v) => {
    const { user: u, target: t } = v;
    if (!anyAbove(v, t, 8)) return -2;
    if (anyBelow(v, u, 7, ["atk", "def", "spa", "spd"])) return v.chance(128) ? 0 : 1;
    if (v.stage(u, "evasion") < 7) return 1 + (v.chance(128) ? 0 : 1);
    return v.chance(50) ? 0 : -2;
  },
  CHARGE: (v, c) => {
    // Gen 4: Solar Beam fires at once in sunshine, and Power Herb skips the turn.
    if ((c.move.id === "solarbeam" && v.weather() === "sunnyday") || v.user.item === "powerherb") return 0;
    if (weak(v, c) || v.hasEffect(v.target, "PROTECT")) return -2;
    return v.hp(v.user) > 38 ? 0 : -1;
  },
  SEMI_INVULNERABLE: (v) => {
    const { user: u, target: t } = v;
    if (v.hasEffect(t, "PROTECT")) return -1;
    const encourage = () => (v.chance(80) ? 0 : 1);
    if (v.status(t, "tox") || v.volatile(t, "curse") || v.volatile(t, "leechseed")) return encourage();
    // FireRed swaps these two type checks (marked BUG in the script).
    if (v.weather() === "hail" && u.hasType("Ice")) return encourage();
    if (v.weather() === "sandstorm" && (u.hasType("Ground") || u.hasType("Rock") || u.hasType("Steel"))) return encourage();
    if (v.targetFaster()) return 0;
    return lastEffect(v, t) !== "LOCK_ON" ? encourage() : 0;
  },
  FAKE_OUT: () => 2,
  SPIT_UP: (v) => (((v.user.volatiles.stockpile as { layers?: number } | undefined)?.layers ?? 0) < 2 || v.chance(80) ? 0 : 2),
  // FireRed checks the target (marked BUG): Facade is stronger when the user has a status.
  FACADE: (v) => (v.status(v.user, "psn", "tox", "brn", "par") ? 1 : 0),
  FOCUS_PUNCH: (v, c) => {
    const t = v.target;
    if (weak(v, c)) return -1;
    if (v.status(t, "slp")) return 1;
    if (v.volatile(t, "attract") || v.volatile(t, "confusion")) return v.chance(100) ? 0 : 1;
    if (v.firstTurn(v.user)) return 0;
    return v.chance(100) ? 0 : 1;
  },
  SMELLINGSALT: (v, c) => (v.status(v.target, c.move.id === "wakeupslap" ? "slp" : "par") ? 1 : 0),
  TRICK: (v) => {
    const mine = v.user.item;
    const theirs = v.target.item;
    if (choiceItems.has(mine)) return choiceItems.has(theirs) ? -3 : 5;
    if (trickItems.has(mine)) {
      if (trickItems.has(theirs) || choiceItems.has(theirs)) return -3;
      return v.chance(50) ? 0 : 2;
    }
    return -3;
  },
  ROLE_PLAY: (v) => {
    if (goodAbilities.has(v.ability(v.user))) return -1;
    return goodAbilities.has(v.ability(v.target)) && !v.chance(50) ? 2 : 0;
  },
  SKILL_SWAP: (v, c) => RULES.ROLE_PLAY!(v, c),
  SUPERPOWER: (v, c) => {
    if (weak(v, c) || v.stage(v.user, "atk") < 6) return -1;
    if (!v.targetFaster()) return v.hp(v.user) > 40 ? -1 : 0;
    return v.hp(v.user) < 60 ? 0 : -1;
  },
  MAGIC_COAT: (v) => {
    let s = 0;
    if (v.hp(v.target) <= 30 && !v.chance(100)) s -= 1;
    if (!v.firstTurn(v.user)) return v.chance(30) ? s : s - 1;
    return v.chance(150) ? s : s + 1;
  },
  RECYCLE: (v) => (["chestoberry", "lumberry", "starfberry"].includes(v.user.lastItem) ? (v.chance(50) ? 0 : 1) : -2),
  REVENGE: (v) => {
    const t = v.target;
    if (v.status(t, "slp") || v.volatile(t, "attract") || v.volatile(t, "confusion") || v.chance(180)) return -2;
    return 2;
  },
  BRICK_BREAK: (v) => (v.sideHas(v.target, "reflect") || v.sideHas(v.target, "lightscreen") ? 1 : 0),
  KNOCK_OFF: (v) => {
    if (v.hp(v.target) < 30 || v.firstTurn(v.user)) return 0;
    return v.chance(180) ? 0 : 1;
  },
  ENDEAVOR: (v) => {
    if (v.hp(v.target) < 70) return -1;
    const limit = v.targetFaster() ? 50 : 40;
    return v.hp(v.user) > limit ? -1 : 1;
  },
  // Eruption's power is the user's HP (FireRed reads the target's).
  ERUPTION: (v, c) => {
    if (weak(v, c)) return -1;
    const limit = v.targetFaster() ? 70 : 50;
    return v.hp(v.user) > limit ? 0 : -1;
  },
  IMPRISON: (v) => (v.firstTurn(v.user) || v.chance(100) ? 0 : 2),
  REFRESH: (v) => (v.hp(v.target) < 50 ? -1 : 0),
  SNATCH: (v) => {
    const { user: u, target: t } = v;
    const tail = () => (v.chance(30) ? 0 : -2);
    if (v.firstTurn(u)) return v.chance(150) ? 0 : 2;
    if (v.chance(30)) return 0;
    if (v.targetFaster()) {
      if (v.hp(t) > 25) return tail();
      if (v.hasEffect(t, "RESTORE_HP", "DEFENSE_CURL")) return v.chance(150) ? 0 : 2;
      return v.chance(230) ? tail() : 1;
    }
    if (v.hp(u) === 100 && v.hp(t) >= 70 && v.chance(60)) return 0;
    return tail();
  },
  MUD_SPORT: (v) => (v.hp(v.user) < 50 ? -1 : v.target.hasType("Electric") ? 1 : -1),
  WATER_SPORT: (v) => (v.hp(v.user) < 50 ? -1 : v.target.hasType("Fire") ? 1 : -1),
  OVERHEAT: (v, c) => {
    if (weak(v, c)) return -1;
    const limit = v.targetFaster() ? 80 : 60;
    return v.hp(v.user) > limit ? 0 : -1;
  },
  DRAGON_DANCE: (v) => {
    if (v.targetFaster()) return v.chance(128) ? 0 : 1;
    if (v.hp(v.user) > 50 || v.chance(70)) return 0;
    return -1;
  },
  // Gen 4 effects, modelled on pokeemerald-expansion's AI: hazards early, Trick Room when slower,
  // U-turn out of a bad matchup, Taunt against status users.
  SPIKES: (v) => (v.turn() < 2 && !v.chance(100) ? 1 : 0),
  TOXIC_SPIKES: (v) => (v.turn() < 2 && !v.chance(100) ? 1 : 0),
  STEALTH_ROCK: (v) => (v.turn() < 2 && !v.chance(100) ? 2 : 0),
  TRICK_ROOM: (v) => (v.sim.field.getPseudoWeather("trickroom") ? 0 : v.targetFaster() ? (v.chance(70) ? 0 : 3) : -3),
  U_TURN: (v) => {
    if (!v.bench(v.user).length) return 0;
    const threatened = v.target.moveSlots.some((s) => s.used && v.effectiveness(v.sim.dex.moves.get(s.id), v.user, v.target) >= 2);
    return threatened && !v.chance(128) ? 1 : 0;
  },
  TAUNT: (v) => (v.hasEffect(v.target, ...TAUNTED) && !v.chance(128) ? 1 : 0),
};

/** Status moves Taunt is worth against. */
const TAUNTED: Effect[] = ["RESTORE_HP", "REST", "PROTECT", "SUBSTITUTE", "TOXIC", "SLEEP", "PARALYZE", "WILL_O_WISP", "LEECH_SEED", "ATTACK_UP_2", "CALM_MIND", "DRAGON_DANCE", "SPIKES", "STEALTH_ROCK", "TOXIC_SPIKES"];

export function checkViability(v: AiView, c: Considered): number {
  return RULES[c.effect]?.(v, c) ?? 0;
}
