// Package realtime serves the player WebSocket: Protocol Buffers envelopes,
// authenticated by access token (tech-stack.md#across-microservices).
package realtime

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log/slog"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/time/rate"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"

	realtimev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/realtime/v1"
	worldv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/world/v1"
	"pokeuniverse/mic-core/internal/auth"
	"pokeuniverse/mic-core/internal/chat"
	"pokeuniverse/mic-core/internal/live"
	"pokeuniverse/mic-core/internal/stats"
	"pokeuniverse/mic-core/internal/world"
)

const (
	authTimeout  = 5 * time.Second
	pongWait     = 60 * time.Second
	pingInterval = 25 * time.Second
	writeWait    = 5 * time.Second
	maxMessage   = 4 << 10
	sendBuffer   = 64

	// Close codes (4000-4999 are application-defined). The client refreshes and reconnects on these.
	closeUnauthenticated = 4001
	closeTokenExpired    = 4002
	closeBadMessage      = 4003
	// The account is played from another connection now; the client doesn't reconnect.
	closeReplaced = 4004
	// The server is restarting; the client reconnects (to any replica) and continues.
	closeServiceRestart = 1012
)

// Verifier checks access tokens locally.
type Verifier interface {
	Verify(raw string) (auth.Principal, error)
}

// World is the overworld players enter.
type World interface {
	Join(ctx context.Context, accountID int64, s live.Session, takeOver bool, sink world.Sink) (*world.Player, *worldv1.WorldSnapshot, error)
	Leave(p *world.Player)
}

// maxInstance bounds the client's instance ID (a UUID).
const maxInstance = 64

type Handler struct {
	verifier Verifier
	world    World
	upgrader websocket.Upgrader
	log      *slog.Logger

	mu      sync.Mutex
	conns   map[*conn]struct{}
	closing bool
	wg      sync.WaitGroup
}

func NewHandler(verifier Verifier, w World, origin string, log *slog.Logger) *Handler {
	return &Handler{
		verifier: verifier,
		world:    w,
		log:      log,
		conns:    map[*conn]struct{}{},
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			// Only our own web app may open the socket.
			CheckOrigin: func(r *http.Request) bool { return r.Header.Get("Origin") == origin },
		},
	}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h.mu.Lock()
	if h.closing {
		h.mu.Unlock()
		http.Error(w, "shutting down", http.StatusServiceUnavailable)
		return
	}
	h.wg.Add(1)
	h.mu.Unlock()
	defer h.wg.Done()

	ws, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return // Upgrade already replied with an error.
	}
	c := &conn{
		id:       newConnID(),
		ws:       ws,
		send:     make(chan []byte, sendBuffer),
		closeReq: make(chan closeFrame, 1),
		done:     make(chan struct{}),
		limiter:  rate.NewLimiter(20, 40), // Per-player intent rate.
		chat:     rate.NewLimiter(0.5, 4), // Per-player chat rate (phase-8 D17).
		h:        h,
	}
	h.mu.Lock()
	h.conns[c] = struct{}{}
	h.mu.Unlock()
	c.run()
	h.mu.Lock()
	delete(h.conns, c)
	h.mu.Unlock()
}

// Shutdown closes every connection (clients reconnect to another replica) and waits until
// each one has left the world, or ctx ends.
func (h *Handler) Shutdown(ctx context.Context) {
	h.mu.Lock()
	h.closing = true
	for c := range h.conns {
		c.requestClose(closeServiceRestart, "service restart")
	}
	h.mu.Unlock()
	done := make(chan struct{})
	go func() { h.wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-ctx.Done():
	}
}

func newConnID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

type closeFrame struct {
	code   int
	reason string
}

// conn is one player connection. The reader loop handles client messages;
// writeLoop is the only goroutine that writes to the socket.
type conn struct {
	id       string
	ws       *websocket.Conn
	send     chan []byte
	closeReq chan closeFrame
	done     chan struct{}
	limiter  *rate.Limiter
	chat     *rate.Limiter
	h        *Handler

	seq atomic.Uint32
	// Only used by the reader goroutine.
	principal auth.Principal
	instance  string
	expiry    *time.Timer
	player    *world.Player

	closeOnce sync.Once
}

