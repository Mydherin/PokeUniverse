package world

import (
	"context"
	"errors"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
	"google.golang.org/protobuf/proto"

	battlev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/battle/v1"
	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
	realtimev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/realtime/v1"
	worldv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/world/v1"
	"pokeuniverse/mic-core/internal/battle"
	"pokeuniverse/mic-core/internal/db"
	"pokeuniverse/mic-core/internal/item"
	"pokeuniverse/mic-core/internal/pokemon"
)

// Battles from mic-core's side (phase-5, Battle Flow): the zone checks every choice,
// asks mic-battles off its goroutine (retrying while mic-battles restarts) and, back in it,
// saves what changed before showing it. The active battle lives in Redis (package battle), so
// a restart of either service resumes it; a player who leaves mid-battle drops it (rollback).

// battleTimeout bounds how long a start or a step is retried before giving up; the client then
// sends its choice again (the same step is safe to repeat).
const battleTimeout = 2 * time.Minute

// joinViewTimeout bounds the battle view fetched while joining; past it, the battle is redrawn
// once mic-battles answers.
const joinViewTimeout = 3 * time.Second

// inBattle is the battle a player is in.
type inBattle struct {
	battle.Active
	// What the player must choose now (its step is the one the next choice must carry); nil
	// until mic-battles answered.
	request *battlev1.BattleRequest
	// A request to mic-battles is on its way: choices wait.
	asking bool
}

// ScriptBattle starts the running script's trainer battle (the player said YES).
func (p *Player) ScriptBattle(m *worldv1.ScriptBattle) {
	p.zone.do(func() { p.zone.startBattle(p, m.GetScript()) })
}

// BattleChoice is the player's choice for the battle's request.
func (p *Player) BattleChoice(c *battlev1.BattleChoice) {
	p.zone.do(func() { p.zone.battleChoice(p, c) })
}

func (z *zone) startBattle(p *Player, script uint32) {
	key := p.scriptTrainer
	t := battle.Trainers[key]
	if _, ok := z.players[p]; !ok || script == 0 || script != p.script || t == nil || p.battle != nil {
		return
	}
	p.scriptTrainer = ""
	p.evolving = evolving{}
	if t.Heals {
		before := p.party.Clone()
		p.party.Heal()
		if !z.saveTrainer(p, item.Changed{}, true) {
			p.party = before
			z.battleFailed(p, "")
			return
		}
		z.sendParty(p)
	}
	if !p.party.CanBattle() || (t.Doubles && p.party.Able() < 2) {
		z.battleFailed(p, "")
		return
	}
	start := battle.NewStart(p.party, p.trainerID, key, t)
	data, _ := proto.Marshal(start)
	a := battle.Active{ID: start.BattleId, Trainer: key, Save: p.gen, Start: data}
	p.battle = &inBattle{Active: a}
	z.ask(p, func(ctx context.Context) (*battlev1.BattleUpdate, error) {
		// The style as the battle starts (the option is saved apart from the zone).
		row, err := db.New(z.w.pool).GetTrainer(ctx, p.accountID)
		if err != nil {
			return nil, err
		}
		start.Sides[battle.PlayerSide].ShiftStyle = row.BattleStyle == "shift"
		// Saved first: a crash from here on resumes the battle.
		if err := z.w.active.SetActive(ctx, p.accountID, a); err != nil {
			return nil, err
		}
		return z.w.battles.Start(ctx, start)
	}, func(u *battlev1.BattleUpdate, err error) {
		if err != nil {
			z.w.log.Error("start battle", "account_id", p.accountID, "battle", a.ID, "err", err)
			z.battleFailed(p, a.ID)
			return
		}
		z.showBattle(p, u.GetSides()[battle.PlayerSide].GetView(), u.GetSides()[battle.PlayerSide].GetEvents())
	})
}

// battleFailed gives up on a battle that couldn't start: the client ends its script.
func (z *zone) battleFailed(p *Player, id string) {
	if id != "" {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		if err := z.w.active.ClearActive(ctx, p.accountID); err != nil {
			z.w.log.Error("clear battle", "account_id", p.accountID, "err", err)
		}
	}
	p.battle = nil
	p.script, p.pcScript = 0, 0
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_BattleEnded{BattleEnded: &battlev1.BattleEnded{BattleId: id}}})
}

