package world

import (
	"context"
	"errors"
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

// Battles from mic-core's side (plans/battles, Battle Flow): the zone checks every choice,
// asks mic-battles off its goroutine (retrying while mic-battles restarts) and, back in it,
// saves what changed before showing it. The active battle lives in Redis (package battle), so
// a reconnect or a restart of either service resumes it.

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
	if !p.party.CanBattle() {
		z.battleFailed(p, "")
		return
	}
	start := battle.NewStart(p.party, p.trainerID, key, t)
	data, _ := proto.Marshal(start)
	a := battle.Active{ID: start.BattleId, Trainer: key, Save: p.gen, Start: data}
	p.battle = &inBattle{Active: a}
	z.ask(p, func(ctx context.Context) (*battlev1.BattleUpdate, error) {
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
	var spend itemv1.Item
	switch k := c.GetAction().GetKind().(type) {
	case *battlev1.BattleAction_Move, *battlev1.BattleAction_Switch:
	case *battlev1.BattleAction_Item:
		if !usableInBattle(p, k.Item.GetItem()) {
			z.refuseChoice(p)
			return
		}
		spend = k.Item.GetItem()
	default:
		// RUN: there's no running from a trainer battle (the client says so first).
		z.refuseChoice(p)
		return
	}
	if c.GetStep() != b.request.GetStep() {
		z.refuseChoice(p)
		return
	}
	req := &battlev1.TurnRequest{BattleId: b.ID, Step: c.GetStep(), Choices: []*battlev1.SideChoice{{Side: battle.PlayerSide, Action: c.GetAction()}}}
	z.ask(p, func(ctx context.Context) (*battlev1.BattleUpdate, error) {
		return z.w.battles.Turn(ctx, req)
	}, func(u *battlev1.BattleUpdate, err error) {
		if err != nil {
			z.w.log.Error("battle turn", "account_id", p.accountID, "battle", b.ID, "step", req.Step, "err", err)
			z.refuseChoice(p)
			return
		}
		z.played(p, u, req.Step, spend)
	})
}

// usableInBattle: an item of the bag's ITEMS or BERRIES the trainer has (mic-battles checks
// what it does). Poké Balls come with wild battles (Phase 9).
func usableInBattle(p *Player, id itemv1.Item) bool {
	info, ok := item.Info(id)
	pocket := info.GetPocket()
	return ok && p.items.Bag.Quantity(id) > 0 && (pocket == itemv1.Pocket_POCKET_ITEMS || pocket == itemv1.Pocket_POCKET_BERRY_POUCH)
}

// refuseChoice asks the client for its choice again, with nothing new to show.
func (z *zone) refuseChoice(p *Player) {
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_BattleTurn{BattleTurn: &battlev1.BattleTurn{
		BattleId: p.battle.ID, Request: p.battle.request,
	}}})
}

// played shows a step mic-battles played: a bag item is spent first (D12: mic-core owns the
// bag), then the events and the next request, then the end if it's over.
func (z *zone) played(p *Player, u *battlev1.BattleUpdate, step uint32, spend itemv1.Item) {
	side := u.GetSides()[battle.PlayerSide]
	if spend != itemv1.Item_ITEM_UNSPECIFIED && side.GetRequest().GetStep() > step {
		info, _ := item.Info(spend)
		before := p.items.Clone()
		changed := item.Changed{Pockets: []itemv1.Pocket{info.GetPocket()}}
		if p.items.Bag.Remove(spend, 1) && z.saveTrainer(p, changed, false) {
			z.sendChanged(p, changed)
		} else {
			p.items = before
		}
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
// player is still in that battle here (otherwise their next join resumes it from Redis).
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
// money won or lost. Losing whites out (DoWhiteOut): money lost, party healed, back at the
// respawn point, the script ended. Retried while PostgreSQL is unreachable.
func (z *zone) finish(p *Player, o *battlev1.BattleOutcome) {
	b := p.battle
	result := o.GetSides()[battle.PlayerSide].GetResult()
	party, money := p.party.Clone(), p.money
	battle.Apply(p.party, o.GetSides()[battle.PlayerSide])
	won := result == battlev1.BattleResult_BATTLE_RESULT_WON || result == battlev1.BattleResult_BATTLE_RESULT_FORFEIT_WON
	delta := 0
	if won {
		if t := battle.Trainers[b.Trainer]; t != nil {
			delta = min(t.Prize(), battle.MaxMoney-p.money)
		}
	} else {
		delta = -battle.WhiteOutLoss(p.party, p.money)
		p.party.Heal()
	}
	p.money += delta

	applied, err := z.saveOutcome(p, b.ID, result, delta)
	if err != nil || !applied {
		p.party, p.money = party, money
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
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_BattleEnded{BattleEnded: &battlev1.BattleEnded{
		BattleId: b.ID, Result: result, Money: uint32(max(delta, -delta)),
	}}})
	z.sendParty(p)
	if !won {
		p.script, p.pcScript = 0, 0
		p.pos, p.facing = Point{Start.X, Start.Y}, Start.Facing
		p.elevation, p.dirty = z.m.Elevation(p.pos), true
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
		if err := pokemon.Write(ctx, q, p.accountID, save, p.party); err != nil {
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
func (w *World) joinBattle(ctx context.Context, accountID, save int64) (*inBattle, *battlev1.BattleView, error) {
	a, err := w.active.Active(ctx, accountID)
	if err != nil || a == nil {
		return nil, nil, err
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
