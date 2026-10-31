// The trainer's options (the OPTION menu's choices) and what each one means to the game:
// text speed, window frame, sound and button mode. Every option is numbered from 1, in the
// order FireRed lists its values, so value - 1 is FireRed's own number.

import { create } from "@bufbuild/protobuf";
import {
  BattleScene,
  BattleStyle,
  ButtonMode,
  OptionsSchema,
  SoundMode,
  TextSpeed,
  type Options,
} from "@pokeuniverse/contracts/trainer/v1/trainer";
import { FRAME_TYPES } from "./manifest";

export type { Options };

/** One option of the menu: its field and how many values it has. */
export type OptionField = "textSpeed" | "battleScene" | "battleStyle" | "sound" | "buttonMode" | "frame";

export const OPTION_COUNTS: Record<OptionField, number> = {
  textSpeed: 3,
  battleScene: 2,
  battleStyle: 2,
  sound: 2,
  buttonMode: 3,
  frame: FRAME_TYPES,
};

/** Sets one option to a value from 1 to its count (every field is a number: enums and the frame). */
export function setOption(options: Options, field: OptionField, value: number): void {
  (options as Record<OptionField, number>)[field] = value;
}

/** SetDefaultOptions: what a New Game starts with, and a trainer without saved options. */
export const DEFAULT_OPTIONS: Options = create(OptionsSchema, {
  textSpeed: TextSpeed.MID,
  battleScene: BattleScene.ON,
  battleStyle: BattleStyle.SHIFT,
  sound: SoundMode.MONO,
  buttonMode: ButtonMode.HELP,
  frame: 1,
});

/** The options as saved, any missing or unknown value back to its default (as the game does on load). */
export function validOptions(options: Options | undefined): Options {
  const out = create(OptionsSchema, DEFAULT_OPTIONS);
  if (!options) return out;
  for (const field of Object.keys(OPTION_COUNTS) as OptionField[]) {
    const value = options[field];
    if (value >= 1 && value <= OPTION_COUNTS[field]) setOption(out, field, value);
  }
  return out;
}

/** GetPlayerTextSpeedDelay: frames per character. */
export function textSpeedDelay(options: Options): number {
  return options.textSpeed === TextSpeed.SLOW ? 8 : options.textSpeed === TextSpeed.FAST ? 1 : 4;
}

/** sWindowVerticalScrollSpeeds: pixels a prompt scroll moves per frame. */
export function textScrollSpeed(options: Options): number {
  return options.textSpeed === TextSpeed.SLOW ? 1 : options.textSpeed === TextSpeed.FAST ? 4 : 2;
}
