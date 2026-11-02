// Which of FireRed's battle strings each BattleEvent prints (battle_message.c's table, as the
// battle scripts pick them). Gen 4 effects FireRed has no string for print a FireRed string
// with the effect's name ("<MON> is hurt by STEALTH ROCK!") or nothing.

import {
  BattleStat,
  Condition,
  ConditionPhase,
  HitResult,
  StatsResetKind,
  Weather,
  type BattleEvent,
  type Battler,
  type Effect,
} from "@pokeuniverse/contracts/battle/v1/event";
import { Ability } from "@pokeuniverse/contracts/ability/v1/catalog";
import { Move } from "@pokeuniverse/contracts/move/v1/catalog";
import { Status } from "@pokeuniverse/contracts/pokemon/v1/pokemon";
import { decimalText, EOS, NumberMode, type Text } from "../../gba/text";
import type { TextId } from "../manifest";
import type { BattleTexts, MessageArgs } from "./text";

/** What the playback remembers between events: who acted last, whose ability showed. */
export interface Recent {
  /** The Pokémon whose move is being resolved. */
  mover?: Battler;
  /** The Pokémon whose ability showed last (Intimidate's owner). */
  ability?: Battler;
  /** A trainer just used an item: its effect shows with no message of its own. */
  itemUsed: boolean;
}

const STAT_NAMES: Partial<Record<BattleStat, TextId>> = {
  [BattleStat.ATTACK]: "sText_Attack2",
  [BattleStat.DEFENSE]: "sText_Defense2",
  [BattleStat.SPEED]: "sText_Speed",
  [BattleStat.SP_ATTACK]: "sText_SpAtk2",
  [BattleStat.SP_DEFENSE]: "sText_SpDef2",
  [BattleStat.ACCURACY]: "sText_Accuracy",
  [BattleStat.EVASION]: "sText_Evasiveness",
};

/** The status names items cure (gText_Sleep...). */
const STATUS_NAMES: Partial<Record<Status, TextId>> = {
  [Status.SLEEP]: "gText_Sleep",
  [Status.POISON]: "gText_Poison",
  [Status.TOXIC]: "gText_Poison",
  [Status.BURN]: "gText_Burn",
  [Status.PARALYSIS]: "gText_Paralysis",
  [Status.FREEZE]: "gText_Ice",
};

const STATUS_SET: Partial<Record<Status, TextId>> = {
  [Status.SLEEP]: "sText_PkmnFellAsleep",
  [Status.POISON]: "sText_PkmnWasPoisoned",
  [Status.TOXIC]: "sText_PkmnBadlyPoisoned",
  [Status.BURN]: "sText_PkmnWasBurned",
  [Status.FREEZE]: "sText_PkmnWasFrozen",
  [Status.PARALYSIS]: "sText_PkmnWasParalyzed",
};

/** The charging turn of two-turn moves. */
const PREPARE: Partial<Record<Move, TextId>> = {
  [Move.SOLAR_BEAM]: "sText_PkmnTookSunlight",
  [Move.FLY]: "sText_PkmnFlewHigh",
  [Move.DIG]: "sText_PkmnDugHole",
  [Move.DIVE]: "sText_PkmnHidUnderwater",
  [Move.BOUNCE]: "sText_PkmnSprangUp",
  [Move.SKULL_BASH]: "sText_PkmnLoweredHead",
  [Move.SKY_ATTACK]: "sText_PkmnIsGlowing",
  [Move.RAZOR_WIND]: "sText_PkmnWhippedWhirlwind",
};

