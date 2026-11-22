package world

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	socialv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/social/v1"
	worldv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/world/v1"
	"pokeuniverse/mic-core/internal/db"
	"pokeuniverse/mic-core/internal/pokemon"
)

// The Trade Center (phase-9 D21-D23): its seats and trade.c's menu. The offer lives in the
// leader's player, in its zone's goroutine: the leader's replica decides, as FireRed's link
// leader does (Leader_HandleCommunication). The member's replica forwards the member's seat and
// intents to it (TradeMemberAction on the leader's inbox) and the states it sends back. Nothing
// of the offer needs to outlive a crash: the room ends with it, and only the swap must apply
// once or not at all, which its PostgreSQL row keyed by the trade ID does (D23).

const (
	tradeLeader = 0
	tradeMember = 1
	// pick: none yet, or CANCEL's "Cancel trade?" YES.
	pickNone   = -1
	pickCancel = -2
)

// tradeMenu is the offer, on the leader's player.
type tradeMenu struct {
	seated [2]bool
	// The member's save (Unix microseconds), the swap's check.
	memberSave int64
	open       bool
	// Both parties as the menu shows them (the leader's is p.party when it opens).
	parties [2]pokemon.Party
	pick    [2]int
	// "Is this trade okay?": 0 not answered, 1 YES.
	confirm [2]int
}

func (t *tradeMenu) reset() {
	t.pick = [2]int{pickNone, pickNone}
	t.confirm = [2]int{}
}

// partnerWatch: how often a seated side checks that the partner is still online in the room's
// zone. A partner's replica that crashed never says it left: once gone, the party is read again
// (the swap may have been saved, D23) and the link ends as a drop.
const partnerWatch = 5 * time.Second

// tradeSeat is TradeCenter_EventScript_Chair0/1 (EnterTradeSeat): a step onto a seat of the Trade
// Center while linked for a trade sits the player, facing the way they walked. True when it did.
func (z *zone) tradeSeat(p *Player) bool {
	t := z.m.TriggerAt(p.pos)
	if z.m.ID != linkRoomMaps[socialv1.LinkActivity_LINK_ACTIVITY_TRADE] || t == nil || p.link.role != linkLinked || p.link.activity != socialv1.LinkActivity_LINK_ACTIVITY_TRADE {
		return false
	}
	if t.GetScript() != "chair_0" && t.GetScript() != "chair_1" {
		return false
	}
	z.startScript(p, Script{{Action: &worldv1.ScriptStep_TradeSeat{TradeSeat: true}}})
	p.link.seated = true
	z.watchPartner(p)
	if p.link.leader {
		z.leaderTrade(p).seated[tradeLeader] = true
		z.openTrade(p)
		return true
	}
	z.toLeader(p, &socialv1.TradeMemberAction{Action: &socialv1.TradeMemberAction_Seated{Seated: p.gen}})
	return true
}

// leaderTrade is the leader's offer, made on first use.
func (z *zone) leaderTrade(p *Player) *tradeMenu {
	if p.link.trade == nil {
		p.link.trade = &tradeMenu{}
		p.link.trade.reset()
	}
	return p.link.trade
}

// toLeader sends the member's action to the leader's replica.
func (z *zone) toLeader(p *Player, a *socialv1.TradeMemberAction) {
	a.Member = uint64(p.accountID)
	z.w.social.Link(p.link.other, &socialv1.LinkEvent{Event: &socialv1.LinkEvent_TradeMember{TradeMember: a}})
}