func (c *conn) run() {
	go c.writeLoop()
	defer func() {
		c.requestClose(websocket.CloseNormalClosure, "")
		c.leaveWorld()
		if c.expiry != nil {
			c.expiry.Stop()
			c.h.log.Info("player disconnected", "account_id", c.principal.AccountID)
		}
	}()

	c.ws.SetReadLimit(maxMessage)
	_ = c.ws.SetReadDeadline(time.Now().Add(authTimeout))
	c.ws.SetPongHandler(func(string) error {
		return c.ws.SetReadDeadline(time.Now().Add(pongWait))
	})

	for {
		kind, data, err := c.ws.ReadMessage()
		if err != nil {
			if errors.Is(err, websocket.ErrReadLimit) {
				c.dropped(stats.IntentSize)
			}
			return
		}
		at := time.Now()
		if kind != websocket.BinaryMessage || !c.limiter.Allow() {
			c.dropped(map[bool]stats.Drop{true: stats.IntentInvalid, false: stats.IntentRate}[kind != websocket.BinaryMessage])
			c.fail(realtimev1.ErrorCode_ERROR_CODE_BAD_MESSAGE, closeBadMessage)
			return
		}
		var msg realtimev1.ClientMessage
		if err := proto.Unmarshal(data, &msg); err != nil {
			c.dropped(stats.IntentInvalid)
			c.fail(realtimev1.ErrorCode_ERROR_CODE_BAD_MESSAGE, closeBadMessage)
			return
		}
		if !c.handle(&msg, at) {
			return
		}
	}
}

// handle processes one client message, received at `at`; false closes the connection.
func (c *conn) handle(msg *realtimev1.ClientMessage, at time.Time) bool {
	if _, ok := msg.Payload.(*realtimev1.ClientMessage_Authenticate); !ok && c.expiry == nil {
		c.fail(realtimev1.ErrorCode_ERROR_CODE_UNAUTHENTICATED, closeUnauthenticated)
		return false
	}
	switch p := msg.Payload.(type) {
	case *realtimev1.ClientMessage_Authenticate:
		return c.authenticate(p.Authenticate.GetAccessToken(), p.Authenticate.GetInstance())
	case *realtimev1.ClientMessage_Ping:
		c.write(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_Pong{Pong: &realtimev1.Pong{
			ClientTime: p.Ping.GetClientTime(),
			ServerTime: uint64(time.Now().UnixMilli()),
		}}})
		return true
	case *realtimev1.ClientMessage_EnterWorld:
		return c.enterWorld(p.EnterWorld.GetTakeOver())
	case *realtimev1.ClientMessage_SendChat:
		// Dropped without an answer outside the world, over the rate or invalid (phase-8 D17):
		// FireRed has no refusal message, and a slow or old client isn't misbehaving.
		if c.player == nil {
			return true
		}
		if !c.chat.Allow() {
			c.dropped(stats.ChatRate)
			return true
		}
		if line, ok := chat.Clean(p.SendChat.GetText()); ok {
			c.player.SendChat(line)
		} else {
			c.dropped(stats.ChatInvalid)
		}
		return true
	}
	// The rest are world intents: only once in the world.
	if c.player == nil {
		c.fail(realtimev1.ErrorCode_ERROR_CODE_BAD_MESSAGE, closeBadMessage)
		return false
	}
	switch p := msg.Payload.(type) {
	case *realtimev1.ClientMessage_Move:
		if p.Move == nil || !world.ValidDirection(p.Move.Direction) {
			break
		}
		c.player.Move(p.Move, at)
		return true
	case *realtimev1.ClientMessage_UseWarp:
		if p.UseWarp == nil || !world.ValidDirection(p.UseWarp.Direction) {
			break
		}
		c.player.UseWarp(p.UseWarp, at)
		return true
	case *realtimev1.ClientMessage_Turn:
		if p.Turn == nil || !world.ValidDirection(p.Turn.Direction) {
			break
		}
		c.player.Turn(p.Turn)
		return true
	case *realtimev1.ClientMessage_Interact:
		c.player.Interact(p.Interact)
		return true
	case *realtimev1.ClientMessage_ScriptDone:
		c.player.ScriptDone(p.ScriptDone)
		return true
	case *realtimev1.ClientMessage_UseItem:
		c.player.UseItem(p.UseItem)
		return true
	case *realtimev1.ClientMessage_GiveItem:
		c.player.GiveItem(p.GiveItem)
		return true
	case *realtimev1.ClientMessage_TossItem:
		c.player.TossItem(p.TossItem)
		return true
	case *realtimev1.ClientMessage_RegisterItem:
		c.player.RegisterItem(p.RegisterItem)
		return true
	case *realtimev1.ClientMessage_MoveItem:
		c.player.MoveItem(p.MoveItem)
		return true
	case *realtimev1.ClientMessage_WithdrawItem:
		c.player.WithdrawItem(p.WithdrawItem)
		return true
	case *realtimev1.ClientMessage_DepositItem:
		c.player.DepositItem(p.DepositItem)
		return true
	case *realtimev1.ClientMessage_MovePcItem:
		c.player.MovePcItem(p.MovePcItem)
		return true
	case *realtimev1.ClientMessage_SwapPartySlots:
		c.player.SwapPartySlots(p.SwapPartySlots)
		return true
	case *realtimev1.ClientMessage_GivePartyItem:
		c.player.GivePartyItem(p.GivePartyItem)
		return true
	case *realtimev1.ClientMessage_TakePartyItem:
		c.player.TakePartyItem(p.TakePartyItem)
		return true
	case *realtimev1.ClientMessage_UsePartyItem:
		c.player.UsePartyItem(p.UsePartyItem)
		return true
	case *realtimev1.ClientMessage_UseFieldMove:
		c.player.UseFieldMove(p.UseFieldMove)
		return true
	case *realtimev1.ClientMessage_OpenBox:
		c.player.OpenBox(msg.GetSeq(), p.OpenBox)
		return true
	case *realtimev1.ClientMessage_MovePokemon:
		c.player.MovePokemon(msg.GetSeq(), p.MovePokemon)
		return true
	case *realtimev1.ClientMessage_ReleasePokemon:
		c.player.ReleasePokemon(msg.GetSeq(), p.ReleasePokemon)
		return true
	case *realtimev1.ClientMessage_SetMarkings:
		c.player.SetMarkings(msg.GetSeq(), p.SetMarkings)
		return true
	case *realtimev1.ClientMessage_MoveHeldItem:
		c.player.MoveHeldItem(msg.GetSeq(), p.MoveHeldItem)
		return true
	case *realtimev1.ClientMessage_StoreHeldItem:
		c.player.StoreHeldItem(msg.GetSeq(), p.StoreHeldItem)
		return true
	case *realtimev1.ClientMessage_GiveHeldItem:
		c.player.GiveHeldItem(msg.GetSeq(), p.GiveHeldItem)
		return true
	case *realtimev1.ClientMessage_RenameBox:
		c.player.RenameBox(msg.GetSeq(), p.RenameBox)
		return true
	case *realtimev1.ClientMessage_SetBoxWallpaper:
		c.player.SetBoxWallpaper(msg.GetSeq(), p.SetBoxWallpaper)
		return true
	case *realtimev1.ClientMessage_SwapPokemonMoves:
		c.player.SwapPokemonMoves(p.SwapPokemonMoves)
		return true
	case *realtimev1.ClientMessage_NameCaughtPokemon:
		c.player.NameCaughtPokemon(p.NameCaughtPokemon)
		return true
	case *realtimev1.ClientMessage_EvolvePokemon:
		c.player.EvolvePokemon(p.EvolvePokemon)
		return true
	case *realtimev1.ClientMessage_LearnMove:
		c.player.LearnMove(p.LearnMove)
		return true
	case *realtimev1.ClientMessage_ScriptBattle:
		c.player.ScriptBattle(p.ScriptBattle)
		return true
	case *realtimev1.ClientMessage_BattleChoice:
		c.player.BattleChoice(p.BattleChoice)
		return true
	}
	c.dropped(stats.IntentInvalid)
	c.fail(realtimev1.ErrorCode_ERROR_CODE_BAD_MESSAGE, closeBadMessage)
	return false
}

