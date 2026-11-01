// Each move's FireRed AI effect (FireRed's EFFECT_* names, include/constants/battle_move_effects.h),
// read from Showdown's Gen 4 move data, so Gen 4 moves get one too (plans/battles D17). Moves whose
// data doesn't say it are named by ID.

import type { Move } from "@pkmn/sim";

export type Effect =
  | "HIT" | "QUICK_ATTACK" | "HIGH_CRITICAL" | "ALWAYS_HIT" | "ABSORB" | "RECHARGE" | "CHARGE" | "SEMI_INVULNERABLE"
  | "EXPLOSION" | "SUPERPOWER" | "OVERHEAT" | "SPEED_DOWN_HIT" | "TRAP" | "FAKE_OUT" | "PURSUIT" | "FOCUS_PUNCH"
  | "REVENGE" | "FLAIL" | "ERUPTION" | "FACADE" | "SMELLINGSALT" | "BRICK_BREAK" | "KNOCK_OFF" | "THIEF"
  | "VITAL_THROW" | "COUNTER" | "MIRROR_COAT" | "LEVEL_DAMAGE" | "PSYWAVE" | "SONICBOOM" | "SUPER_FANG" | "ENDEAVOR"
  | "OHKO" | "BIDE" | "DREAM_EATER" | "SNORE" | "SPIT_UP" | "MAGNITUDE" | "RETURN" | "PRESENT" | "U_TURN"
  | "FUTURE_SIGHT" | "FURY_CUTTER" | "RAGE" | "ALL_STATS_UP_HIT"
  | "ATTACK_UP" | "DEFENSE_UP" | "SPEED_UP" | "SPECIAL_ATTACK_UP" | "SPECIAL_DEFENSE_UP" | "ACCURACY_UP" | "EVASION_UP"
  | "ATTACK_UP_2" | "DEFENSE_UP_2" | "SPEED_UP_2" | "SPECIAL_ATTACK_UP_2" | "SPECIAL_DEFENSE_UP_2" | "ACCURACY_UP_2" | "EVASION_UP_2"
  | "ATTACK_DOWN" | "DEFENSE_DOWN" | "SPEED_DOWN" | "SPECIAL_ATTACK_DOWN" | "SPECIAL_DEFENSE_DOWN" | "ACCURACY_DOWN" | "EVASION_DOWN"
  | "ATTACK_DOWN_2" | "DEFENSE_DOWN_2" | "SPEED_DOWN_2" | "SPECIAL_ATTACK_DOWN_2" | "SPECIAL_DEFENSE_DOWN_2" | "ACCURACY_DOWN_2" | "EVASION_DOWN_2"
  | "BULK_UP" | "CALM_MIND" | "DRAGON_DANCE" | "COSMIC_POWER" | "TICKLE" | "CURSE" | "BELLY_DRUM" | "MINIMIZE" | "DEFENSE_CURL"
  | "SLEEP" | "YAWN" | "POISON" | "TOXIC" | "PARALYZE" | "WILL_O_WISP" | "CONFUSE" | "SWAGGER" | "FLATTER" | "ATTRACT"
  | "LEECH_SEED" | "DISABLE" | "ENCORE" | "TORMENT" | "TAUNT" | "NIGHTMARE" | "FORESIGHT" | "MEAN_LOOK" | "PERISH_SONG"
  | "SUBSTITUTE" | "PROTECT" | "ENDURE" | "LIGHT_SCREEN" | "REFLECT" | "SAFEGUARD" | "MIST" | "FOCUS_ENERGY"
  | "SPIKES" | "STEALTH_ROCK" | "TOXIC_SPIKES" | "TAILWIND" | "TRICK_ROOM"
  | "RAIN_DANCE" | "SUNNY_DAY" | "SANDSTORM" | "HAIL"
  | "RESTORE_HP" | "MORNING_SUN" | "REST" | "PAIN_SPLIT" | "SWALLOW" | "STOCKPILE" | "INGRAIN" | "AQUA_RING"
  | "HAZE" | "ROAR" | "BATON_PASS" | "PSYCH_UP" | "HEAL_BELL" | "TRICK" | "ROLE_PLAY" | "SKILL_SWAP" | "RECYCLE"
  | "IMPRISON" | "REFRESH" | "SNATCH" | "MAGIC_COAT" | "MUD_SPORT" | "WATER_SPORT" | "MEMENTO" | "HEALING_WISH"
  | "HELPING_HAND" | "DESTINY_BOND" | "LOCK_ON" | "SLEEP_TALK" | "MIRROR_MOVE" | "METRONOME" | "CONVERSION"
  | "TELEPORT" | "SPLASH" | "OTHER";