// showBattle draws the battle on the client: at its start, or redrawn after a resume.
func (z *zone) showBattle(p *Player, view *battlev1.BattleView, events []*battlev1.BattleEvent) {
	withTrainer(view, p.battle.Trainer)
	p.battle.request = view.GetRequest()
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_BattleStarted{BattleStarted: &battlev1.BattleStarted{View: view, Events: events}}})
}

func (z *zone) battleChoice(p *Player, c *battlev1.BattleChoice) {
	b := p.battle
	if _, ok := z.players[p]; !ok || b == nil || b.asking || b.request == nil || c.GetBattleId() != b.ID {
		return
	}
	spend, ok := z.checkAction(p, c.GetAction())
	if ok && c.GetPartner() != nil {
		// Doubles: a second item of the same kind needs a second one in the bag.
		partner, partnerOK := z.checkAction(p, c.GetPartner())
		spend, ok = append(spend, partner...), partnerOK && enoughInBag(p, append(spend, partner...))
	}
	if !ok {
		z.refuseChoice(p)
		return
	}
	if c.GetStep() != b.request.GetStep() {
		z.refuseChoice(p)
		return
	}
	req := &battlev1.TurnRequest{BattleId: b.ID, Step: c.GetStep(), Choices: []*battlev1.SideChoice{{Side: battle.PlayerSide, Action: c.GetAction(), Partner: c.GetPartner()}}}
	z.ask(p, func(ctx context.Context) (*battlev1.BattleUpdate, error) {
		return z.w.battles.Turn(ctx, req)
	}, func(u *battlev1.BattleUpdate, err error) {
		if err != nil {
			z.w.log.Error("battle turn", "account_id", p.accountID, "battle", b.ID, "step", req.Step, "err", err)
			z.refuseChoice(p)
			return
		}
		z.played(p, u, req.Step, choiceItems(c))
	})
}

// checkAction checks what mic-core can of one action: the items it would spend, and whether it
// may go on.
func (z *zone) checkAction(p *Player, a *battlev1.BattleAction) ([]itemv1.Item, bool) {
	switch k := a.GetKind().(type) {
	case *battlev1.BattleAction_Move, *battlev1.BattleAction_Switch, *battlev1.BattleAction_Shift:
		return nil, true
	case *battlev1.BattleAction_Learn:
		return nil, canForget(p.battle.request, k.Learn)
	case *battlev1.BattleAction_Item:
		return []itemv1.Item{k.Item.GetItem()}, usableInBattle(p, k.Item.GetItem())
	}
	// RUN: there's no running from a trainer battle (the client says so first).
	return nil, false
}

// choiceItems: the bag items a choice uses.
func choiceItems(c *battlev1.BattleChoice) []*battlev1.ItemAction {
	var used []*battlev1.ItemAction
	for _, a := range []*battlev1.BattleAction{c.GetAction(), c.GetPartner()} {
		if k, ok := a.GetKind().(*battlev1.BattleAction_Item); ok {
			used = append(used, k.Item)
		}
	}
	return used
}

// enoughInBag: the bag holds every item of this choice, counting repeats.
func enoughInBag(p *Player, items []itemv1.Item) bool {
	for _, id := range items {
		if p.items.Bag.Quantity(id) < countOf(items, id) {
			return false
		}
	}
	return true
}

func countOf(items []itemv1.Item, id itemv1.Item) int {
	n := 0
	for _, x := range items {
		if x == id {
			n++
		}
	}
	return n
}

// canForget: the answer to a LEARN_MOVE request doesn't forget an HM.
func canForget(r *battlev1.BattleRequest, a *battlev1.LearnMoveAction) bool {
	if r.GetKind() != battlev1.RequestKind_REQUEST_KIND_LEARN_MOVE {
		return false
	}
	if a.ForgetSlot == nil {
		return true
	}
	party := r.GetParty()
	if slot := int(r.GetLearn().GetPartySlot()); slot < len(party) {
		moves := party[slot].GetMoves()
		return int(a.GetForgetSlot()) < len(moves) && !pokemon.IsHM(moves[a.GetForgetSlot()])
	}
	return false
}