// dropped counts a message dropped by reason, and in the player's zone once in the world (phase-8 M8).
func (c *conn) dropped(d stats.Drop) {
	stats.Count(d)
	if c.player != nil {
		c.player.Dropped(d)
	}
}

// enterWorld puts the trainer in the world (again, after a reconnect) and sends the snapshot.
func (c *conn) enterWorld(takeOver bool) bool {
	c.leaveWorld()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	p, snapshot, err := c.h.world.Join(ctx, c.principal.AccountID, live.Session{Instance: c.instance, Conn: c.id}, takeOver, sink{c})
	if code, ok := joinErrors[err]; ok {
		// The connection stays: the client may ask again (New Game), or stops (replaced).
		c.write(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_Error{Error: &realtimev1.Error{Code: code}}})
		return true
	}
	if err != nil {
		// The client reconnects and tries again.
		c.h.log.Error("enter world", "account_id", c.principal.AccountID, "err", err)
		c.requestClose(websocket.CloseInternalServerErr, "try again")
		return false
	}
	c.player = p
	c.write(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_Snapshot{Snapshot: snapshot}})
	return true
}

func (c *conn) leaveWorld() {
	if c.player != nil {
		c.h.world.Leave(c.player)
		c.player = nil
	}
}

var joinErrors = map[error]realtimev1.ErrorCode{
	world.ErrNoTrainer:     realtimev1.ErrorCode_ERROR_CODE_NO_TRAINER,
	world.ErrSessionActive: realtimev1.ErrorCode_ERROR_CODE_SESSION_ACTIVE,
}

// sink is how the world reaches the connection.
type sink struct{ c *conn }

func (s sink) Send(msg *realtimev1.ServerMessage) { s.c.write(msg) }

func (s sink) SendZoneEvents(encoded []byte) { s.c.writeZoneEvents(encoded) }

