// How FireRed tells what using or giving an item did (item_use.c, item_menu.c, itemfinder.c):
// mic-core sends the outcome, this picks the text, its font and the sound before it. Shared by
// the bag's message box and the field's (an item registered to SELECT).

import { ItemOutcome, type ItemResult } from "@pokeuniverse/contracts/item/v1/bag";
import { Button } from "../gba/input";
import { decimalText, expandPlaceholders, FontId, NumberMode, PLACEHOLDER_PLAYER, PLACEHOLDER_STR_VAR_1, PLACEHOLDER_STR_VAR_2, type Text } from "../gba/text";
import type { Flow } from "./flow";
import type { SoundId, TextId } from "./manifest";

export interface ItemMessage {
  text: Text;
  font: FontId;
  /** Before the message: frames to wait, then a sound, and whether to wait for it to end. */
  delay: number;
  sound: SoundId | null;
  waitSound: boolean;
  /** The text doesn't wait for a press itself: A closes it (Task_WaitAButtonAndCloseContextMenu). */
  waitA: boolean;
  /** A field script's sign message (MSGBOX_SIGN): the signpost frame, closed by A or B. */
  sign?: boolean;
}

interface Template {
  text: TextId;
  font?: FontId;
  delay?: number;
  sound?: SoundId;
  waitSound?: boolean;
  waitA?: boolean;
  /** STR_VAR_1 is the value with this many digits (left-aligned). */
  digits?: number;
}

const TEMPLATES: Partial<Record<ItemOutcome, Template>> = {
  [ItemOutcome.NOT_NOW]: { text: "gText_OakForbidsUseOfItemHere", font: FontId.Male },
  [ItemOutcome.NO_POKEMON]: { text: "gText_ThereIsNoPokemon", waitA: true },
  [ItemOutcome.CANT_BE_HELD]: { text: "gText_ItemCantBeHeld", waitA: true },
  // FieldUseFunc_Repel: SE_REPEL, its end, then the item is used up.
  [ItemOutcome.USED]: { text: "gText_PlayerUsedVar2", sound: "se_repel", waitSound: true },
  [ItemOutcome.REPEL_LINGERS]: { text: "gText_RepelEffectsLingered" },
  [ItemOutcome.COINS]: { text: "gText_CoinCase", digits: 4 },
  [ItemOutcome.BERRY_POWDER]: { text: "gText_PowderQty", digits: 5 },
  [ItemOutcome.CATCHY_TUNE]: { text: "gText_PlayedPokeFluteCatchy" },
  // Task_UsedBlackWhiteFlute: 8 frames, then SE_GLASS_FLUTE with the message.
  [ItemOutcome.WILD_LURED]: { text: "gText_UsedVar2WildLured", delay: 8, sound: "se_glass_flute" },
  [ItemOutcome.WILD_REPELLED]: { text: "gText_UsedVar2WildRepelled", delay: 8, sound: "se_glass_flute" },
  [ItemOutcome.NO_RESPONSE]: { text: "gText_NopeTheresNoResponse" },
};

/** The message for an item's outcome; null when the outcome shows none. */
export function itemMessage(flow: Flow, result: ItemResult, playerName: Text): ItemMessage | null {
  const t = TEMPLATES[result.outcome];
  if (!t) return null;
  const name = flow.assets.itemName(result.item);
  const text = expandPlaceholders(flow.assets.text(t.text), {
    [PLACEHOLDER_PLAYER]: playerName,
    [PLACEHOLDER_STR_VAR_1]: t.digits ? decimalText(result.value, NumberMode.LeftAlign, t.digits) : name,
    [PLACEHOLDER_STR_VAR_2]: name,
  });
  return { text, font: t.font ?? FontId.Normal, delay: t.delay ?? 0, sound: t.sound ?? null, waitSound: t.waitSound ?? false, waitA: t.waitA ?? false };
}

/**
 * Plays an item message frame by frame: the wait and sound before it, the text printed by
 * `show`, then (when it asks) A. Used in the bag and on the field.
 */
export class ItemMessagePlayer {
  private stage = 0;
  private frames: number;

  constructor(
    private readonly flow: Flow,
    private readonly msg: ItemMessage,
    private readonly show: (text: Text, font: FontId, sign: boolean) => void,
    private readonly printing: () => boolean,
  ) {
    this.frames = msg.delay;
  }

  /** One frame; true once the message was read. */
  update(): boolean {
    const { flow, msg } = this;
    if (this.stage === 0) {
      if (this.frames-- > 0) return false;
      if (msg.sound) flow.play(msg.sound);
      this.stage = 1;
    }
    switch (this.stage) {
      case 1:
        if (msg.waitSound && flow.gba.sound.isPlaying("se")) return false;
        this.show(msg.text, msg.font, msg.sign ?? false);
        this.stage = 2;
        return false;
      case 2:
        if (this.printing()) return false;
        if (!msg.waitA) return true;
        this.stage = 3;
        return false;
      default:
        if (msg.sign) return flow.gba.input.isPressed(Button.A | Button.B);
        if (!flow.gba.input.isPressed(Button.A)) return false;
        flow.play("se_select");
        return true;
    }
  }
}