// spentChanges: the pockets the items used in battle came from.
func spentChanges(spent []int32) item.Changed {
	var changed item.Changed
	for _, id := range spent {
		info, _ := item.Info(itemv1.Item(id))
		if !slices.Contains(changed.Pockets, info.GetPocket()) {
			changed.Pockets = append(changed.Pockets, info.GetPocket())
		}
	}
	return changed
}

// abandonBattle drops the battle of a player who left mid-battle (rollback): its party, money
// and items were never saved, so the next join finds them as they were before it.
func (z *zone) abandonBattle(p *Player) {
	if p.battle == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	// Only this battle: a newer copy of the game may have started another one.
	if err := z.w.active.ClearActiveIf(ctx, p.accountID, p.battle.ID); err != nil {
		z.w.log.Error("abandon battle", "account_id", p.accountID, "battle", p.battle.ID, "err", err)
	}
	p.battle = nil
}

// usableInBattle: an item with a use in battle that the trainer has (mic-battles checks what it
// does now). A trainer blocks Poké Balls; catching comes with wild battles (Phase 7).
func usableInBattle(p *Player, id itemv1.Item) bool {
	info, ok := item.Info(id)
	return ok && info.GetBattleUse() != itemv1.BattleUse_BATTLE_USE_UNSPECIFIED && p.items.Bag.Quantity(id) > 0
}

// refuseChoice asks the client for its choice again, with nothing new to show.
func (z *zone) refuseChoice(p *Player) {
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_BattleTurn{BattleTurn: &battlev1.BattleTurn{
		BattleId: p.battle.ID, Request: p.battle.request,
	}}})
}

// keepSpent records what the battle took from the bag: a restart resumes it with them still gone.
func (z *zone) keepSpent(p *Player) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := z.w.active.SetActive(ctx, p.accountID, p.battle.Active); err != nil {
		z.w.log.Error("save battle", "account_id", p.accountID, "err", err)
	}
}

// played shows a step mic-battles played: a bag item is spent first (D12: mic-core owns the
// bag; saved with the outcome, so leaving rolls it back), then the events and the next
// request, then the end if it's over.
func (z *zone) played(p *Player, u *battlev1.BattleUpdate, step uint32, used []*battlev1.ItemAction) {
	side := u.GetSides()[battle.PlayerSide]
	removed := false
	if side.GetRequest().GetStep() > step {
		for _, a := range used {
			id := a.GetItem()
			if info, _ := item.Info(id); !info.GetImportant() && p.items.Bag.Remove(id, 1) {
				p.battle.Spent = append(p.battle.Spent, int32(id))
				if len(info.GetEffect().GetFriendship()) > 0 {
					p.battle.Friendship = append(p.battle.Friendship, battle.ItemFriendship{Item: int32(id), Slot: int32(a.GetPartySlot())})
				}
				removed = true
			}
		}
	}
	if removed {
		z.keepSpent(p)
		z.sendChanged(p, spentChanges(p.battle.Spent))
	}
	p.battle.request = side.GetRequest()
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_BattleTurn{BattleTurn: &battlev1.BattleTurn{
		BattleId: p.battle.ID, Events: side.GetEvents(), Request: side.GetRequest(),
	}}})
	if u.GetOutcome() != nil {
		z.finish(p, u.GetOutcome())
	}
}

// ask runs a request to mic-battles off the zone's goroutine, then `done` back in it, if the
// player is still in that battle here (otherwise they left it, or it resumes after a restart).
func (z *zone) ask(p *Player, call func(context.Context) (*battlev1.BattleUpdate, error), done func(*battlev1.BattleUpdate, error)) {
	b := p.battle
	b.asking = true
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), battleTimeout)
		defer cancel()
		u, err := call(ctx)
		if err == nil && len(u.GetSides()) <= battle.PlayerSide {
			err = errors.New("battle update without sides")
		}
		z.do(func() {
			if _, ok := z.players[p]; !ok || p.battle != b {
				return
			}
			b.asking = false
			done(u, err)
		})
	}()
}

