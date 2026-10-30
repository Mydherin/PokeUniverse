// Package realtime serves the player WebSocket: Protocol Buffers envelopes,
// authenticated by access token (tech-stack.md#across-microservices).
package realtime

import (
	"log/slog"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/time/rate"
	"google.golang.org/protobuf/proto"

	realtimev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/realtime/v1"
	"pokeuniverse/mic-core/internal/auth"
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
)

// Verifier checks access tokens locally.
type Verifier interface {
	Verify(raw string) (auth.Principal, error)
}

type Handler struct {
	verifier Verifier
	upgrader websocket.Upgrader
	log      *slog.Logger
}

func NewHandler(verifier Verifier, origin string, log *slog.Logger) *Handler {
	return &Handler{
		verifier: verifier,
		log:      log,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			// Only our own web app may open the socket.
			CheckOrigin: func(r *http.Request) bool { return r.Header.Get("Origin") == origin },
		},
	}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ws, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return // Upgrade already replied with an error.
	}
	c := &conn{
		ws:       ws,
		send:     make(chan []byte, sendBuffer),
		closeReq: make(chan closeFrame, 1),
		done:     make(chan struct{}),
		limiter:  rate.NewLimiter(20, 40), // Per-player intent rate.
		h:        h,
	}
	c.run()
}

type closeFrame struct {
	code   int
	reason string
}

// conn is one player connection. The reader loop handles client messages;
// writeLoop is the only goroutine that writes to the socket.
type conn struct {
	ws       *websocket.Conn
	send     chan []byte
	closeReq chan closeFrame
	done     chan struct{}
	limiter  *rate.Limiter
	h        *Handler

	seq atomic.Uint32
	// Only used by the reader goroutine.
	principal auth.Principal
	expiry    *time.Timer

	closeOnce sync.Once
}

func (c *conn) run() {
	go c.writeLoop()
	defer func() {
		c.requestClose(websocket.CloseNormalClosure, "")
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
			return
		}
		if kind != websocket.BinaryMessage || !c.limiter.Allow() {
			c.fail(realtimev1.ErrorCode_ERROR_CODE_BAD_MESSAGE, closeBadMessage)
			return
		}
		var msg realtimev1.ClientMessage
		if err := proto.Unmarshal(data, &msg); err != nil {
			c.fail(realtimev1.ErrorCode_ERROR_CODE_BAD_MESSAGE, closeBadMessage)
			return
		}
		if !c.handle(&msg) {
			return
		}
	}
}

// handle processes one client message; false closes the connection.
func (c *conn) handle(msg *realtimev1.ClientMessage) bool {
	switch p := msg.Payload.(type) {
	case *realtimev1.ClientMessage_Authenticate:
		return c.authenticate(p.Authenticate.GetAccessToken())
	case *realtimev1.ClientMessage_Ping:
		if c.expiry == nil {
			c.fail(realtimev1.ErrorCode_ERROR_CODE_UNAUTHENTICATED, closeUnauthenticated)
			return false
		}
		c.write(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_Pong{Pong: &realtimev1.Pong{
			ClientTime: p.Ping.GetClientTime(),
			ServerTime: uint64(time.Now().UnixMilli()),
		}}})
		return true
	default:
		c.fail(realtimev1.ErrorCode_ERROR_CODE_BAD_MESSAGE, closeBadMessage)
		return false
	}
}

// authenticate accepts the first token and every refreshed one for the same account.
func (c *conn) authenticate(token string) bool {
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
	_ = c.ws.SetReadDeadline(time.Now().Add(pongWait))
	c.expiry = time.AfterFunc(time.Until(p.ExpiresAt), func() {
		c.fail(realtimev1.ErrorCode_ERROR_CODE_TOKEN_EXPIRED, closeTokenExpired)
	})
	c.write(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_Welcome{Welcome: &realtimev1.Welcome{
		AccountId: uint64(p.AccountID),
	}}})
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
	select {
	case c.send <- data:
	case <-c.done:
	default:
		// The client can't keep up; drop it instead of growing memory.
		c.requestClose(websocket.CloseTryAgainLater, "slow consumer")
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
