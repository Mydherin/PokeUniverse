// FireRed's battle strings (battle_message.c): their {B_...} placeholders (FD xx, the battle's
// own meaning of those bytes) become names, moves, items and abilities, as
// BattleStringExpandPlaceholders does. The foe's Pokémon get "Foe " (or "Wild ") before their name.

import type { Battler, BattlerInfo } from "@pokeuniverse/contracts/battle/v1/event";
import type { BattleTrainer } from "@pokeuniverse/contracts/battle/v1/view";
import { Type } from "@pokeuniverse/contracts/species/v1/catalog";
import { EOS, expandPlaceholders, joinText, PLACEHOLDER_PLAYER, type Text } from "../../gba/text";
import type { Flow } from "../flow";
import { WORLD_TEXTS, type TextId } from "../manifest";

const PLACEHOLDER = 0xfd;

/** The battle placeholders (charmap.txt B_*). */
const enum B {
  Buff1 = 0x00,
  Buff2 = 0x01,
  PlayerMon1Name = 0x05,
  OpponentMon1Name = 0x06,
  AtkNameWithPrefix = 0x0f,
  DefNameWithPrefix = 0x10,
  EffNameWithPrefix = 0x11,
  ActiveNameWithPrefix = 0x12,
  ScrActiveNameWithPrefix = 0x13,
  CurrentMove = 0x14,
  LastMove = 0x15,
  LastItem = 0x16,
  LastAbility = 0x17,
  AtkAbility = 0x18,
  DefAbility = 0x19,
  ScrActiveAbility = 0x1a,
  EffAbility = 0x1b,
  Trainer1Class = 0x1c,
  Trainer1Name = 0x1d,
  PlayerName = 0x23,
  Trainer1LoseText = 0x24,
  AtkPrefix1 = 0x28,
  DefPrefix1 = 0x29,
  AtkPrefix2 = 0x2a,
  DefPrefix2 = 0x2b,
  AtkPrefix3 = 0x2c,
  DefPrefix3 = 0x2d,
  Buff3 = 0x30,
}

/**
 * What a message is about. The attacker, defender, effect and "scripting" battlers all name
 * Pokémon; the active one is the Pokémon choosing (What will … do?).
 */
export interface MessageArgs {
  atk?: Battler;
  def?: Battler;
  eff?: Battler;
  scr?: Battler;
  buff1?: Text;
  buff2?: Text;
  buff3?: Text;
  move?: number;
  item?: number;
  ability?: number;
}

const key = (b: Battler) => `${b.foe ? 1 : 0}:${b.partySlot}`;

export class BattleTexts {
  /** Every Pokémon seen in this battle, by side and party slot: their names stay after they faint. */
  private readonly known = new Map<string, BattlerInfo>();

  constructor(
    private readonly flow: Flow,
    private readonly playerName: Text,
    private readonly trainer: BattleTrainer | undefined,
    /** The Pokémon is on the field now. */
    readonly isActive: (b: Battler) => boolean,
    /** A party Pokémon's name, for one not seen in this screen (a battle drawn again). */
    private readonly benchName: (slot: number) => Text | undefined = () => undefined,
  ) {}

  /** One of the game's strings, as it is. */
  text(id: TextId): Text {
    return this.flow.assets.text(id);
  }

  join(...texts: Text[]): number[] {
    return joinText(...texts);
  }

  moveName(move: number): Text {
    return this.flow.assets.moveName(move);
  }

  itemName(item: number): Text {
    return this.flow.assets.itemName(item);
  }

  abilityName(ability: number): Text {
    return this.flow.assets.abilityName(ability);
  }

  /** NORMAL, FIGHT… (gTypeNames). */
  typeName(type: Type): Text {
    return this.flow.assets.text(`TYPE_${Type[type] ?? ""}`);
  }

  remember(info: BattlerInfo): void {
    if (info.battler) this.known.set(key(info.battler), info);
  }

  info(b: Battler | undefined): BattlerInfo | undefined {
    return b ? this.known.get(key(b)) : undefined;
  }