/** Lasting effects starting, by move: the string and whether it names the user (atk) or the target (def). */
const VOLATILE_START: Partial<Record<Move, [TextId, "atk" | "def"]>> = {
  [Move.SUBSTITUTE]: ["sText_PkmnMadeSubstitute", "atk"],
  [Move.LEECH_SEED]: ["sText_PkmnSeeded", "def"],
  [Move.ENCORE]: ["sText_PkmnGotEncore", "def"],
  [Move.DISABLE]: ["sText_PkmnMoveWasDisabled", "def"],
  [Move.ATTRACT]: ["sText_PkmnFellInLove", "def"],
  [Move.TAUNT]: ["sText_PkmnFellForTaunt", "def"],
  [Move.TORMENT]: ["sText_PkmnSubjectedToTorment", "def"],
  [Move.NIGHTMARE]: ["sText_PkmnFellIntoNightmare", "def"],
  [Move.PERISH_SONG]: ["sText_PkmnPerishCountFell", "atk"],
  [Move.STOCKPILE]: ["sText_PkmnStockpiled", "atk"],
  [Move.INGRAIN]: ["sText_PkmnPlantedRoots", "atk"],
  [Move.CHARGE]: ["sText_PkmnChargingPower", "atk"],
  [Move.FOCUS_PUNCH]: ["sText_PkmnTighteningFocus", "atk"],
  [Move.DESTINY_BOND]: ["sText_PkmnTryingToTakeFoe", "atk"],
  [Move.PROTECT]: ["sText_PkmnProtectedItself2", "atk"],
  [Move.DETECT]: ["sText_PkmnProtectedItself2", "atk"],
  [Move.ENDURE]: ["sText_PkmnBracedItself", "atk"],
  [Move.FOLLOW_ME]: ["sText_PkmnCenterAttention", "atk"],
};

const VOLATILE_END: Partial<Record<Move, [TextId, "atk" | "def"]>> = {
  [Move.SUBSTITUTE]: ["sText_PkmnSubstituteFaded", "def"],
  [Move.ENCORE]: ["sText_PkmnEncoreEnded", "atk"],
  [Move.DISABLE]: ["sText_PkmnMoveDisabledNoMore", "atk"],
};

/** Effects that act once, by move. */
const ACTIVATE: Partial<Record<Move, [TextId, "atk" | "def"]>> = {
  [Move.PROTECT]: ["sText_PkmnProtectedItself", "def"],
  [Move.DETECT]: ["sText_PkmnProtectedItself", "def"],
  [Move.SUBSTITUTE]: ["sText_SubstituteDamaged", "def"],
  [Move.ENDURE]: ["sText_PkmnEnduredHit", "def"],
  [Move.MIST]: ["sText_PkmnProtectedByMist", "atk"],
};

const WEATHER: Record<Weather, Partial<Record<ConditionPhase, TextId>>> = {
  [Weather.UNSPECIFIED]: {},
  [Weather.RAIN]: { [ConditionPhase.START]: "sText_StartedToRain", [ConditionPhase.UPKEEP]: "sText_RainContinues", [ConditionPhase.END]: "sText_RainStopped" },
  [Weather.SUN]: { [ConditionPhase.START]: "sText_SunlightGotBright", [ConditionPhase.UPKEEP]: "sText_SunlightStrong", [ConditionPhase.END]: "sText_SunlightFaded" },
  [Weather.SANDSTORM]: { [ConditionPhase.START]: "sText_SandstormBrewed", [ConditionPhase.UPKEEP]: "sText_SandstormRages", [ConditionPhase.END]: "sText_SandstormSubsided" },
  [Weather.HAIL]: { [ConditionPhase.START]: "sText_StartedHail", [ConditionPhase.UPKEEP]: "sText_HailContinues", [ConditionPhase.END]: "sText_HailStopped" },
};

/** Weather an ability starts (Drizzle, Drought, Sand Stream; Snow Warning has no FireRed string). */
const WEATHER_ABILITY: Partial<Record<Weather, TextId>> = {
  [Weather.RAIN]: "sText_PkmnMadeItRain",
  [Weather.SUN]: "sText_PkmnsXIntensifiedSun",
  [Weather.SANDSTORM]: "sText_PkmnsXWhippedUpSandstorm",
};

const num = (n: number): Text => decimalText(n, NumberMode.LeftAlign, String(n).length);