// finish saves the outcome in one transaction keyed by the battle (applied once): the party,
// money won or lost, the Pokédex. Winning can leave evolutions. Losing whites out (DoWhiteOut): money lost, party healed, back at the
// respawn point, the script ended. Retried while PostgreSQL is unreachable.
func (z *zone) finish(p *Player, o *battlev1.BattleOutcome) {
	b := p.battle
	result := o.GetSides()[battle.PlayerSide].GetResult()
	party, money, dex := p.party.Clone(), p.money, p.pokedex
	if t := battle.Trainers[b.Trainer]; t != nil && t.League() {
		p.party.LeagueFriendship(z.m.ID)
	}
	battle.Apply(p.party, o.GetSides()[battle.PlayerSide], z.m.ID)
	for _, f := range b.Friendship {
		info, _ := item.Info(itemv1.Item(f.Item))
		p.party.ChangeFriendshipByItem(info.GetEffect(), int(f.Slot), z.m.ID)
	}
	won := result == battlev1.BattleResult_BATTLE_RESULT_WON || result == battlev1.BattleResult_BATTLE_RESULT_FORFEIT_WON
	delta := 0
	if won {
		if t := battle.Trainers[b.Trainer]; t != nil {
			prize := t.Prize()
			if o.GetDoublePrize() {
				prize *= 2
			}
			delta = min(prize, battle.MaxMoney-p.money)
		}
	} else {
		delta = -battle.WhiteOutLoss(p.party, p.money)
		p.party.Heal()
	}
	p.money += delta
	p.pokedex = p.pokedex.See(o.GetSides()[battle.PlayerSide].GetSeen()...)

	applied, err := z.saveOutcome(p, b.ID, result, delta)
	if err != nil || !applied {
		p.party, p.money, p.pokedex = party, money, dex
	}
	if err != nil {
		z.w.log.Error("save battle outcome", "account_id", p.accountID, "battle", b.ID, "err", err)
		time.AfterFunc(2*time.Second, func() {
			z.do(func() {
				if _, ok := z.players[p]; ok && p.battle == b {
					z.finish(p, o)
				}
			})
		})
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := z.w.active.ClearActive(ctx, p.accountID); err != nil {
		// The next join finds the outcome applied and clears it.
		z.w.log.Error("clear battle", "account_id", p.accountID, "err", err)
	}
	p.battle = nil
	if won && applied {
		p.evolving.pending = pokemon.Evolutions(p.party, party, night(time.Now()))
	}
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_BattleEnded{BattleEnded: &battlev1.BattleEnded{
		BattleId: b.ID, Result: result, Money: uint32(max(delta, -delta)), Evolutions: p.evolving.proto(),
	}}})
	z.sendParty(p)
	if !p.pokedex.Same(dex) {
		z.sendPokedex(p)
	}
	if !won {
		p.script, p.pcScript = 0, 0
		p.pos, p.facing = Point{Start.X, Start.Y}, Start.Facing
		p.elevation, p.dirty = z.m.Elevation(p.pos), true
		p.placeFollower() // A whiteout is a map entry for the follower (FollowMon_RecreateForMap).
		z.correct(p, 0)
	}
}

func (z *zone) saveOutcome(p *Player, id string, result battlev1.BattleResult, money int) (bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), saveTimeout)
	defer cancel()
	save := time.UnixMicro(p.gen)
	applied := false
	err := pgx.BeginFunc(ctx, z.w.pool, func(tx pgx.Tx) error {
		q := db.New(tx)
		var err error
		if applied, err = battle.Record(ctx, q, p.accountID, id, result, money); err != nil || !applied {
			return err
		}
		if spent := spentChanges(p.battle.Spent); spent.Any() {
			if err := item.Write(ctx, q, p.accountID, save, p.items, spent); err != nil {
				return err
			}
		}
		if err := pokemon.Write(ctx, q, p.accountID, save, p.party); err != nil {
			return err
		}
		if err := savePokedex(ctx, q, p, save); err != nil {
			return err
		}
		n, err := q.UpdateTrainerMoney(ctx, db.UpdateTrainerMoneyParams{AccountID: p.accountID, Money: int32(p.money), CreatedAt: save})
		if err == nil && n == 0 {
			err = pokemon.ErrStaleSave
		}
		return err
	})
	return applied, err
}

