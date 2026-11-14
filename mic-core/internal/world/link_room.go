package world

import (
	"context"
	"slices"
	"time"

	"google.golang.org/protobuf/proto"

	mapv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/map/v1"
	realtimev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/realtime/v1"
	socialv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/social/v1"
	worldv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/world/v1"
	"pokeuniverse/mic-core/internal/live"
)

// Link rooms (phase-9 D18-D20). A leader lists a room in their Pokémon Center 2F zone (Redis,
// package live); a member in the same zone asks to join through the leader's social inbox
// (wherever the leader is online); on accept both walk through the door and are warped into the
// room map with the room's ID as the zone phase, so only the two see each other. Leaving or a
// disconnect ends the link for both and puts them back in front of the counter.

// linkCenter is the map with the Direct Corner, and where the players come back to: in front of
// the counter, below the door (CableClub_EventScript_ExitLinkRoom walks down from the door).
var linkCenter = struct {
	Map  string
	Back Point
}{"pokemon_center_2f", Point{9, 4}}

// linkRoomMaps: the room map of each activity.
var linkRoomMaps = map[socialv1.LinkActivity]string{
	socialv1.LinkActivity_LINK_ACTIVITY_TRADE:         "trade_center",
	socialv1.LinkActivity_LINK_ACTIVITY_SINGLE_BATTLE: "battle_colosseum_2p",
	socialv1.LinkActivity_LINK_ACTIVITY_DOUBLE_BATTLE: "battle_colosseum_2p",
}

// isLinkRoomMap: a room map is never a place to reconnect to (it's a private zone that ended).
func isLinkRoomMap(id string) bool { return id == "trade_center" || id == "battle_colosseum_2p" }

type linkRole int

const (
	linkNone linkRole = iota
	linkLeading
	linkJoining
	// Accepted: walking to the door, then in the room.
	linkLinked
)

// linkState is the player's part in a link, changed in its zone's goroutine.
type linkState struct {
	role     linkRole
	activity socialv1.LinkActivity
	// Where the room is listed (the 2F zone).
	at ZoneKey
	// Leading: the member asking (0 when none). Joining: the leader asked.
	other int64
	// Linked: the room, its map, the partner and whether this player leads.
	room    uint32
	roomMap string
	leader  bool
	entered bool
}

func (p *Player) friend() *socialv1.Friend {
	return &socialv1.Friend{Id: uint64(p.accountID), Name: p.name, Gender: p.gender}
}

func (p *Player) sendLink(ev *socialv1.LinkEvent) {
	p.sink.Send(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_Social{Social: &socialv1.SocialEvent{
		Event: &socialv1.SocialEvent_Link{Link: ev}}}})
}

func linkCtx() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 2*time.Second)
}

// Link runs a link intent from the player's connection (one at a time, like UseWarp).
func (p *Player) Link(in *socialv1.LinkIntent) {
	z := p.zone
	switch i := in.Intent.(type) {
	case *socialv1.LinkIntent_Open:
		z.do(func() { z.openLinkRoom(p, i.Open) })
	case *socialv1.LinkIntent_Close:
		z.do(func() { z.closeLinkRoom(p) })
	case *socialv1.LinkIntent_Browse:
		p.browseLinkRooms(z)
	case *socialv1.LinkIntent_Join:
		z.do(func() { z.joinLinkRoom(p, int64(i.Join)) })
	case *socialv1.LinkIntent_CancelJoin:
		z.do(func() { z.cancelJoin(p) })
	case *socialv1.LinkIntent_Answer:
		z.do(func() { z.answerJoin(p, int64(i.Answer.GetMember()), i.Answer.GetAccept()) })
	case *socialv1.LinkIntent_Enter:
		p.enterLinkRoom()
	case *socialv1.LinkIntent_Leave:
		p.leaveLinkRoom()
	}
}

// canLink: the leader and member screens run inside the Direct Corner attendant's script.
func (z *zone) canLink(p *Player) bool {
	_, ok := z.players[p]
	return ok && z.m.ID == linkCenter.Map && p.script != 0 && p.battle == nil
}

func (z *zone) openLinkRoom(p *Player, activity socialv1.LinkActivity) {
	if !z.canLink(p) || p.link.role != linkNone || linkRoomMaps[activity] == "" {
		return
	}
	room := &socialv1.LinkRoom{Leader: p.friend(), Activity: activity, OpenedAt: time.Now().UnixMilli()}
	b, _ := proto.Marshal(room)
	ctx, cancel := linkCtx()
	defer cancel()
	ok, err := z.w.live.OpenLinkRoom(ctx, live.Owner{AccountID: p.accountID, Conn: p.conn}, z.key.Map, z.key.Phase, b)
	if err != nil || !ok {
		z.w.log.Error("open link room", "account_id", p.accountID, "err", err)
		return
	}
	p.link = linkState{role: linkLeading, activity: activity, at: z.key}
	z.emit(p, &worldv1.ZoneEvent{Event: &worldv1.ZoneEvent_LinkRoomOpened{LinkRoomOpened: room}})
}