// tradeIntent runs the player's trade intent: the leader's here, the member's on the leader's replica.
func (z *zone) tradeIntent(p *Player, in *socialv1.LinkIntent) {
	if _, ok := z.players[p]; !ok || p.link.role != linkLinked || !p.link.seated || p.link.other == 0 {
		return
	}
	if p.link.leader {
		z.leaderIntent(p, tradeLeader, in)
		return
	}
	a := &socialv1.TradeMemberAction{}
	switch i := in.Intent.(type) {
	case *socialv1.LinkIntent_TradeOffer:
		a.Action = &socialv1.TradeMemberAction_Offer{Offer: i.TradeOffer}
	case *socialv1.LinkIntent_TradeConfirm:
		a.Action = &socialv1.TradeMemberAction_Confirm{Confirm: i.TradeConfirm}
	case *socialv1.LinkIntent_TradeCancel:
		a.Action = &socialv1.TradeMemberAction_Cancel{Cancel: i.TradeCancel}
		if !p.link.menu {
			p.link.seated = false // Stood up before the menu opened.
		}
	default:
		return
	}
	z.toLeader(p, a)
}

// watchPartner checks, while the player sits in this room, that the partner is still in it.
func (z *zone) watchPartner(p *Player) {
	p.link.watch++
	token, room, hash := p.link.watch, p.link.room, z.hash
	var check func()
	check = func() {
		pz := p.zone
		pz.do(func() {
			if _, ok := pz.players[p]; !ok || pz.hash != hash || p.link.role != linkLinked || p.link.room != room || p.link.watch != token || !p.link.seated || p.link.other == 0 {
				return
			}
			ctx, cancel := linkCtx()
			defer cancel()
			in, err := pz.w.live.InZone(ctx, p.link.other, hash)
			if err != nil || in {
				time.AfterFunc(partnerWatch, check)
				return
			}
			pz.w.log.Warn("trade partner gone", "account_id", p.accountID, "partner", p.link.other, "room", room)
			pz.reloadParty(p)
			pz.linkEnded(p)
		})
	}
	time.AfterFunc(partnerWatch, check)
}

// onTradeMember is the member's action, on the leader's replica.
func (z *zone) onTradeMember(p *Player, a *socialv1.TradeMemberAction) {
	if p.link.role != linkLinked || !p.link.leader || p.link.other != int64(a.GetMember()) {
		return
	}
	t := z.leaderTrade(p)
	switch act := a.Action.(type) {
	case *socialv1.TradeMemberAction_Seated:
		t.seated[tradeMember], t.memberSave = true, act.Seated
		z.openTrade(p)
	case *socialv1.TradeMemberAction_Offer:
		z.leaderIntent(p, tradeMember, &socialv1.LinkIntent{Intent: &socialv1.LinkIntent_TradeOffer{TradeOffer: act.Offer}})
	case *socialv1.TradeMemberAction_Confirm:
		z.leaderIntent(p, tradeMember, &socialv1.LinkIntent{Intent: &socialv1.LinkIntent_TradeConfirm{TradeConfirm: act.Confirm}})
	case *socialv1.TradeMemberAction_Cancel:
		z.leaderIntent(p, tradeMember, &socialv1.LinkIntent{Intent: &socialv1.LinkIntent_TradeCancel{TradeCancel: act.Cancel}})
	}
}

// sendTrade sends a side its state: the leader's own connection, or the member through their inbox.
func (z *zone) sendTrade(p *Player, side int, ev *socialv1.LinkEvent) {
	if side == tradeLeader {
		p.sendLink(ev)
		return
	}
	z.w.social.Link(p.link.other, ev)
}

func (z *zone) sendTradeState(p *Player, side int, s *socialv1.TradeState) {
	z.sendTrade(p, side, &socialv1.LinkEvent{Event: &socialv1.LinkEvent_TradeState{TradeState: s}})
}

// sendMenu opens (or brings back) the menu on both sides with both parties.
func (z *zone) sendMenu(p *Player) {
	t := p.link.trade
	for side := range 2 {
		z.sendTradeState(p, side, &socialv1.TradeState{Stage: socialv1.TradeStage_TRADE_STAGE_CHOOSING,
			OwnParty: t.parties[side].Proto(), OtherParty: t.parties[1-side].Proto()})
	}
}