/** By Showdown ID: what the move data alone doesn't tell apart. */
const BY_ID: Record<string, Effect> = {
  fakeout: "FAKE_OUT", pursuit: "PURSUIT", focuspunch: "FOCUS_PUNCH", revenge: "REVENGE", avalanche: "REVENGE",
  flail: "FLAIL", reversal: "FLAIL", eruption: "ERUPTION", waterspout: "ERUPTION", facade: "FACADE",
  smellingsalt: "SMELLINGSALT", wakeupslap: "SMELLINGSALT", brickbreak: "BRICK_BREAK", knockoff: "KNOCK_OFF",
  thief: "THIEF", covet: "THIEF", vitalthrow: "VITAL_THROW", counter: "COUNTER", mirrorcoat: "MIRROR_COAT",
  metalburst: "COUNTER", psywave: "PSYWAVE", superfang: "SUPER_FANG", endeavor: "ENDEAVOR", bide: "BIDE",
  dreameater: "DREAM_EATER", snore: "SNORE", spitup: "SPIT_UP", magnitude: "MAGNITUDE", return: "RETURN",
  frustration: "RETURN", present: "PRESENT", futuresight: "FUTURE_SIGHT", doomdesire: "FUTURE_SIGHT",
  furycutter: "FURY_CUTTER", rage: "RAGE", ancientpower: "ALL_STATS_UP_HIT", silverwind: "ALL_STATS_UP_HIT",
  ominouswind: "ALL_STATS_UP_HIT", superpower: "SUPERPOWER", closecombat: "SUPERPOWER",
  bulkup: "BULK_UP", calmmind: "CALM_MIND", dragondance: "DRAGON_DANCE", cosmicpower: "COSMIC_POWER",
  defendorder: "COSMIC_POWER", tickle: "TICKLE", curse: "CURSE", bellydrum: "BELLY_DRUM", minimize: "MINIMIZE",
  defensecurl: "DEFENSE_CURL", swagger: "SWAGGER", flatter: "FLATTER", attract: "ATTRACT", disable: "DISABLE",
  encore: "ENCORE", torment: "TORMENT", taunt: "TAUNT", nightmare: "NIGHTMARE", foresight: "FORESIGHT",
  odorsleuth: "FORESIGHT", miracleeye: "FORESIGHT", meanlook: "MEAN_LOOK", block: "MEAN_LOOK", spiderweb: "MEAN_LOOK",
  perishsong: "PERISH_SONG", endure: "ENDURE", focusenergy: "FOCUS_ENERGY", morningsun: "MORNING_SUN",
  synthesis: "MORNING_SUN", moonlight: "MORNING_SUN", rest: "REST", painsplit: "PAIN_SPLIT", swallow: "SWALLOW",
  stockpile: "STOCKPILE", ingrain: "INGRAIN", aquaring: "AQUA_RING", haze: "HAZE", batonpass: "BATON_PASS",
  psychup: "PSYCH_UP", healbell: "HEAL_BELL", aromatherapy: "HEAL_BELL", trick: "TRICK", switcheroo: "TRICK",
  roleplay: "ROLE_PLAY", skillswap: "SKILL_SWAP", recycle: "RECYCLE", imprison: "IMPRISON", refresh: "REFRESH",
  snatch: "SNATCH", magiccoat: "MAGIC_COAT", mudsport: "MUD_SPORT", watersport: "WATER_SPORT", memento: "MEMENTO",
  healingwish: "HEALING_WISH", lunardance: "HEALING_WISH", helpinghand: "HELPING_HAND", destinybond: "DESTINY_BOND",
  lockon: "LOCK_ON", mindreader: "LOCK_ON", sleeptalk: "SLEEP_TALK", mirrormove: "MIRROR_MOVE", copycat: "MIRROR_MOVE",
  metronome: "METRONOME", conversion: "CONVERSION", conversion2: "CONVERSION", teleport: "TELEPORT", splash: "SPLASH",
  yawn: "YAWN", leechseed: "LEECH_SEED", substitute: "SUBSTITUTE", safeguard: "SAFEGUARD", mist: "MIST",
  overheat: "OVERHEAT", psychoboost: "OVERHEAT", dracometeor: "OVERHEAT", leafstorm: "OVERHEAT",
  sonicboom: "SONICBOOM", dragonrage: "SONICBOOM",
};