// joinBattle finds the battle the trainer was in, if any, for Join: its view for the snapshot
// when mic-battles answers in time; otherwise a placeholder, and the zone resumes it (resume).
// Entering the world anew (takeOver: a page load, CONTINUE) means the player left it: it is
// dropped instead (rollback, D22); only a reconnect resumes it.
func (w *World) joinBattle(ctx context.Context, accountID, save int64, takeOver bool) (*inBattle, *battlev1.BattleView, error) {
	a, err := w.active.Active(ctx, accountID)
	if err != nil || a == nil {
		return nil, nil, err
	}
	if takeOver {
		return nil, nil, w.active.ClearActiveIf(ctx, accountID, a.ID)
	}
	applied, err := battle.Applied(ctx, db.New(w.pool), a.ID)
	if err != nil {
		return nil, nil, err
	}
	if a.Save != save || applied {
		return nil, nil, w.active.ClearActive(ctx, accountID)
	}
	b := &inBattle{Active: *a}
	vctx, cancel := context.WithTimeout(ctx, joinViewTimeout)
	defer cancel()
	if view, err := w.battleView(vctx, a); err == nil && view.GetRequest().GetKind() != battlev1.RequestKind_REQUEST_KIND_WAIT {
		b.request = view.GetRequest()
		return b, withTrainer(view, a.Trainer), nil
	}
	return b, withTrainer(&battlev1.BattleView{BattleId: a.ID, Kind: battlev1.BattleKind_BATTLE_KIND_TRAINER}, a.Trainer), nil
}

// withTrainer adds the NPC trainer to a view (mic-core owns the trainer table).
func withTrainer(view *battlev1.BattleView, trainer string) *battlev1.BattleView {
	if t := battle.Trainers[trainer]; t != nil {
		view.Trainer = t.View()
	}
	return view
}

// battleView makes sure the battle exists (its start again), then reads the player's view.
func (w *World) battleView(ctx context.Context, a *battle.Active) (*battlev1.BattleView, error) {
	start := &battlev1.StartBattle{}
	if err := proto.Unmarshal(a.Start, start); err != nil {
		return nil, err
	}
	if _, err := w.battles.Start(ctx, start); err != nil {
		return nil, err
	}
	return w.battles.View(ctx, &battlev1.ViewRequest{BattleId: a.ID, Side: battle.PlayerSide})
}

// resumeBattle, for a battle joined without its view: once mic-battles answers, the battle is
// redrawn, or, when it was already over, its outcome (the last step's saved reply) is saved.
func (z *zone) resumeBattle(p *Player) {
	a := p.battle.Active
	z.ask(p, func(ctx context.Context) (*battlev1.BattleUpdate, error) {
		view, err := z.w.battleView(ctx, &a)
		if err != nil {
			return nil, err
		}
		if view.GetRequest().GetKind() != battlev1.RequestKind_REQUEST_KIND_WAIT {
			return &battlev1.BattleUpdate{BattleId: a.ID, Sides: []*battlev1.SideUpdate{{View: view, Request: view.GetRequest()}}}, nil
		}
		return z.w.battles.Turn(ctx, &battlev1.TurnRequest{BattleId: a.ID, Step: view.GetRequest().GetStep() - 1})
	}, func(u *battlev1.BattleUpdate, err error) {
		if err != nil {
			z.w.log.Error("resume battle", "account_id", p.accountID, "battle", a.ID, "err", err)
			return
		}
		if u.GetOutcome() != nil {
			z.finish(p, u.GetOutcome())
			return
		}
		z.showBattle(p, u.GetSides()[battle.PlayerSide].GetView(), nil)
	})
}
