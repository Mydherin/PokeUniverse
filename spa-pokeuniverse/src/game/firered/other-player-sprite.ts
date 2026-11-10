// Another player drawn the FireRed way (phase 8 D11): the same Red or Leaf sheets, frames and
// elevation rule as the own player (PlayerSprite), by feet like any object event (D6), with its
// following Pokémon (FollowerSprite). No name over it (FireRed shows none), nothing over it in a battle (D9).

import type { OtherPlayerModel } from "../world/others";
import type { WorldView } from "../world/view";
import { FollowerSprite } from "./follower-sprite";
import type { Assets } from "./manifest";
import { PlayerSprite } from "./player-sprite";

export class OtherPlayerSprite {
  private readonly trainer: PlayerSprite;
  private readonly follower: FollowerSprite;

  constructor(world: WorldView, assets: Assets, p: OtherPlayerModel) {
    this.trainer = new PlayerSprite(world, assets, p.gender);
    this.follower = new FollowerSprite(world, assets);
  }

  /** One frame, after the model's. `overFade`: left out of Sweet Scent's fade, as the own player. */
  update(p: OtherPlayerModel, overFade: boolean): void {
    this.trainer.overFade = overFade;
    this.trainer.update(p);
    this.follower.update(p.follower, p.overTiles);
  }

  destroy(): void {
    this.trainer.destroy();
    this.follower.destroy();
  }
}