// unlist takes the leader's room off the zone's list and tells the zone.
func (z *zone) unlist(p *Player) {
	ctx, cancel := linkCtx()
	defer cancel()
	if _, err := z.w.live.CloseLinkRoom(ctx, p.accountID, p.link.at.Map, p.link.at.Phase); err != nil {
		z.w.log.Error("close link room", "account_id", p.accountID, "err", err)
	}
	z.emit(p, &worldv1.ZoneEvent{Event: &worldv1.ZoneEvent_LinkRoomClosed{LinkRoomClosed: uint64(p.accountID)}})
}

// closeLinkRoom: the leader cancels (B); a member who asked is told the room is gone.
func (z *zone) closeLinkRoom(p *Player) {
	if p.link.role != linkLeading {
		return
	}
	z.unlist(p)
	if p.link.other != 0 {
		z.w.social.Link(p.link.other, &socialv1.LinkEvent{Event: &socialv1.LinkEvent_JoinAnswered{JoinAnswered: &socialv1.JoinAnswered{
			Leader: uint64(p.accountID), Refusal: socialv1.JoinRefusal_JOIN_REFUSAL_GONE}}})
	}
	p.link = linkState{}
}

// browseLinkRooms answers the member screen with the rooms in range: the leaders in the same 2F
// zone, friends first, then by time opened (D19).
func (p *Player) browseLinkRooms(z *zone) {
	var key ZoneKey
	ok := false
	z.call(func() { key, ok = z.key, z.canLink(p) })
	if !ok {
		return
	}
	ctx, cancel := linkCtx()
	defer cancel()
	raw, err := z.w.live.LinkRooms(ctx, key.Map, key.Phase)
	if err != nil {
		z.w.log.Error("link rooms", "account_id", p.accountID, "err", err)
	}
	type ranked struct {
		room   *socialv1.LinkRoom
		friend bool
	}
	rooms := make([]ranked, 0, len(raw))
	for _, b := range raw {
		var r socialv1.LinkRoom
		if proto.Unmarshal(b, &r) != nil || int64(r.GetLeader().GetId()) == p.accountID {
			continue
		}
		rel, _ := z.w.social.Relation(ctx, p.accountID, int64(r.GetLeader().GetId()))
		rooms = append(rooms, ranked{&r, rel == socialv1.Relation_RELATION_FRIEND})
	}
	slices.SortStableFunc(rooms, func(a, b ranked) int {
		if a.friend != b.friend {
			if a.friend {
				return -1
			}
			return 1
		}
		return int(a.room.OpenedAt - b.room.OpenedAt)
	})
	out := &socialv1.LinkRooms{}
	for _, r := range rooms {
		out.Rooms = append(out.Rooms, r.room)
	}
	p.sendLink(&socialv1.LinkEvent{Event: &socialv1.LinkEvent_Rooms{Rooms: out}})
}

// joinLinkRoom: the member asks a leader in range, one leader at a time.
func (z *zone) joinLinkRoom(p *Player, leader int64) {
	if !z.canLink(p) || p.link.role != linkNone {
		return
	}
	refuse := func(r socialv1.JoinRefusal) {
		p.sendLink(&socialv1.LinkEvent{Event: &socialv1.LinkEvent_JoinAnswered{JoinAnswered: &socialv1.JoinAnswered{Leader: uint64(leader), Refusal: r}}})
	}
	ctx, cancel := linkCtx()
	defer cancel()
	b, err := z.w.live.LinkRoom(ctx, leader, z.key.Map, z.key.Phase)
	var room socialv1.LinkRoom
	if err != nil || b == nil || proto.Unmarshal(b, &room) != nil {
		refuse(socialv1.JoinRefusal_JOIN_REFUSAL_GONE)
		return
	}
	p.link = linkState{role: linkJoining, activity: room.Activity, at: z.key, other: leader}
	z.w.social.Link(leader, &socialv1.LinkEvent{Event: &socialv1.LinkEvent_JoinAsked{JoinAsked: &socialv1.LinkMember{Member: p.friend(), Activity: room.Activity}}})
}

