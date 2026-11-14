// NPCs on the overworld in FireRed's art: each map sprite ID's 16×32 frames and NPC palette
// (object_event_graphics_info.h), standing and facing (sAnimTable_Standard's face frames).

import { Direction } from "@pokeuniverse/contracts/map/v1/map";
import type { ClientNpc } from "@pokeuniverse/contracts/map/v1/map";
import { TILE } from "../world/map";
import type { CharacterView, WorldView } from "../world/view";
import type { Assets, GraphicId } from "./manifest";
import { characterSheet } from "./player-sprite";

/** A map sprite ID's frames and palette. New NPC art goes here, in the manifest and in the Makefile. */
const SPRITES: Record<string, { pic: GraphicId; palette: GraphicId }> = {
  cooltrainer_m: { pic: "owCooltrainerM", palette: "owNpcBluePal" },
  mom: { pic: "owMom", palette: "owNpcBluePal" },
  cable_club_receptionist: { pic: "owCableClubReceptionist", palette: "owNpcWhitePal" },
  union_room_receptionist: { pic: "owUnionRoomReceptionist", palette: "owNpcWhitePal" },
};

/** Standing frames: south, north, west; east is west flipped. */
const STANDING: Partial<Record<Direction, number>> = {
  [Direction.SOUTH]: 0,
  [Direction.NORTH]: 1,
  [Direction.WEST]: 2,
  [Direction.EAST]: 2,
};

export class NpcSprite {
  private readonly view: CharacterView | null;

  constructor(
    world: WorldView,
    assets: Assets,
    readonly npc: ClientNpc,
  ) {
    const art = SPRITES[npc.sprite];
    // An NPC whose art isn't listed still blocks its cell; it just isn't drawn.
    this.view = art ? world.addCharacter(characterSheet(`firered-npc-${npc.sprite}`, assets.get(art.palette).palette, [[assets.get(art.pic).image!, 0, 3]])) : null;
    // Feet on its cell: the frame starts 16 pixels above it.
    this.view?.setPosition(npc.x * TILE, npc.y * TILE - 16);
    this.face(npc.facing);
  }

  face(d: Direction): void {
    this.view?.setFrame(STANDING[d] ?? 0, d === Direction.EAST);
  }

  destroy(): void {
    this.view?.destroy();
  }
}
