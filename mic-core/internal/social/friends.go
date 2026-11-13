package social

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"google.golang.org/protobuf/encoding/protojson"

	socialv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/social/v1"
	trainerv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/trainer/v1"
	"pokeuniverse/mic-core/internal/account"
	"pokeuniverse/mic-core/internal/auth"
	"pokeuniverse/mic-core/internal/db"
	"pokeuniverse/mic-core/internal/httpx"
)

// Friend limits (phase-9 D3); the 50 incoming are kept by dropping the oldest (DropOldestIncoming).
const (
	maxFriends  = 100
	maxOutgoing = 20
)

// RateLimit wraps a handler with a per-IP limit.
type RateLimit func(name string, limit int, window time.Duration, next http.Handler) http.Handler

type Handler struct {
	Tokens *auth.Tokens
	Social *Service
	Log    *slog.Logger
}

// Register serves the friend routes (phase-9 D3). {id} is always the other player's account ID.
func (h *Handler) Register(mux *http.ServeMux, limit RateLimit) {
	user := func(name string, n int, f http.HandlerFunc) http.Handler {
		return limit(name, n, time.Minute, h.Tokens.Require(account.DefaultRole, f))
	}
	mux.Handle("GET /api/social/friends", user("friends", 120, h.list))
	mux.Handle("POST /api/social/friends/requests", user("friends-change", 120, h.send))
	mux.Handle("POST /api/social/friends/requests/{id}/accept", user("friends-change", 120, h.accept))
	mux.Handle("POST /api/social/friends/requests/{id}/decline", user("friends-change", 120, h.decline))
	mux.Handle("DELETE /api/social/friends/requests/{id}", user("friends-change", 120, h.cancel))
	mux.Handle("DELETE /api/social/friends/{id}", user("friends-change", 120, h.remove))
	mux.Handle("GET /api/social/conversations", user("conversations", 120, h.conversations))
	mux.Handle("GET /api/social/conversations/{id}/messages", user("conversations", 120, h.messages))
	h.registerChannels(mux, user)
}

// errStatus is a failed change's HTTP answer.
type errStatus struct {
	code int
	text string
}

func (e errStatus) Error() string { return e.text }

var (
	errNoPlayer    = errStatus{http.StatusNotFound, "no such player"}
	errNoRequest   = errStatus{http.StatusNotFound, "no such request"}
	errNotFriends  = errStatus{http.StatusNotFound, "not friends"}
	errFriends     = errStatus{http.StatusConflict, "already friends"}
	errPending     = errStatus{http.StatusConflict, "request already pending"}
	errSelf        = errStatus{http.StatusUnprocessableEntity, "that's you"}
	errFriendLimit = errStatus{http.StatusUnprocessableEntity, "friend limit reached"}
	errSentLimit   = errStatus{http.StatusUnprocessableEntity, "pending request limit reached"}
)

func (h *Handler) fail(w http.ResponseWriter, what string, err error) {
	var st errStatus
	if errors.As(err, &st) {
		http.Error(w, st.text, st.code)
		return
	}
	h.Log.Error(what, "err", err)
	http.Error(w, "internal error", http.StatusInternalServerError)
}

func caller(r *http.Request) int64 {
	p, _ := auth.PrincipalFrom(r.Context())
	return p.AccountID
}

func pathID(r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	return id, err == nil && id > 0
}

func pair(x, y int64) (a, b int64) { return min(x, y), max(x, y) }

func gender(g string) trainerv1.Gender {
	if g == "girl" {
		return trainerv1.Gender_GENDER_GIRL
	}
	return trainerv1.Gender_GENDER_BOY
}

func unix(t *time.Time) int64 {
	if t == nil {
		return 0
	}
	return t.Unix()
}

