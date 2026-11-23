#!/bin/sh
# FireRed's graphics for a Docker build without `make` (spa-pokeuniverse/Dockerfile, ASSETS=build: the Mooi
# development preview). Does what `make graphics` does, with the same lists: keep both in step.
# Runs in the node image with the repository at /repo and the references fetched into /repo/references.
set -eu

FIRERED=/repo/references/pokefirered
EXPANSION=/repo/references/pokeemerald-expansion
OUT=/repo/spa-pokeuniverse/public/firered

FIRERED_GFX="intro title_screen main_menu text_window oak_speech naming_screen items tm_case berry_pouch item_pc pokedex party_menu summary_screen battle_interface battle_anims evolution_scene pokemon_special_anim pokemon_storage trade"
FIRERED_GFX_FILES="door_anims/cable_club.png weather/fog_horizontal.png fonts/latin_normal.png fonts/latin_male.png fonts/latin_small.png fonts/down_arrows.png
	fonts/down_arrow_3.png fonts/keypad_icons.png interface/std_menu.pal interface/status_icons.png
	$(for b in poke great ultra master safari net dive nest repeat timer luxury premier; do echo "interface/ball/$b.png"; done)
	pokemon/nidoran_f/front.png pokemon/nidoran_f/normal.pal
	object_events/pics/people/red_normal.png object_events/pics/people/green_normal.png object_events/palettes/player.pal
	object_events/pics/people/red_surf_run.png object_events/pics/people/green_surf_run.png
	object_events/pics/people/cooltrainer_m.png object_events/pics/people/mom.png object_events/palettes/npc_blue.pal
	object_events/pics/people/cable_club_receptionist.png object_events/pics/people/union_room_receptionist.png object_events/palettes/npc_white.pal
	field_effects/pics/tall_grass.png field_effects/palettes/general_1.pal
	help_system/msg_window.png trainer_card/tiles.png trainer_card/front.bin trainer_card/back.bin trainer_card/bg.bin
	trainer_card/blue.pal trainer_card/female_bg.pal trainers/front_pics/red_front_pic.png trainers/front_pics/leaf_front_pic.png
	trainers/palettes/red.pal trainers/palettes/leaf.pal
	item_menu/bg.png item_menu/bg.bin item_menu/bg_item_pc.bin item_menu/bg_female.pal item_menu/list.bin item_menu/bag_window_pal.pal
	interface/bag_male.png interface/bag_female.png interface/bag.pal interface/red_arrow_other.png interface/red_arrow.pal
	interface/select_button.png interface/bag_swap.png interface/selector_outline.png
	interface/menu_info.png interface/pokemon_types.pal interface/dex_caught_pokeball.pal
	misc/option_menu.pal misc/markings2.png misc/mon_markings.png
	$(for t in grass longgrass sand underwater water pond mountain cave building; do for f in terrain.png terrain.bin terrain.pal anim.png anim.bin; do echo "battle_terrain/$t/$f"; done; done)
	battle_terrain/indoor/plain.pal interface/text_pp.pal battle_transitions/grid_square.png battle_transitions/sliding_pokeball.pal
	trainers/front_pics/cool_trainer_m_front_pic.png trainers/palettes/cool_trainer_m.pal
	trainers/back_pics/red_back_pic.png trainers/back_pics/leaf_back_pic.png trainers/palettes/red_back_pic.pal trainers/palettes/leaf_back_pic.pal"
EXPANSION_GFX_FILES="interface/category_icons.png balls/heal.png balls/dusk.png balls/quick.png"
EXPANSION_GFX="battle_anims"
FIRERED_FONTS="Normal:normal Male:male Small:small NormalCopy1:normal_copy_1"

mkdir -p "$OUT/graphics/expansion"
for d in $FIRERED_GFX; do cp -R "$FIRERED/graphics/$d" "$OUT/graphics/"; done
for f in $FIRERED_GFX_FILES; do mkdir -p "$OUT/graphics/$(dirname "$f")" && cp "$FIRERED/graphics/$f" "$OUT/graphics/$f"; done
# The Cable Club door's palette is its tileset's (field_door.c sDoorAnimPalettes_CableClub: 8).
cp "$FIRERED/data/tilesets/secondary/pokemon_center/palettes/08.pal" "$OUT/graphics/door_anims/cable_club.pal"
for d in $EXPANSION_GFX; do cp -R "$EXPANSION/graphics/$d" "$OUT/graphics/expansion/"; done
for f in $EXPANSION_GFX_FILES; do mkdir -p "$OUT/graphics/expansion/$(dirname "$f")" && cp "$EXPANSION/graphics/$f" "$OUT/graphics/expansion/$f"; done
for font in $FIRERED_FONTS; do
  sed -n "/sFont${font%%:*}LatinGlyphWidths\[\] =/,/};/{/=/d;p;}" "$FIRERED/src/text.c" | tr -cd '0-9,' | sed 's/^/[/; s/,*$/]/' \
    > "$OUT/graphics/fonts/latin_${font##*:}_widths.json"
done
node /repo/infra/graphics/item-icons.mjs "$FIRERED" "$OUT/graphics/items/icons.json" "$EXPANSION" \
  /repo/lib-contracts/proto/pokeuniverse/item/v1/catalog.proto "$OUT/graphics"