/** The message(s) an event prints; none for most effects without one. */
export function eventMessages(texts: BattleTexts, e: BattleEvent, recent: Recent): Text[] {
  const msg = (label: TextId, args: MessageArgs = {}): Text[] => [texts.format(label, args)];
  const name = (effect: Effect | undefined): Text | null => effectName(texts, effect);
  const k = e.kind;
  switch (k.case) {
    case "moveUsed":
      return msg("sText_AttackerUsedX", { atk: k.value.battler, buff2: texts.join(texts.moveName(k.value.move), texts.text("sText_ExclamationMark")) });
    case "prepare": {
      const label = PREPARE[k.value.move];
      return label ? msg(label, { atk: k.value.battler }) : [];
    }
    case "cant":
      return cantMessage(texts, k.value.battler, k.value.reason, k.value.move);
    case "moveResult": {
      const def = k.value.battler;
      switch (k.value.result) {
        case HitResult.CRITICAL:
          return msg("sText_CriticalHit");
        case HitResult.SUPER_EFFECTIVE:
          return msg("sText_SuperEffective");
        case HitResult.NOT_VERY_EFFECTIVE:
          return msg("sText_NotVeryEffective");
        case HitResult.IMMUNE: {
          const from = k.value.from?.kind;
          if (from?.case === "ability" && from.value === Ability.LEVITATE) return msg("sText_PkmnMakesGroundMiss", { def, ability: from.value });
          return msg("sText_ItDoesntAffect", { def });
        }
        case HitResult.MISS:
          return msg("sText_AttackMissed", { atk: recent.mover ?? def });
        case HitResult.ONE_HIT_KO:
          return msg("sText_OneHitKO");
        case HitResult.NOTHING:
          return msg("sText_ButNothingHappened");
        case HitResult.NO_TARGET:
          return msg("sText_ButItFailed");
        default:
          return [];
      }
    }
    case "hitCount":
      return msg("sText_HitXTimes", { buff1: num(k.value.hits) });
    case "fail":
      return msg("sText_ButItFailed");
    case "damage":
      return damageMessage(texts, k.value.battler, k.value.from, name);
    case "heal": {
      if (recent.itemUsed) return [];
      const { battler, source } = k.value;
      const from = k.value.from?.kind;
      if (from?.case === "item") return msg("sText_PkmnsItemRestoredHealth", { scr: battler, item: from.value });
      if (from?.case === "ability") return msg("sText_PkmnRestoredHPUsing", { def: battler, ability: from.value });
      if (from?.case === "condition" && from.value === Condition.DRAIN) return msg("sText_PkmnEnergyDrained", { def: source ?? battler });
      if (from?.case === "move") return msg("sText_PkmnRegainedHealth", { def: battler });
      return [];
    }
    case "faint":
      return msg("sText_TargetFainted", { def: k.value.battler });
    case "statusSet": {
      const from = k.value.from?.kind;
      if (from?.case === "move" && from.value === Move.REST) return msg("sText_PkmnSleptHealthy", { atk: k.value.battler });
      const label = STATUS_SET[k.value.status];
      return label ? msg(label, { eff: k.value.battler }) : [];
    }
    case "statusCured": {
      const b = k.value.battler;
      if (b && !texts.isActive(b)) return [];
      const from = k.value.from?.kind;
      if (from?.case === "item") {
        const status = STATUS_NAMES[k.value.status];
        return msg("sText_PkmnsItemCuredProblem", { scr: b, item: from.value, buff1: status ? texts.text(status) : [] });
      }
      if (k.value.status === Status.SLEEP) return msg("sText_PkmnWokeUp", { atk: b });
      if (k.value.status === Status.FREEZE) return msg("sText_PkmnWasDefrosted2", { atk: b });
      if (k.value.status === Status.PARALYSIS) return msg("sText_PkmnHealedParalysis", { def: b });
      return msg("sText_PkmnStatusNormal", { atk: b });
    }
    case "teamCured": {
      const from = k.value.from?.kind;
      if (from?.case === "move" && from.value === Move.AROMATHERAPY) return msg("sText_SoothingAroma");
      return msg("sText_BellChimed");
    }
    case "statChange": {
      const { battler, stat, stages, lower } = k.value;
      const statName = texts.text(STAT_NAMES[stat] ?? "");
      if (stages === 0) return lower ? msg("sText_StatsWontDecrease", { def: battler, buff1: statName }) : msg("sText_StatsWontIncrease", { atk: battler, buff1: statName });
      const from = k.value.from?.kind;
      if (from?.case === "ability" && from.value === Ability.INTIMIDATE) return msg("sText_PkmnCutsAttackWith", { scr: recent.ability, def: battler, ability: from.value });
      const how = [...(stages >= 2 ? texts.text(lower ? "sText_StatHarshly" : "sText_StatSharply") : [EOS])];
      const change = texts.join(how, texts.text(lower ? "sText_StatFell" : "gBattleText_Rose"));
      return lower ? msg("gText_DefendersStatRose", { def: battler, buff1: statName, buff2: change }) : msg("sText_AttackersStatRose", { atk: battler, buff1: statName, buff2: change });
    }
    case "statSet": {
      const from = k.value.from?.kind;
      return from?.case === "move" && from.value === Move.BELLY_DRUM ? msg("sText_PkmnCutHPMaxedAttack", { atk: k.value.battler }) : [];
    }
    case "statsReset":
      return k.value.kind === StatsResetKind.ALL ? msg("sText_StatChangesGone") : [];
    case "statsCopied":
      return k.value.swapped ? [] : msg("sText_PkmnCopiedStatChanges", { atk: k.value.battler, def: k.value.source });
    case "volatileStart": {
      const { battler, source, amount } = k.value;
      const effect = k.value.effect?.kind;
      if (effect?.case === "condition") {
        if (effect.value === Condition.CONFUSION) {
          const from = k.value.from?.kind;
          if (from?.case === "condition" && from.value === Condition.FATIGUE) return msg("sText_PkmnFatigueConfusion", { atk: battler });
          return msg("sText_PkmnWasConfused", { eff: battler });
        }
        if (effect.value === Condition.TYPE_CHANGE) return msg("sText_PkmnChangedType", { atk: battler, buff1: texts.typeName(k.value.type) });
        return [];
      }
      if (effect?.case !== "move") return [];
      if (effect.value === Move.LOCK_ON || effect.value === Move.MIND_READER) return msg("sText_PkmnTookAim", { atk: source, def: battler });
      const entry = VOLATILE_START[effect.value];
      if (!entry) return [];
      const [label, who] = entry;
      return msg(label, { [who]: battler, buff1: effect.value === Move.DISABLE ? texts.moveName(k.value.move) : num(amount) });
    }
    case "volatileEnd": {
      const effect = k.value.effect?.kind;
      if (effect?.case === "condition" && effect.value === Condition.CONFUSION) return msg("sText_PkmnHealedConfusion", { atk: k.value.battler });
      if (effect?.case !== "move") return [];
      const entry = VOLATILE_END[effect.value];
      return entry ? msg(entry[0], { [entry[1]]: k.value.battler }) : [];
    }
    case "activate": {
      const { battler, source } = k.value;
      const effect = k.value.effect?.kind;
      if (effect?.case === "condition" && effect.value === Condition.CONFUSION) return msg("sText_PkmnIsConfused", { atk: battler });
      if (effect?.case !== "move") return [];
      if (effect.value === Move.ATTRACT) return msg("sText_PkmnInLove", { atk: battler, scr: source });
      if (effect.value === Move.SPITE) return msg("sText_PkmnReducedPP", { def: battler, buff1: texts.moveName(k.value.move), buff2: num(k.value.amount) });
      const entry = ACTIVATE[effect.value];
      return entry ? msg(entry[0], { [entry[1]]: battler }) : [];
    }
    case "weatherChange": {
      const from = k.value.from?.kind;
      const byAbility = WEATHER_ABILITY[k.value.weather];
      if (k.value.phase === ConditionPhase.START && from?.case === "ability" && byAbility) return msg(byAbility, { scr: k.value.source, ability: from.value });
      const label = WEATHER[k.value.weather][k.value.phase];
      return label ? msg(label) : [];
    }
    case "sideCondition": {
      const effect = k.value.effect?.kind;
      if (effect?.case !== "move") return [];
      const side: Battler = { $typeName: "pokeuniverse.battle.v1.Battler", foe: k.value.foe, partySlot: 0, position: 0 };
      if (k.value.phase === ConditionPhase.START) {
        if (effect.value === Move.REFLECT) return msg("sText_PkmnRaisedDef", { atk: side, move: effect.value });
        if (effect.value === Move.LIGHT_SCREEN) return msg("sText_PkmnRaisedSpDef", { atk: side, move: effect.value });
        if (effect.value === Move.SAFEGUARD) return msg("sText_PkmnCoveredByVeil", { atk: side });
        if (effect.value === Move.SPIKES) return msg("sText_SpikesScattered");
        return [];
      }
      if (k.value.phase !== ConditionPhase.END) return [];
      if (effect.value === Move.SAFEGUARD) return msg("sText_PkmnSafeguardExpired", { atk: side });
      return msg("sText_PkmnsXWoreOff", { atk: side, buff1: texts.moveName(effect.value) });
    }
    case "itemEnded": {
      const from = k.value.from?.kind;
      if (from?.case !== "move") return [];
      if (from.value === Move.KNOCK_OFF) return msg("sText_PkmnKnockedOff", { atk: recent.mover, def: k.value.battler, item: k.value.item });
      if (from.value === Move.THIEF || from.value === Move.COVET) return msg("sText_PkmnStoleItem", { atk: recent.mover, def: k.value.battler, item: k.value.item });
      return [];
    }
    case "itemUsed":
      return msg(k.value.foe ? "sText_Trainer1UsedItem" : "sText_PlayerUsedItem", { item: k.value.item });
    case "transform":
      return msg("sText_PkmnTransformedInto", { atk: k.value.battler, buff1: texts.name(k.value.target) });
    case "exp":
      return msg("sText_PkmnGainedEXP", { buff1: texts.name(k.value.battler), buff2: [EOS], buff3: num(k.value.amount) });
    default:
      return [];
  }
}

