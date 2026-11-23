---
id: 10-trade-animation
title: "Trade: animation and after"
status: building
depends: [09-trade-menu]
context: [context/social.md, context/references.md]
---

# M10: Trade, Animation and After

Part of [Phase 9](../PHASE.md). Decisions: [context/social.md](../../../context/social.md#trading) D24. References: `trade_scene.c` (`CB2_LinkTrade`, `DoTradeAnim_Wireless`, `CB2_TryLinkTradeEvolution`), `graphics/trade/`.

## Resume Here

**Session 1 (2026-11-23): server done (Go build + vet green, committed), client not started.** Next: write `spa-pokeuniverse/src/game/firered/trade-scene.ts` (FireRed's `DoTradeAnim_Wireless`, notes below), add its art to `manifest.ts`, wire it in `trade-menu.ts` (client plan below), then the overworld's evolution and SUMMARY. No tasks checked yet: the server parts of *Evolution* and *After* are done.
- **Server, as built:** contracts (`social.proto`): `TradeDone.evolves_to` (species, unset none), `LinkIntent.trade_scene_done`(12) `TradeSceneDone{}`, `TradeMemberAction.scene_done`(6). `pokemon.Party.TradeEvolution(slot)` (EVERSTONE stops it); `Evolve` also spends a TRADE evolution's held item. `world/trade.go`: `swap` marks each received Pokémon caught in its trainer's Pokédex in the swap's transaction (`catchReceived`), sends `TradeDone` with `evolves_to`, **no menu**: `tradeMenu.scene` holds it until both sides send `TradeSceneDone` (`backToMenu` re-reads the member's party, sends CHOOSING to both); intents other than `TradeSceneDone` are ignored meanwhile. `tradeReceived` (leader in `swap`, member in `onTradeEvent` after `reloadParty`) sets the Pokédex and `p.evolving.offer(slot, TradeEvolution)`, so the client asks with Phase 6's `EvolvePokemon{slot}` (`zone.evolve`, which also does the National Dex check and the Pokédex). The explicit `syncFollower()` calls in `trade.go` were dropped: `showChanges` on the tick does it and also emits the zone event (the explicit call hid it from the partner).
- **Already there (no work):** 1.5× EXP for traded Pokémon (`battle/team.go` `Traded: p.OT.ID != trainerID`, `mic-battles/src/exp.ts`); OT and met data travel with the row (the swap moves rows).
- **FireRed scene, as read (`references/pokefirered/src/trade_scene.c`; run `git submodule update --init references/pokefirered` if it's empty):** BGs (`sBgTemplates`): BG0 text (battle textbox gfx/tilemap/palette 0, window 0 at 2,15 26×4, fill 15, colors [15,1,6], `DrawTextOnTradeWindow`), BG1 tiles charbase 0, BG2 charbase 1. `SetTradeSequenceBgGpuRegs(n)` (l.1113): 0 = BG2 512×256 `gba.png` (`gTradeGba_Gfx`) + `gba_pal2.pal` at BG palette 1 (3 palettes) + `shadow_map.bin`, bg2hofs 0xB4, BG0+BG2; 1 = BG1 256×512 `gba_map_wireless.bin` on `gba.png`, bg1vofs 0x15C, BG1 only; 2 = mode 1, BG1 `wireless_signal_closeup.bin`, BlendPalettes(0x8,16,black); 3 = BG palette 3 black, BG2 `wireless_signal.png`/`.bin`, bg2vofs 0x50, BG1+BG2; 4 = affine BG2 8bpp `gba_affine.png` + `gba_affine_map_wireless.bin` 128×128, tex (0x40,0x5C), sXY 0x20, zoom 0x400; 5 = bg1 offsets 0; 6 = like 4 but sXY 0x100, zoom 0x80, src (120,80); 7 = like 0 (bg2 offsets 0, BLDCNT 0). Start (`CB2_LinkTrade`): bg2tex 64,64, src 120,80, sXY 256; regs 5 then 0; fade in from black. Mon pics: own at B_POSITION_OPPONENT_LEFT, partner OPPONENT_RIGHT, sprites at (120,60) invisible, y2 = front pic y_offset.
  - **States (l.1814-2307):** music `mus_evolution`; own pic slides in (x2 −180 → 0, +3/frame while bg2hofs −3); "gText_XWillBeSentToY" + own cry; 80 frames → `PokeBalls.takeBack(mon,120,32,2,1,20,0xfffff)` + "gText_ByeByeVar1"; when the ball's callback is done → bouncing ball (`sSpriteTemplate_Pokeball` 16×16 affine, `pokeball.png`/pal, anims SpinOnce/SpinTwice 12 frames ×3) at (120,32) with `SpriteCB_BouncingPokeballDepart` (y2 += `sTradeBallVerticalVelocityTable`, SE `se_ball_bounce_1` at 22, at 44 `se_m_mega_kick` + fade its palette to white, then squish affine 1 after 20 frames, rise 23 frames, destroy → state 14); fade out, regs 4, clear window, fade in; zoom out (zoom −0x34 until ≤0x100, sXY = 0x8000/zoom) → regs 1; 20 frames → regs 3 + GBA screen flash short (64×32 `gba_screen.png`, `gba.pal`, frames 0,32,64,96,64,32,0 ×2 frames, loop 2; SE `se_m_minimize` every 15 frames); flash ended → BLDCNT BG1+OBJ over BG2, BLDALPHA(16,4), `Task_AnimateWirelessSignal` (l.2818: BG palette 3 from `wireless_signal_send.pal` rows by `sWirelessSignalAnimParams`, `se_m_heal_bell` when index 0 starts; params `{16,-1}` = end); pan bg1vofs −1 to 316; glow (32×32 `link_mon_glow.png`, `link_mon.pal`, affine ±10 every 5, SE `se_m_swagger2` every 10 while visible) + shadow (16×32 `link_mon_shadow.png` small anim tile 8; its palette color 4 cycled through `sLinkMonShadow_Pal` while data[1]==0) at (120,80); bg1vofs −3 to 166; both y −2 until y < −8; fade out, regs 2, fade in with two shadows at (111,170) and (129,−10) moving y2 ∓3, `se_warp_out`; at y2 ≤ −90 `Task_OpenCenterWhiteColumn` (WIN0 from 120 ±5/frame to <80, inside BG0/BG1/OBJ, outside OBJ) and 3× BlendPalettes(0x8,16,white); mon pics at (40,192) and (200,−32) moving y2 ∓3 (own pic h-flipped by affine −0x100 unless species not flipped), `se_warp_in` when own y2 crosses −160, at < −222 hide, `Task_CloseCenterWhiteColumn`; shadows exit to −222, fade out; regs 1 (bg1vofs 166), regs 3 (bg2vofs 412), glow+shadow at (120,−20); fade in; move y2 +4 until y = 64; pan bg1/bg2 +3 to 316, at 10 frames signal task with `wireless_signal_receive.pal`; destroy; wait task; 10 frames; bg1vofs +1 to 348; long GBA flash (loop 8); regs 6, `se_m_sand_attack`; zoom in (+0x34 to 0x400); fade out; regs 5 + 7; fade in; ball arrives (120,−8) `SpriteCB_BouncingPokeballArrive` (y +4 to 74, then table from 22, SE bounce 1/2/3/4 at 22/66/92/107, ends at 108), anim 1, affine 2 (unsquish), ball palette white fading back; then partner pic at (120, y_offset+60), `PokeBalls.release(mon,120,84,2,1,20,0xfffff)`; BG0 on, "gText_XSentOverY"; 60 frames → partner cry; cry done → 10 frames `mus_evolved` fanfare, at 250 "gText_TakeGoodCareOfX"; 60 frames; done (link trade). Texts: STR_VAR_1 partner name, 2 own nickname, 3 received nickname.
  - **Engine:** `gba/sprites.ts` (`Sprite`: x,y,x2,y2,data,callback, `callbackDummy`, `startAnim`, `startAffineAnim`, `animEnded`; `Sprites.create/destroy/loadSheet`), `gba/palette.ts` (`load`, `blendPalettes`, `beginFade(mask, delay, from, to, color)`, `fadeActive`, `loadSpritePalette`), `gba/video.ts` (`Background`: tiles, bpp8, map, size, x/y in 1/256 px, `affine`, `setAffine`; `video.win0`, `Layer`, `Effect`). `PokeBalls` (`firered/pokeball.ts`) has `takeBack` (CreateTradePokeballSprite) and `release` (CreatePokeballSpriteToReleaseMon); their final callback is a fresh `() => {}`, not `callbackDummy`: detect the end another way (e.g. ball `invisible`/destroyed, or add a done flag). Mon front pics: see how `battle/evolution.ts` / `field-evolution.ts` create them. `trade-menu.ts` shows BG/window/palette setup (`initBg`, `Window`, `assets.get(...)`).
- **Client plan:** `TradeMenu.handle(tradeDone)` keeps the own given and the received Pokémon (`parties[PLAYER][ownSlot]`, `parties[PARTNER][otherSlot]`) and `evolvesTo`; `afterTrade` (black) runs the scene instead of waiting for CHOOSING, then (if `evolvesTo`) the overworld's `startFieldEvolution(…, {slot, species})` (stoppable, asks `EvolvePokemon`), then `host.sceneDone()` (→ `LinkIntent.tradeSceneDone`), black until CHOOSING, then `open()`. SUMMARY: "Met in a trade" text when OT differs (look up FireRed's `PokeSum_PrintTrainerMemo_Mon` for the traded case; the client uses `gText_PokeSum_ApparentlyMet` now).

## Tasks

- **Scene:** FireRed's wireless trade scene with both Pokémon (front pics, Poké Balls, the signal, cries, music and sounds), the "{NAME} sent over {MON}" / "Take good care of {MON}" texts; art from `make graphics`.
- **Evolution:** the server decides the Gen 4 trade evolutions (D24, held item used up, Everstone) with the swap and saves it in the same transaction; the client plays Phase 6's evolution scene after the trade scene (B cancels as FireRed: the evolution doesn't happen and the item isn't used).
- **After:** OT and met data kept, "Met in a trade" in SUMMARY when OT differs; 1.5× EXP flag (Gen 4) used by battle EXP; Pokédex seen and caught; follower updated if the lead changed; both back in the trade menu.

## Decisions

- **B stops the trade evolution** (the task, Gen 4's rule): FireRed's `Task_TradeEvolutionScene` can't be stopped; the stop is Gen 4's, shown with Phase 6's scene (D24), B as in a level evolution. Stopped: nothing is sent, the item stays; the offer is dropped with the next party change.
- **The evolution is decided with the swap, saved when its scene isn't stopped** (the task said "saved in the same transaction"): B must be able to stop it, so the swap's transaction decides it (`TradeDone.evolves_to`, `p.evolving`) and the evolution saves in its own transaction on `EvolvePokemon`, as Phase 6's. A crash between leaves it unevolved, as a stopped one.
- **The menu comes back once both scenes end** (FireRed's `CB2_WaitTradeComplete` / `READY_FINISH_TRADE`): an evolution changes the party the menu shows, so the leader re-reads both after both `TradeSceneDone`.
- **"Traded" is OT ≠ trainer** (FireRed's and Gen 4's own test), no stored flag.

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Scene | Trade two Pokémon | FireRed's scene, texts, sounds (compare the emulator once) | ⬜ |
| 2 | Trade evolution | Trade a Kadabra | Evolves into Alakazam for the receiver | ⬜ |
| 3 | Item evolution | Onix holding Metal Coat | Steelix, item gone | ⬜ |
| 4 | Everstone | Kadabra holding Everstone | No evolution | ⬜ |
| 5 | Cancel evolution | B during the evolution | Stays; item kept | ⬜ |
| 6 | Summary, Pokédex | Check the received one | "Met in a trade", OT the other; Pokédex caught | ⬜ |
| 7 | EXP | Battle with it | 1.5× EXP | ⬜ |
| 8 | Follower | Trade the lead | Follower changes | ⬜ |

## Log

- 2026-11-23: session 1 checkpoint: FireRed's wireless scene read and noted in Resume Here; client next.
- 2026-11-23: session 1: server (contracts, trade evolution, Pokédex in the swap, menu held until both scenes end); Go build + vet green.