func (s sink) Kick() { s.c.fail(realtimev1.ErrorCode_ERROR_CODE_REPLACED, closeReplaced) }

// authenticate accepts the first token and every refreshed one for the same account. The
// first one names the copy of the game (instance), which tells its reconnects from other copies.
func (c *conn) authenticate(token, instance string) bool {
	p, err := c.h.verifier.Verify(token)
	first := c.expiry == nil
	if err != nil || (!first && p.AccountID != c.principal.AccountID) {
		c.fail(realtimev1.ErrorCode_ERROR_CODE_UNAUTHENTICATED, closeUnauthenticated)
		return false
	}
	c.principal = p
	if !first {
		c.expiry.Reset(time.Until(p.ExpiresAt))
		return true
	}
	if instance == "" || len(instance) > maxInstance {
		c.fail(realtimev1.ErrorCode_ERROR_CODE_BAD_MESSAGE, closeBadMessage)
		return false
	}
	c.instance = instance
	_ = c.ws.SetReadDeadline(time.Now().Add(pongWait))
	c.expiry = time.AfterFunc(time.Until(p.ExpiresAt), func() {
		c.fail(realtimev1.ErrorCode_ERROR_CODE_TOKEN_EXPIRED, closeTokenExpired)
	})
	c.write(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_Welcome{Welcome: &realtimev1.Welcome{AccountId: uint64(p.AccountID)}}})
	c.h.log.Info("player connected", "account_id", p.AccountID)
	return true
}

// write queues a server message with the next sequence number.
func (c *conn) write(msg *realtimev1.ServerMessage) {
	msg.Seq = c.seq.Add(1)
	data, err := proto.Marshal(msg)
	if err != nil {
		c.h.log.Error("marshal server message", "err", err)
		return
	}
	c.enqueue(data)
}

// The envelope's fields that writeZoneEvents encodes by hand.
var (
	seqField        = envelopeField("seq")
	zoneEventsField = envelopeField("zone_events")
)

func envelopeField(name protoreflect.Name) protowire.Number {
	return (&realtimev1.ServerMessage{}).ProtoReflect().Descriptor().Fields().ByName(name).Number()
}

// writeZoneEvents queues a ZoneEvents encoded once for the whole zone (phase-8 D7): only the
// envelope (this connection's seq, then the payload as field zone_events) is built here.
func (c *conn) writeZoneEvents(encoded []byte) {
	data := make([]byte, 0, len(encoded)+16)
	data = protowire.AppendTag(data, seqField, protowire.VarintType)
	data = protowire.AppendVarint(data, uint64(c.seq.Add(1)))
	data = protowire.AppendTag(data, zoneEventsField, protowire.BytesType)
	data = protowire.AppendBytes(data, encoded)
	c.enqueue(data)
}

func (c *conn) enqueue(data []byte) {
	select {
	case c.send <- data:
	case <-c.done:
	default:
		// The client can't keep up; drop it instead of growing memory (it reconnects with a snapshot).
		c.closeOnce.Do(func() {
			stats.Count(stats.SlowConsumer)
			c.h.log.Warn("slow consumer dropped", "account_id", c.principal.AccountID)
			c.closeReq <- closeFrame{websocket.CloseTryAgainLater, "slow consumer"}
		})
	}
}

// fail tells the client why, then closes the socket.
func (c *conn) fail(code realtimev1.ErrorCode, closeCode int) {
	c.write(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_Error{Error: &realtimev1.Error{Code: code}}})
	c.requestClose(closeCode, code.String())
}

func (c *conn) requestClose(code int, reason string) {
	c.closeOnce.Do(func() { c.closeReq <- closeFrame{code, reason} })
}

func (c *conn) writeLoop() {
	ticker := time.NewTicker(pingInterval)
	defer func() {
		ticker.Stop()
		close(c.done)
		_ = c.ws.Close()
	}()
	for {
		select {
		case data := <-c.send:
			if !c.writeData(data) {
				return
			}
		case f := <-c.closeReq:
			c.flush()
			_ = c.ws.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(f.code, f.reason), time.Now().Add(writeWait))
			return
		case <-ticker.C:
			if err := c.ws.WriteControl(websocket.PingMessage, nil, time.Now().Add(writeWait)); err != nil {
				return
			}
		}
	}
}

// flush writes whatever is still queued (e.g. the Error before a close).
func (c *conn) flush() {
	for {
		select {
		case data := <-c.send:
			if !c.writeData(data) {
				return
			}
		default:
			return
		}
	}
}

func (c *conn) writeData(data []byte) bool {
	_ = c.ws.SetWriteDeadline(time.Now().Add(writeWait))
	return c.ws.WriteMessage(websocket.BinaryMessage, data) == nil
}