// cancelJoin: the member stops waiting (B), or leaves the screen.
func (z *zone) cancelJoin(p *Player) {
	if p.link.role != linkJoining {
		return
	}
	z.w.social.Link(p.link.other, &socialv1.LinkEvent{Event: &socialv1.LinkEvent_JoinCancelled{JoinCancelled: uint64(p.accountID)}})
	p.link = linkState{}
}

// answerJoin: the leader's YES or NO to the member who asked. YES closes the room and starts the
// link for both (D20).
func (z *zone) answerJoin(p *Player, member int64, accept bool) {
	if p.link.role != linkLeading || p.link.other != member || member == 0 {
		return
	}
	if !accept {
		p.link.other = 0
		z.w.social.Link(member, &socialv1.LinkEvent{Event: &socialv1.LinkEvent_JoinAnswered{JoinAnswered: &socialv1.JoinAnswered{
			Leader: uint64(p.accountID), Refusal: socialv1.JoinRefusal_JOIN_REFUSAL_DECLINED}}})
		return
	}
	ctx, cancel := linkCtx()
	defer cancel()
	room, err := z.w.live.NextLinkRoom(ctx)
	if err != nil {
		z.w.log.Error("link room id", "err", err)
		return
	}
	z.unlist(p)
	activity := p.link.activity
	p.link = linkState{role: linkLinked, activity: activity, at: z.key, other: member, room: room, roomMap: linkRoomMaps[activity], leader: true}
	z.w.social.Link(member, &socialv1.LinkEvent{Event: &socialv1.LinkEvent_JoinAnswered{JoinAnswered: &socialv1.JoinAnswered{
		Leader: uint64(p.accountID), Accepted: true}}})
	z.w.social.Link(member, &socialv1.LinkEvent{Event: &socialv1.LinkEvent_Start{Start: &socialv1.LinkStart{
		Room: room, Map: p.link.roomMap, Activity: activity, Partner: p.friend()}}})
	z.startLink(p)
}

// startLink: the player is linked; busy until back at the counter (D7).
func (z *zone) startLink(p *Player) {
	z.w.social.SetPresence(p.accountID, socialv1.Presence_PRESENCE_BUSY_LINK)
}

// onLink handles a link event from the player's inbox in the zone's goroutine; what's for the
// client is forwarded.
func (z *zone) onLink(p *Player, ev *socialv1.LinkEvent) {
	if _, ok := z.players[p]; !ok {
		// Not here any more (warping): the event follows the player.
		if p.zone != z {
			p.zone.do(func() { p.zone.onLink(p, ev) })
		}
		return
	}
	z.onLinkHere(p, ev)
}

func (z *zone) onLinkHere(p *Player, ev *socialv1.LinkEvent) {
	switch e := ev.Event.(type) {
	case *socialv1.LinkEvent_JoinAsked:
		member := int64(e.JoinAsked.GetMember().GetId())
		if p.link.role != linkLeading || p.link.other != 0 {
			// One join at a time; a room that closed answers the same way.
			z.w.social.Link(member, &socialv1.LinkEvent{Event: &socialv1.LinkEvent_JoinAnswered{JoinAnswered: &socialv1.JoinAnswered{
				Leader: uint64(p.accountID), Refusal: socialv1.JoinRefusal_JOIN_REFUSAL_GONE}}})
			return
		}
		if e.JoinAsked.GetActivity() != p.link.activity {
			z.w.social.Link(member, &socialv1.LinkEvent{Event: &socialv1.LinkEvent_JoinAnswered{JoinAnswered: &socialv1.JoinAnswered{
				Leader: uint64(p.accountID), Refusal: socialv1.JoinRefusal_JOIN_REFUSAL_DIFFERENT}}})
			return
		}
		p.link.other = member
		p.sendLink(ev)
	case *socialv1.LinkEvent_JoinCancelled:
		from := int64(e.JoinCancelled)
		switch {
		case p.link.role == linkLeading && p.link.other == from:
			p.link.other = 0
			p.sendLink(ev)
		case p.link.role == linkLinked && p.link.other == from:
			z.linkEnded(p) // Crossed with the accept.
		}
	case *socialv1.LinkEvent_JoinAnswered:
		if p.link.role != linkJoining || p.link.other != int64(e.JoinAnswered.GetLeader()) {
			return
		}
		if !e.JoinAnswered.GetAccepted() {
			p.link = linkState{}
		}
		p.sendLink(ev)
	case *socialv1.LinkEvent_Start:
		if e.Start.GetLeader() {
			// The member's replica confirmed: the leader walks in.
			if p.link.role == linkLinked && p.link.leader && p.link.room == e.Start.GetRoom() {
				p.sendLink(ev)
			}
			return
		}
		leader := e.Start.GetPartner().GetId()
		if p.link.role != linkJoining || p.link.other != int64(leader) {
			// Stopped waiting meanwhile: the leader's link ends.
			z.w.social.Link(int64(leader), &socialv1.LinkEvent{Event: &socialv1.LinkEvent_PartnerLeft{PartnerLeft: uint64(p.accountID)}})
			return
		}
		p.link = linkState{role: linkLinked, activity: e.Start.GetActivity(), at: p.link.at, other: int64(leader), room: e.Start.GetRoom(), roomMap: e.Start.GetMap()}
		z.startLink(p)
		p.sendLink(ev)
		// The leader walks in too.
		z.w.social.Link(int64(leader), &socialv1.LinkEvent{Event: &socialv1.LinkEvent_Start{Start: &socialv1.LinkStart{
			Room: p.link.room, Map: p.link.roomMap, Activity: p.link.activity, Leader: true, Partner: p.friend()}}})
	case *socialv1.LinkEvent_PartnerLeft:
		if p.link.role == linkLinked && p.link.other == int64(e.PartnerLeft) {
			z.linkEnded(p)
		}
	}
}