// list answers GET /api/social/friends with each friend's presence.
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	me := caller(r)
	ctx := r.Context()
	q := db.New(h.Social.pool)
	friends, err := q.ListFriends(ctx, me)
	if err != nil {
		h.fail(w, "list friends", err)
		return
	}
	in, err := q.ListIncomingRequests(ctx, me)
	if err != nil {
		h.fail(w, "list friend requests", err)
		return
	}
	out, err := q.ListOutgoingRequests(ctx, me)
	if err != nil {
		h.fail(w, "list friend requests", err)
		return
	}
	ids := make([]int64, len(friends))
	for i, f := range friends {
		ids[i] = f.AccountID
	}
	pres, err := h.Social.presences(ctx, ids)
	if err != nil {
		h.fail(w, "friends presence", err)
		return
	}
	res := &socialv1.FriendsList{}
	for i, f := range friends {
		fr := &socialv1.Friend{Id: uint64(f.AccountID), Name: f.Name, Gender: gender(f.Gender), Face: uint32(f.Face), Presence: pres[i]}
		if pres[i] == socialv1.Presence_PRESENCE_OFFLINE {
			fr.LastSeen = unix(f.LastSeenAt)
		}
		res.Friends = append(res.Friends, fr)
	}
	for _, x := range in {
		res.Incoming = append(res.Incoming, &socialv1.FriendRequest{SentAt: x.CreatedAt.Unix(),
			Player: &socialv1.Friend{Id: uint64(x.AccountID), Name: x.Name, Gender: gender(x.Gender), Face: uint32(x.Face)}})
	}
	for _, x := range out {
		res.Outgoing = append(res.Outgoing, &socialv1.FriendRequest{SentAt: x.CreatedAt.Unix(),
			Player: &socialv1.Friend{Id: uint64(x.AccountID), Name: x.Name, Gender: gender(x.Gender), Face: uint32(x.Face)}})
	}
	httpx.WriteProtoJSON(w, http.StatusOK, res)
}

// player is how the account shows in someone else's list, with its presence now.
func (s *Service) player(ctx context.Context, q *db.Queries, id int64) (*socialv1.Friend, error) {
	t, err := q.GetSocialTrainer(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errNoPlayer
	}
	if err != nil {
		return nil, err
	}
	pres, err := s.presences(ctx, []int64{id})
	if err != nil {
		return nil, err
	}
	f := &socialv1.Friend{Id: uint64(id), Name: t.Name, Gender: gender(t.Gender), Face: uint32(t.Face), Presence: pres[0]}
	if pres[0] == socialv1.Presence_PRESENCE_OFFLINE {
		f.LastSeen = unix(t.LastSeenAt)
	}
	return f, nil
}