/** Cant: asleep, frozen, paralyzed, flinched, recharging, a move it can't use. */
function cantMessage(texts: BattleTexts, atk: Battler | undefined, reason: Effect | undefined, move: Move): Text[] {
  const msg = (label: TextId, args: MessageArgs = {}) => [texts.format(label, { atk, ...args })];
  const r = reason?.kind;
  if (r?.case === "status") {
    if (r.value === Status.SLEEP) return msg("sText_PkmnFastAsleep");
    if (r.value === Status.FREEZE) return msg("sText_PkmnIsFrozen");
    if (r.value === Status.PARALYSIS) return msg("sText_PkmnIsParalyzed");
  }
  if (r?.case === "condition") {
    if (r.value === Condition.FLINCH) return msg("sText_PkmnFlinched");
    if (r.value === Condition.RECHARGE) return msg("sText_PkmnMustRecharge");
    if (r.value === Condition.NO_PP) return msg("sText_NoPPLeft");
  }
  if (r?.case === "move") {
    if (r.value === Move.DISABLE) return msg("sText_PkmnMoveIsDisabled", { move });
    if (r.value === Move.TAUNT) return msg("sText_PkmnCantUseMoveTaunt", { move });
    if (r.value === Move.TORMENT) return msg("sText_PkmnCantUseMoveTorment", { move });
    if (r.value === Move.IMPRISON) return msg("sText_PkmnCantUseMoveSealed", { move });
    if (r.value === Move.ATTRACT) return msg("sText_PkmnImmobilizedByLove");
    if (r.value === Move.FOCUS_PUNCH) return msg("sText_PkmnLostFocus");
  }
  return [];
}