const SIDE: Record<string, Effect> = {
  spikes: "SPIKES", stealthrock: "STEALTH_ROCK", toxicspikes: "TOXIC_SPIKES", tailwind: "TAILWIND",
  lightscreen: "LIGHT_SCREEN", reflect: "REFLECT",
};
const WEATHER: Record<string, Effect> = { RainDance: "RAIN_DANCE", raindance: "RAIN_DANCE", SunnyDay: "SUNNY_DAY", sunnyday: "SUNNY_DAY", Sandstorm: "SANDSTORM", sandstorm: "SANDSTORM", Hail: "HAIL", hail: "HAIL" };
const STATUS: Record<string, Effect> = { slp: "SLEEP", psn: "POISON", tox: "TOXIC", par: "PARALYZE", brn: "WILL_O_WISP" };
const STAT: Record<string, string> = { atk: "ATTACK", def: "DEFENSE", spe: "SPEED", spa: "SPECIAL_ATTACK", spd: "SPECIAL_DEFENSE", accuracy: "ACCURACY", evasion: "EVASION" };

const cache = new Map<string, Effect>();

export function effectOf(move: Move): Effect {
  let effect = cache.get(move.id);
  if (!effect) cache.set(move.id, (effect = classify(move)));
  return effect;
}

function classify(m: Move): Effect {
  const byId = BY_ID[m.id];
  if (byId) return byId;
  if (m.category !== "Status") return damaging(m);
  if (m.sideCondition && SIDE[m.sideCondition]) return SIDE[m.sideCondition];
  if (m.pseudoWeather === "trickroom") return "TRICK_ROOM";
  if (m.weather && WEATHER[m.weather]) return WEATHER[m.weather];
  if (m.status && STATUS[m.status]) return STATUS[m.status];
  if (m.volatileStatus === "confusion") return "CONFUSE";
  if (m.stallingMove) return "PROTECT";
  if (m.forceSwitch) return "ROAR";
  if (m.heal) return "RESTORE_HP";
  if (m.boosts) return statEffect(m.boosts, m.target === "self" || m.target === "adjacentAllyOrSelf");
  return "OTHER";
}

function damaging(m: Move): Effect {
  if (m.selfdestruct === "always") return "EXPLOSION";
  if (m.ohko) return "OHKO";
  if (m.damage === "level") return "LEVEL_DAMAGE";
  if (m.self?.volatileStatus === "mustrecharge") return "RECHARGE";
  if (m.flags.charge) return m.id === "fly" || m.id === "dig" || m.id === "dive" || m.id === "bounce" || m.id === "shadowforce" ? "SEMI_INVULNERABLE" : "CHARGE";
  if (m.selfSwitch) return "U_TURN";
  if (m.drain) return "ABSORB";
  if (m.priority > 0) return "QUICK_ATTACK";
  if (m.volatileStatus === "partiallytrapped") return "TRAP";
  if (m.secondary?.boosts?.spe && m.secondary.chance === 100) return "SPEED_DOWN_HIT";
  if ((m.critRatio ?? 1) > 1) return "HIGH_CRITICAL";
  if (m.accuracy === true) return "ALWAYS_HIT";
  return "HIT";
}

/** One stat up or down by 1 or 2 stages ("ATTACK_UP_2"); several stats: OTHER. */
function statEffect(boosts: Partial<Record<string, number>>, self: boolean): Effect {
  const stats = Object.entries(boosts).filter(([, n]) => n);
  if (stats.length !== 1) return "OTHER";
  const [stat, n = 0] = stats[0];
  if (self !== n > 0) return "OTHER";
  return `${STAT[stat]}_${n > 0 ? "UP" : "DOWN"}${Math.abs(n) >= 2 ? "_2" : ""}` as Effect;
}

/** Effect groups the flags test. */
export const isStatUp = (e: Effect) => /_UP(_2)?$/.test(e) && e !== "ALL_STATS_UP_HIT";
export const isStatDown = (e: Effect) => /_DOWN(_2)?$/.test(e);
export const statOf = (e: Effect) => Object.entries(STAT).find(([, name]) => e.startsWith(name + "_"))?.[0] as StatId | undefined;
export type StatId = "atk" | "def" | "spe" | "spa" | "spd" | "accuracy" | "evasion";