// change runs f in a transaction holding both players' social locks (in account order, so two
// changes between the same pair never deadlock), with both players checked to exist.
func (s *Service) change(ctx context.Context, me, other int64, f func(q *db.Queries) error) error {
	if me == other {
		return errSelf
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	q := db.New(tx)
	a, b := pair(me, other)
	for _, id := range []int64{a, b} {
		if err := q.LockSocial(ctx, int32(id)); err != nil {
			return err
		}
	}
	for _, id := range []int64{me, other} {
		if _, err := q.GetSocialTrainer(ctx, id); errors.Is(err, pgx.ErrNoRows) {
			return errNoPlayer // The caller too: no trainer yet.
		} else if err != nil {
			return err
		}
	}
	if err := f(q); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// befriend makes the pair friends if neither has the most friends already.
func befriend(ctx context.Context, q *db.Queries, x, y int64) error {
	for _, id := range []int64{x, y} {
		n, err := q.CountFriends(ctx, id)
		if err != nil {
			return err
		}
		if n >= maxFriends {
			return errFriendLimit
		}
	}
	a, b := pair(x, y)
	return q.InsertFriendship(ctx, db.InsertFriendshipParams{A: a, B: b})
}

// send answers POST /api/social/friends/requests: a request, or a friendship when the other
// player had already asked (phase-9 D3).
func (h *Handler) send(w http.ResponseWriter, r *http.Request) {
	me := caller(r)
	ctx := r.Context()
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 256))
	var req socialv1.SendFriendRequest
	if err != nil || protojson.Unmarshal(body, &req) != nil || req.Id == 0 {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	to := int64(req.Id)
	var accepted bool
	var sentAt time.Time
	var dropped []int64
	err = h.Social.change(ctx, me, to, func(q *db.Queries) error {
		a, b := pair(me, to)
		if yes, err := q.AreFriends(ctx, db.AreFriendsParams{A: a, B: b}); err != nil {
			return err
		} else if yes {
			return errFriends
		}
		if yes, err := q.RequestExists(ctx, db.RequestExistsParams{FromID: me, ToID: to}); err != nil {
			return err
		} else if yes {
			return errPending
		}
		if n, err := q.DeleteFriendRequest(ctx, db.DeleteFriendRequestParams{FromID: to, ToID: me}); err != nil {
			return err
		} else if n > 0 {
			accepted = true // Both asked: one friendship, no request left.
			return befriend(ctx, q, me, to)
		}
		if n, err := q.CountOutgoingRequests(ctx, me); err != nil {
			return err
		} else if n >= maxOutgoing {
			return errSentLimit
		}
		if n, err := q.CountFriends(ctx, me); err != nil {
			return err
		} else if n >= maxFriends {
			return errFriendLimit
		}
		if sentAt, err = q.InsertFriendRequest(ctx, db.InsertFriendRequestParams{FromID: me, ToID: to}); err != nil {
			return err
		}
		dropped, err = q.DropOldestIncoming(ctx, to)
		return err
	})
	if err != nil {
		h.fail(w, "send friend request", err)
		return
	}
	q := db.New(h.Social.pool)
	mine, err := h.Social.player(ctx, q, me)
	if err != nil {
		h.fail(w, "friend request player", err)
		return
	}
	theirs, err := h.Social.player(ctx, q, to)
	if err != nil {
		h.fail(w, "friend request player", err)
		return
	}
	if accepted {
		h.Social.publish(to, &socialv1.SocialEvent{Event: &socialv1.SocialEvent_FriendAdded{FriendAdded: mine}})
		httpx.WriteProtoJSON(w, http.StatusOK, &socialv1.SendFriendRequestResult{Result: &socialv1.SendFriendRequestResult_Friend{Friend: theirs}})
		return
	}
	mine.Presence, mine.LastSeen = 0, 0 // A request shows no presence.
	theirs.Presence, theirs.LastSeen = 0, 0
	h.Social.publish(to, &socialv1.SocialEvent{Event: &socialv1.SocialEvent_RequestReceived{RequestReceived: &socialv1.FriendRequest{Player: mine, SentAt: sentAt.Unix()}}})
	for _, from := range dropped {
		h.Social.publish(from, closed(to, socialv1.RequestClosedReason_REQUEST_CLOSED_REASON_DROPPED))
	}
	httpx.WriteProtoJSON(w, http.StatusCreated, &socialv1.SendFriendRequestResult{Result: &socialv1.SendFriendRequestResult_Request{
		Request: &socialv1.FriendRequest{Player: theirs, SentAt: sentAt.Unix()}}})
}

func closed(id int64, why socialv1.RequestClosedReason) *socialv1.SocialEvent {
	return &socialv1.SocialEvent{Event: &socialv1.SocialEvent_RequestClosed{RequestClosed: &socialv1.RequestClosed{Id: uint64(id), Reason: why}}}
}

// accept answers POST .../requests/{id}/accept: {id}'s request to the caller becomes a friendship.
func (h *Handler) accept(w http.ResponseWriter, r *http.Request) {
	me := caller(r)
	from, ok := pathID(r)
	if !ok {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	err := h.Social.change(ctx, me, from, func(q *db.Queries) error {
		if n, err := q.DeleteFriendRequest(ctx, db.DeleteFriendRequestParams{FromID: from, ToID: me}); err != nil {
			return err
		} else if n == 0 {
			return errNoRequest
		}
		return befriend(ctx, q, me, from)
	})
	if err != nil {
		h.fail(w, "accept friend request", err)
		return
	}
	q := db.New(h.Social.pool)
	mine, err := h.Social.player(ctx, q, me)
	if err != nil {
		h.fail(w, "friend player", err)
		return
	}
	theirs, err := h.Social.player(ctx, q, from)
	if err != nil {
		h.fail(w, "friend player", err)
		return
	}
	h.Social.publish(from, &socialv1.SocialEvent{Event: &socialv1.SocialEvent_FriendAdded{FriendAdded: mine}})
	httpx.WriteProtoJSON(w, http.StatusOK, theirs)
}

// decline answers POST .../requests/{id}/decline: {id}'s request to the caller is dropped.
func (h *Handler) decline(w http.ResponseWriter, r *http.Request) {
	h.closeRequest(w, r, true)
}

// cancel answers DELETE .../requests/{id}: the caller's request to {id} is withdrawn.
func (h *Handler) cancel(w http.ResponseWriter, r *http.Request) {
	h.closeRequest(w, r, false)
}

func (h *Handler) closeRequest(w http.ResponseWriter, r *http.Request, declined bool) {
	me := caller(r)
	other, ok := pathID(r)
	if !ok {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	key, why := db.DeleteFriendRequestParams{FromID: me, ToID: other}, socialv1.RequestClosedReason_REQUEST_CLOSED_REASON_CANCELLED
	if declined {
		key, why = db.DeleteFriendRequestParams{FromID: other, ToID: me}, socialv1.RequestClosedReason_REQUEST_CLOSED_REASON_DECLINED
	}
	n, err := db.New(h.Social.pool).DeleteFriendRequest(r.Context(), key)
	if err != nil {
		h.fail(w, "close friend request", err)
		return
	}
	if n == 0 {
		http.Error(w, errNoRequest.text, errNoRequest.code)
		return
	}
	h.Social.publish(other, closed(me, why))
	w.WriteHeader(http.StatusNoContent)
}

// remove answers DELETE /api/social/friends/{id}: the friendship ends for both, and only the
// caller is told (phase-9 D3: no notice to the other).
func (h *Handler) remove(w http.ResponseWriter, r *http.Request) {
	me := caller(r)
	other, ok := pathID(r)
	if !ok {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	a, b := pair(me, other)
	n, err := db.New(h.Social.pool).DeleteFriendship(r.Context(), db.DeleteFriendshipParams{A: a, B: b})
	if err != nil {
		h.fail(w, "remove friend", err)
		return
	}
	if n == 0 {
		http.Error(w, errNotFriends.text, errNotFriends.code)
		return
	}
	h.Social.publish(me, &socialv1.SocialEvent{Event: &socialv1.SocialEvent_FriendRemoved{FriendRemoved: uint64(other)}})
	w.WriteHeader(http.StatusNoContent)
}

// Relation is what `other` is to `me`: a friend, a pending request either way, or nothing
// (phase-9 M2: the menu on A facing a player).
func (s *Service) Relation(ctx context.Context, me, other int64) (socialv1.Relation, error) {
	q := db.New(s.pool)
	a, b := pair(me, other)
	if yes, err := q.AreFriends(ctx, db.AreFriendsParams{A: a, B: b}); err != nil || yes {
		return socialv1.Relation_RELATION_FRIEND, err
	}
	if yes, err := q.RequestExists(ctx, db.RequestExistsParams{FromID: me, ToID: other}); err != nil || yes {
		return socialv1.Relation_RELATION_REQUEST_SENT, err
	}
	if yes, err := q.RequestExists(ctx, db.RequestExistsParams{FromID: other, ToID: me}); err != nil || yes {
		return socialv1.Relation_RELATION_REQUEST_RECEIVED, err
	}
	return socialv1.Relation_RELATION_NONE, nil
}