// linkEnded: the partner left or dropped. The client shows it and leaves the room (LeaveLinkRoom),
// which puts the player back at the counter.
func (z *zone) linkEnded(p *Player) {
	p.link.other = 0
	p.sendLink(&socialv1.LinkEvent{Event: &socialv1.LinkEvent_Ended{Ended: true}})
}

// linkGone ends the player's link part as they leave the 2F or the room (warp, disconnect).
func (z *zone) linkGone(p *Player, disconnected bool) {
	switch p.link.role {
	case linkLeading:
		z.closeLinkRoom(p)
	case linkJoining:
		z.cancelJoin(p)
	case linkLinked:
		if !disconnected {
			return // Walking into the room.
		}
		if p.link.other != 0 {
			z.w.social.Link(p.link.other, &socialv1.LinkEvent{Event: &socialv1.LinkEvent_PartnerLeft{PartnerLeft: uint64(p.accountID)}})
		}
		p.link = linkState{}
	}
}

// enterLinkRoom warps the linked player into the room once the client walked through the door:
// leader on the left, member on the right (SpawnLinkPlayers), facing north.
func (p *Player) enterLinkRoom() {
	from := p.zone
	var room uint32
	var to *Map
	var spot Point
	from.call(func() {
		if _, ok := from.players[p]; !ok || p.link.role != linkLinked || p.link.entered || from.m.ID != linkCenter.Map {
			return
		}
		to = from.w.maps[p.link.roomMap]
		if to == nil {
			return
		}
		w := to.warpNamed("dynamic")
		spot = Point{int(w.X), int(w.Y)}
		if !p.link.leader {
			spot.X++
		}
		room = p.link.room
		p.link.entered = true
		from.remove(p)
	})
	if to == nil {
		return
	}
	p.warpTo(to, room, spot, mapv1.Direction_DIRECTION_NORTH)
}

// leaveLinkRoom ends the link (TradeCenter_ConfirmLeaveRoom YES, or the partner's leaving shown):
// the partner is told, and the player goes back in front of the counter.
func (p *Player) leaveLinkRoom() {
	from := p.zone
	ok := false
	from.call(func() {
		// From the 2F too: the partner left before this player went through the door.
		if _, in := from.players[p]; !in || p.link.role != linkLinked || !(isLinkRoomMap(from.m.ID) || from.m.ID == linkCenter.Map) {
			return
		}
		if p.link.other != 0 {
			from.w.social.Link(p.link.other, &socialv1.LinkEvent{Event: &socialv1.LinkEvent_PartnerLeft{PartnerLeft: uint64(p.accountID)}})
		}
		p.link = linkState{}
		from.remove(p)
		ok = true
	})
	if !ok {
		return
	}
	from.w.social.SetPresence(p.accountID, socialv1.Presence_PRESENCE_ONLINE)
	p.warpTo(from.w.maps[linkCenter.Map], 0, linkCenter.Back, mapv1.Direction_DIRECTION_SOUTH)
}

// warpTo puts the player, already out of its zone, on a tile of a map in a phase (as UseWarp).
func (p *Player) warpTo(to *Map, phase uint32, spot Point, facing mapv1.Direction) {
	w := p.zone.w
	w.mu.Lock()
	if w.closed {
		w.mu.Unlock()
		return
	}
	z := w.zoneOf(to, phase)
	w.mu.Unlock()
	p.zone = z
	z.call(func() {
		z.arrive(p, spot)
		p.facing = facing
		if len(p.out) > 0 {
			if wp := p.out[len(p.out)-1].GetWarped(); wp != nil {
				wp.Facing = facing
			}
		}
	})
}