  /** Its nickname, or its species' name. */
  name(b: Battler | undefined): Text {
    const info = this.info(b);
    if (!info) return (b && !b.foe && this.benchName(b.partySlot)) || [EOS];
    return info.nickname ? this.flow.encode(info.nickname) : this.flow.assets.species(info.species).name;
  }

  /** "Foe " (a trainer's) or "Wild " (a wild one) and the name for the foe's; the name for the player's. */
  nameWithPrefix(b: Battler | undefined): Text {
    if (!b?.foe) return this.name(b);
    const prefix = this.flow.assets.text(this.trainer ? "sText_FoePkmnPrefix" : "sText_WildPkmnPrefix");
    return [...strip(prefix), ...this.name(b)];
  }

  /** "Ally" or "Foe" (B_ATK_PREFIX1-3). */
  private sidePrefix(b: Battler | undefined): Text {
    return this.flow.assets.text(b?.foe ? "sText_FoePkmnPrefix2" : "sText_AllyPkmnPrefix");
  }

  /** COOLTRAINER and the like (gTrainerClassNames). */
  trainerClass(): Text {
    return this.flow.assets.text(`TRAINER_CLASS_${(this.trainer?.trainerClass ?? "").toUpperCase()}`);
  }

  trainerName(): Text {
    return this.flow.encode(this.trainer?.name ?? "");
  }

  /** The string `label` with its placeholders filled in. */
  format(label: TextId, args: MessageArgs = {}): number[] {
    return this.expand(this.flow.assets.text(label), args);
  }

  expand(text: Text, args: MessageArgs): number[] {
    const out: number[] = [];
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === EOS) break;
      if (c !== PLACEHOLDER) {
        out.push(c);
        continue;
      }
      out.push(...strip(this.placeholder(text[++i], args)));
    }
    out.push(EOS);
    return out;
  }

  private placeholder(code: number, a: MessageArgs): Text {
    const { assets } = this.flow;
    switch (code) {
      case B.Buff1:
        return a.buff1 ?? [];
      case B.Buff2:
        return a.buff2 ?? [];
      case B.Buff3:
        return a.buff3 ?? [];
      case B.PlayerMon1Name:
      case B.OpponentMon1Name:
        return this.name(a.atk ?? a.scr);
      case B.AtkNameWithPrefix:
        return this.nameWithPrefix(a.atk);
      case B.DefNameWithPrefix:
        return this.nameWithPrefix(a.def ?? a.atk);
      case B.EffNameWithPrefix:
        return this.nameWithPrefix(a.eff ?? a.def ?? a.atk);
      case B.ActiveNameWithPrefix:
        return this.nameWithPrefix(a.atk);
      case B.ScrActiveNameWithPrefix:
        return this.nameWithPrefix(a.scr ?? a.atk);
      case B.CurrentMove:
      case B.LastMove:
        return a.move ? assets.moveName(a.move) : [];
      case B.LastItem:
        return a.item ? assets.itemName(a.item) : [];
      case B.LastAbility:
      case B.AtkAbility:
      case B.DefAbility:
      case B.ScrActiveAbility:
      case B.EffAbility:
        return a.ability ? assets.abilityName(a.ability) : [];
      case B.Trainer1Class:
        return this.trainerClass();
      case B.Trainer1Name:
        return this.trainerName();
      case B.PlayerName:
        return this.playerName;
      case B.Trainer1LoseText:
        return expandPlaceholders(assets.text(WORLD_TEXTS[this.trainer?.defeatText ?? ""] ?? ""), { [PLACEHOLDER_PLAYER]: this.playerName });
      case B.AtkPrefix1:
      case B.AtkPrefix2:
      case B.AtkPrefix3:
        return this.sidePrefix(a.atk);
      case B.DefPrefix1:
      case B.DefPrefix2:
      case B.DefPrefix3:
        return this.sidePrefix(a.def ?? a.atk);
      default:
        return [];
    }
  }
}

/** A text without its EOS. */
function strip(text: Text): number[] {
  const end = text.indexOf(EOS);
  return [...(end < 0 ? text : text.slice(0, end))];
}