// openTrade opens the menu once both sit (Task_StartWirelessTrade): the member's party is read
// from PostgreSQL, where every change of it is saved before it's shown.
func (z *zone) openTrade(p *Player) {
	t := p.link.trade
	if t == nil || t.open || !t.seated[tradeLeader] || !t.seated[tradeMember] {
		return
	}
	ctx, cancel := linkCtx()
	defer cancel()
	member, err := pokemon.Load(ctx, db.New(z.w.pool), p.link.other)
	if err != nil {
		z.w.log.Error("trade: load member party", "account_id", p.link.other, "err", err)
		return
	}
	t.open, t.parties = true, [2]pokemon.Party{p.party.Clone(), member}
	t.reset()
	p.link.menu = true
	z.sendMenu(p)
}

// leaderIntent is Leader_HandleCommunication: a side's pick, cancel or answer.
func (z *zone) leaderIntent(p *Player, side int, in *socialv1.LinkIntent) {
	t := p.link.trade
	if t == nil {
		return
	}
	if !t.open {
		// B in the seat before the menu opened: that side stands up.
		if in.GetTradeCancel() != nil {
			t.seated[side] = false
			if side == tradeLeader {
				p.link.seated = false
			}
		}
		return
	}
	switch i := in.Intent.(type) {
	case *socialv1.LinkIntent_TradeOffer:
		slot := int(i.TradeOffer.GetSlot())
		if t.pick[side] != pickNone || t.parties[side].At(slot) == nil {
			return
		}
		if !t.parties[side].CanOffer(slot) {
			// CANT_TRADE_LAST_MON: only this side is told; its pick stays open.
			z.sendTradeState(p, side, &socialv1.TradeState{Stage: socialv1.TradeStage_TRADE_STAGE_CANCELED, Notice: socialv1.TradeNotice_TRADE_NOTICE_ONLY_MON})
			return
		}
		t.pick[side] = slot
		z.resolvePicks(p)
	case *socialv1.LinkIntent_TradeCancel:
		if t.pick[side] != pickNone {
			return
		}
		t.pick[side] = pickCancel
		z.resolvePicks(p)
	case *socialv1.LinkIntent_TradeConfirm:
		if t.pick[tradeLeader] < 0 || t.pick[tradeMember] < 0 || t.confirm[side] != 0 {
			return
		}
		if !i.TradeConfirm.GetYes() || !t.parties[side].CanOffer(t.pick[side]) {
			// NO, or the trade isn't allowed any more: canceled for both (READY_CANCEL_TRADE).
			z.cancelOffer(p, socialv1.TradeNotice_TRADE_NOTICE_CANCELED, socialv1.TradeNotice_TRADE_NOTICE_CANCELED)
			return
		}
		t.confirm[side] = 1
		if t.confirm[1-side] == 1 {
			z.swap(p)
		}
	}
}

// resolvePicks: once both sides picked or cancelled (Leader_HandleCommunication's select status).
func (z *zone) resolvePicks(p *Player) {
	t := p.link.trade
	a, b := t.pick[tradeLeader], t.pick[tradeMember]
	switch {
	case a == pickNone || b == pickNone:
	case a >= 0 && b >= 0:
		for side := range 2 {
			z.sendTradeState(p, side, &socialv1.TradeState{Stage: socialv1.TradeStage_TRADE_STAGE_CONFIRMING,
				OwnPick: uint32(t.pick[side]), OtherPick: uint32(t.pick[1-side])})
		}
	case a == pickCancel && b == pickCancel:
		// Both chose CANCEL: the menu closes and both are back in their seats' room.
		t.open = false
		t.seated = [2]bool{}
		p.link.menu, p.link.seated = false, false
		t.reset()
		for side := range 2 {
			z.sendTradeState(p, side, &socialv1.TradeState{Stage: socialv1.TradeStage_TRADE_STAGE_ENDED})
		}
	case a == pickCancel:
		z.cancelOffer(p, socialv1.TradeNotice_TRADE_NOTICE_FRIEND_WANTS_TO_TRADE, socialv1.TradeNotice_TRADE_NOTICE_CANCELED)
	default:
		z.cancelOffer(p, socialv1.TradeNotice_TRADE_NOTICE_CANCELED, socialv1.TradeNotice_TRADE_NOTICE_FRIEND_WANTS_TO_TRADE)
	}
}

