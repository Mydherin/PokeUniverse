package world

import (
	"pokeuniverse/mic-core/internal/pokemon"

	socialv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/social/v1"

	worldv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/world/v1"
)

// The Pokémon Center 2F's attendants (pokefirered data/scripts/cable_club.inc), as if the
// Wireless Adapter were connected (phase-9 D17). Their checks read the party, so their scripts
// are built per player. The Pokédex check (FLAG_SYS_POKEDEX_GET) waits for the story flags (O20);
// there are no eggs, so no Bad Egg check.

// partyScripts are the NPC scripts built from the player's party, by lib-maps object `script`.
var partyScripts = map[string]func(pokemon.Party) Script{
	"common.wireless_club_attendant": wirelessClubAttendant,
	"common.union_room_attendant":    unionRoomAttendant,
	"common.direct_corner_attendant": directCornerAttendant,
}

// scriptBuilder writes a script with gotos: labels name steps, resolved once it's built.
type scriptBuilder struct {
	steps  Script
	labels map[string]uint32
	// Steps whose jump targets are labels still to resolve.
	fixups []func()
}

func newScript() *scriptBuilder { return &scriptBuilder{labels: map[string]uint32{}} }

func (b *scriptBuilder) label(name string) *scriptBuilder {
	b.labels[name] = uint32(len(b.steps))
	return b
}

func (b *scriptBuilder) add(steps ...*worldv1.ScriptStep) *scriptBuilder {
	b.steps = append(b.steps, steps...)
	return b
}

// choose is a multichoice whose choices (then B) go to these labels.
func (b *scriptBuilder) choose(menu string, to ...string) *scriptBuilder {
	m := &worldv1.Multichoice{Menu: menu, To: make([]uint32, len(to))}
	b.fixups = append(b.fixups, func() {
		for i, l := range to {
			m.To[i] = b.labels[l]
		}
	})
	return b.add(&worldv1.ScriptStep{Action: &worldv1.ScriptStep_Multichoice{Multichoice: m}})
}

func (b *scriptBuilder) jump(to string) *scriptBuilder {
	step := &worldv1.ScriptStep{}
	b.fixups = append(b.fixups, func() { step.Action = &worldv1.ScriptStep_Jump{Jump: b.labels[to]} })
	return b.add(step)
}

// askSave is EventScript_AskSaveGame: NO goes to the label.
func (b *scriptBuilder) askSave(no string) *scriptBuilder {
	step := &worldv1.ScriptStep{}
	b.fixups = append(b.fixups, func() { step.Action = &worldv1.ScriptStep_AskSave{AskSave: b.labels[no]} })
	return b.add(step)
}

// linkRoom is the leader or member screen (union_room.c, phase-9 D18).
func linkRoom(activity socialv1.LinkActivity, lead bool) *worldv1.ScriptStep {
	return &worldv1.ScriptStep{Action: &worldv1.ScriptStep_LinkRoom{LinkRoom: &worldv1.LinkRoomStep{Activity: activity, Lead: lead}}}
}

func (b *scriptBuilder) end() *scriptBuilder {
	return b.add(&worldv1.ScriptStep{Action: &worldv1.ScriptStep_End{End: true}})
}

func (b *scriptBuilder) build() Script {
	for _, f := range b.fixups {
		f()
	}
	return b.steps
}

// wirelessClubAttendant is CableClub_EventScript_WirelessClubAttendant.
func wirelessClubAttendant(pokemon.Party) Script {
	return newScript().
		add(message("cable_club.ask_about_linking")).choose("yes_no", "explain", "no", "no").
		label("explain").add(message("cable_club.explain_wireless_club")).end().
		label("no").add(message("cable_club.hope_you_enjoy_wireless_system")).
		build()
}

// unionRoomAttendant is CableClub_EventScript_UnionRoomAttendant: YES answers with a joke
// instead of entering, as the whole world is already a Union Room (D17).
func unionRoomAttendant(pokemon.Party) Script {
	return newScript().
		add(message("cable_club.welcome_union_room_enter")).
		label("ask").choose("yes_no_info", "yes", "abort", "info", "abort").
		label("info").add(message("cable_club.union_room_info")).jump("ask").
		label("yes").add(message("cable_club.union_room_joke")).end().
		label("abort").add(message("cable_club.please_visit_again")).
		build()
}

// directCornerAttendant is CableClub_EventScript_DirectCornerAttendant (no Berry Crush:
// MULTICHOICE_TRADE_COLOSSEUM_2). JOIN GROUP and BECOME LEADER open the member and leader
// screens (M8); MULTI's four-player rooms come with M13 and abort until then.
func directCornerAttendant(party pokemon.Party) Script {
	b := newScript().
		add(message("cable_club.welcome_which_direct_corner_room")).
		label("select").choose("trade_colosseum_2", "trade", "battle", "abort", "abort").
		// CableClub_EventScript_WirelessTrade, then _CheckPartyTradeRequirements.
		label("trade").add(message("cable_club.trade_pokemon")).choose("yes_no", "trade_check", "abort", "abort").
		label("trade_check")
	if len(party) < 2 {
		b.add(message("cable_club.need_two_mons_to_trade")).jump("abort")
	} else {
		b.jump("save_trade")
	}
	// CableClub_EventScript_WirelessBattleSelect.
	b.label("battle").add(message("cable_club.play_which_battle_mode")).
		choose("single_double_multi_info_exit", "save_single", "double", "save4", "battle_info", "abort", "abort").
		label("double")
	// HasEnoughMonsForDoubleBattle: two that can battle.
	if party.Able() < 2 {
		b.add(message("cable_club.need_two_mons_for_double_battle")).jump("battle")
	} else {
		b.jump("save_double")
	}
	b.label("battle_info").add(message("cable_club.explain_battle_modes")).jump("battle")
	// CableClub_EventScript_SaveAndChooseLinkLeader, then _ChooseLinkLeaderFrom2.
	for _, a := range []struct {
		name     string
		activity socialv1.LinkActivity
	}{{"trade", socialv1.LinkActivity_LINK_ACTIVITY_TRADE}, {"single", socialv1.LinkActivity_LINK_ACTIVITY_SINGLE_BATTLE}, {"double", socialv1.LinkActivity_LINK_ACTIVITY_DOUBLE_BATTLE}} {
		b.label("save_"+a.name).askSave("abort").add(message("cable_club.choose_group_leader_of_two")).
			choose("join_or_lead", "join_"+a.name, "lead_"+a.name, "abort", "abort").
			label("join_"+a.name).add(linkRoom(a.activity, false)).jump("abort").
			label("lead_"+a.name).add(linkRoom(a.activity, true)).jump("abort")
	}
	return b.
		// _ChooseLinkLeaderFrom4: MULTI (M13).
		label("save4").askSave("abort").add(message("cable_club.choose_group_leader_of_four")).
		choose("join_or_lead", "abort", "abort", "abort", "abort").
		label("abort").add(message("cable_club.please_visit_again")).
		build()
}