/** Damage not from the move being used: poison, burn, weather, recoil, confusion, hazards, items, abilities. */
function damageMessage(texts: BattleTexts, atk: Battler | undefined, from: Effect | undefined, name: (e: Effect | undefined) => Text | null): Text[] {
  const msg = (label: TextId, args: MessageArgs = {}) => [texts.format(label, { atk, scr: atk, ...args })];
  const f = from?.kind;
  if (!f) return [];
  if (f.case === "status") {
    if (f.value === Status.POISON || f.value === Status.TOXIC) return msg("sText_PkmnHurtByPoison");
    if (f.value === Status.BURN) return msg("sText_PkmnHurtByBurn");
    return [];
  }
  if (f.case === "weather") {
    if (f.value === Weather.SANDSTORM) return msg("sText_PkmnBuffetedBySandstorm");
    if (f.value === Weather.HAIL) return msg("sText_PkmnPeltedByHail");
    return [];
  }
  if (f.case === "condition") {
    if (f.value === Condition.RECOIL) return msg("sText_PkmnHitWithRecoil");
    if (f.value === Condition.CONFUSION) return msg("sText_ItHurtConfusion");
    return [];
  }
  if (f.case === "move") {
    if (f.value === Move.LEECH_SEED) return msg("sText_PkmnSappedByLeechSeed");
    if (f.value === Move.CURSE) return msg("sText_PkmnAfflictedByCurse");
    if (f.value === Move.NIGHTMARE) return msg("sText_PkmnLockedInNightmare");
    if (f.value === Move.SPIKES) return msg("sText_PkmnHurtBySpikes");
  }
  const what = name(from);
  return what ? msg("sText_PkmnHurtBy", { buff1: what }) : [];
}

/** A move's, item's or ability's name, for "<MON> is hurt by <X>!". */
function effectName(texts: BattleTexts, effect: Effect | undefined): Text | null {
  const e = effect?.kind;
  if (e?.case === "move") return texts.moveName(e.value);
  if (e?.case === "item") return texts.itemName(e.value);
  if (e?.case === "ability") return texts.abilityName(e.value);
  return null;
}