// cancelOffer: the offer fell through; both choose again after their message.
func (z *zone) cancelOffer(p *Player, leader, member socialv1.TradeNotice) {
	p.link.trade.reset()
	z.sendTradeState(p, tradeLeader, &socialv1.TradeState{Stage: socialv1.TradeStage_TRADE_STAGE_CANCELED, Notice: leader})
	z.sendTradeState(p, tradeMember, &socialv1.TradeState{Stage: socialv1.TradeStage_TRADE_STAGE_CANCELED, Notice: member})
}

// swap: both said YES. The two Pokémon change trainers in one transaction keyed by a new trade
// ID (D23); then both get TradeDone and the menu back with both parties as saved.
func (z *zone) swap(p *Player) {
	t := p.link.trade
	id := newTradeID()
	leader := pokemon.TradeSide{AccountID: p.accountID, Save: time.UnixMicro(p.gen), Slot: t.pick[tradeLeader], Offered: t.parties[tradeLeader].At(t.pick[tradeLeader])}
	member := pokemon.TradeSide{AccountID: p.link.other, Save: time.UnixMicro(t.memberSave), Slot: t.pick[tradeMember], Offered: t.parties[tradeMember].At(t.pick[tradeMember])}
	var a, b pokemon.Party
	ctx, cancel := context.WithTimeout(context.Background(), saveTimeout)
	defer cancel()
	err := pgx.BeginFunc(ctx, z.w.pool, func(tx pgx.Tx) error {
		var err error
		a, b, err = pokemon.Trade(ctx, db.New(tx), id, leader, member)
		return err
	})
	if err != nil {
		if !errors.Is(err, pokemon.ErrTradeChanged) {
			z.w.log.Error("trade swap", "trade_id", id, "leader", leader.AccountID, "member", member.AccountID, "err", err)
		}
		z.cancelOffer(p, socialv1.TradeNotice_TRADE_NOTICE_CANCELED, socialv1.TradeNotice_TRADE_NOTICE_CANCELED)
		return
	}
	p.party = a.Clone()
	p.syncFollower()
	z.sendParty(p)
	t.parties = [2]pokemon.Party{a, b}
	t.reset()
	z.sendTrade(p, tradeLeader, &socialv1.LinkEvent{Event: &socialv1.LinkEvent_TradeDone{TradeDone: &socialv1.TradeDone{
		TradeId: id, OwnSlot: uint32(leader.Slot), OtherSlot: uint32(member.Slot)}}})
	z.sendTrade(p, tradeMember, &socialv1.LinkEvent{Event: &socialv1.LinkEvent_TradeDone{TradeDone: &socialv1.TradeDone{
		TradeId: id, OwnSlot: uint32(member.Slot), OtherSlot: uint32(leader.Slot)}}})
	z.sendMenu(p)
}

func newTradeID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// onTradeEvent forwards the leader replica's states to the member's client; after a swap the
// member's party is read again first (the swap wrote it on the other replica).
func (z *zone) onTradeEvent(p *Player, ev *socialv1.LinkEvent) {
	if p.link.role != linkLinked || p.link.leader {
		return
	}
	if ev.GetTradeDone() != nil {
		z.reloadParty(p)
	}
	if s := ev.GetTradeState(); s != nil {
		switch s.GetStage() {
		case socialv1.TradeStage_TRADE_STAGE_CHOOSING:
			p.link.menu = true
		case socialv1.TradeStage_TRADE_STAGE_ENDED:
			p.link.menu, p.link.seated = false, false
		}
	}
	p.sendLink(ev)
}

// reloadParty reads the player's party from PostgreSQL (another replica changed it) and sends it.
func (z *zone) reloadParty(p *Player) {
	ctx, cancel := linkCtx()
	defer cancel()
	party, err := pokemon.Load(ctx, db.New(z.w.pool), p.accountID)
	if err != nil {
		z.w.log.Error("reload party", "account_id", p.accountID, "err", err)
		return
	}
	p.party = party
	p.syncFollower()
	z.sendParty(p)
}
