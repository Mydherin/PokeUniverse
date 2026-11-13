package social

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	socialv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/social/v1"
	"pokeuniverse/mic-core/internal/db"
	"pokeuniverse/mic-core/internal/httpx"
)

// Messaging (phase-9 D8-D11).
const (
	pageSize    = 50 // A history page (D10); the daily prune keeps 1,000 (PruneMessages).
	maxClientID = 64
)

func kindOf(k string) socialv1.ConversationKind {
	if k == "channel" {
		return socialv1.ConversationKind_CONVERSATION_KIND_CHANNEL
	}
	return socialv1.ConversationKind_CONVERSATION_KIND_DIRECT
}

// other is the direct conversation's other member, as me sees it (0 for a channel).
func other(a, b, me int64) int64 {
	if a == 0 {
		return 0
	}
	if a == me {
		return b
	}
	return a
}

// Send saves the already cleaned line (chat.Clean) from me and delivers it to every member's
// inbox, the sender's own included (D9). It returns the reason it failed, or UNSPECIFIED.
func (s *Service) Send(ctx context.Context, me int64, req *socialv1.SendMessage, text string) socialv1.SendFailedReason {
	clientID := req.GetClientId()
	if clientID == "" || len(clientID) > maxClientID {
		return socialv1.SendFailedReason_SEND_FAILED_REASON_INVALID
	}
	q := db.New(s.pool)
	var (
		conv    int64
		members []int64
		a, b    int64
	)
	switch {
	case req.GetConversation() == 0 && req.GetFriend() != 0:
		// A direct conversation, made on the first message.
		if int64(req.GetFriend()) == me {
			return socialv1.SendFailedReason_SEND_FAILED_REASON_NOT_ALLOWED
		}
		a, b = pair(me, int64(req.GetFriend()))
	case req.GetConversation() != 0:
		c, err := q.GetConversation(ctx, int64(req.GetConversation()))
		if errors.Is(err, pgx.ErrNoRows) {
			return socialv1.SendFailedReason_SEND_FAILED_REASON_NOT_ALLOWED
		} else if err != nil {
			s.log.Error("get conversation", "err", err)
			return socialv1.SendFailedReason_SEND_FAILED_REASON_ERROR
		}
		conv = c.ID
		if c.Kind == "channel" {
			// A channel takes any member's line (D16); the list is read now, so a member who
			// just left is not sent it.
			if ok, err := q.IsConversationMember(ctx, db.IsConversationMemberParams{Conversation: conv, Player: me}); err != nil {
				s.log.Error("channel member", "err", err)
				return socialv1.SendFailedReason_SEND_FAILED_REASON_ERROR
			} else if !ok {
				return socialv1.SendFailedReason_SEND_FAILED_REASON_NOT_ALLOWED
			}
			if members, err = q.ListConversationMembers(ctx, conv); err != nil {
				s.log.Error("channel members", "err", err)
				return socialv1.SendFailedReason_SEND_FAILED_REASON_ERROR
			}
			break
		}
		a, b = c.PairA.Int64, c.PairB.Int64
		if a != me && b != me {
			return socialv1.SendFailedReason_SEND_FAILED_REASON_NOT_ALLOWED
		}
	default:
		return socialv1.SendFailedReason_SEND_FAILED_REASON_INVALID
	}
	if members == nil {
		// Direct messages need a friendship (D11); the history stays readable without one.
		if ok, err := q.AreFriends(ctx, db.AreFriendsParams{A: a, B: b}); err != nil {
			s.log.Error("check friendship", "err", err)
			return socialv1.SendFailedReason_SEND_FAILED_REASON_ERROR
		} else if !ok {
			return socialv1.SendFailedReason_SEND_FAILED_REASON_NOT_ALLOWED
		}
		members = []int64{a, b}
	}
	if conv == 0 {
		id, err := q.EnsureDirectConversation(ctx, db.EnsureDirectConversationParams{A: a, B: b})
		if err != nil {
			s.log.Error("make conversation", "err", err)
			return socialv1.SendFailedReason_SEND_FAILED_REASON_ERROR
		}
		for _, m := range members {
			if err := q.AddConversationMember(ctx, db.AddConversationMemberParams{Conversation: id, Player: m}); err != nil {
				s.log.Error("add conversation member", "err", err)
				return socialv1.SendFailedReason_SEND_FAILED_REASON_ERROR
			}
		}
		conv = id
	}

	var name string
	if t, err := q.GetSocialTrainer(ctx, me); err == nil {
		name = t.Name
	}
	msg := &socialv1.ConversationMessage{Conversation: uint64(conv), Sender: uint64(me), Text: text, SenderName: name}
	saved, err := q.InsertMessage(ctx, db.InsertMessageParams{ConversationID: conv, Sender: me, Text: text, ClientID: clientID})
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		// A retry of a line already saved: answer the sender with it again, nobody else.
		old, err := q.GetMessageByClientID(ctx, db.GetMessageByClientIDParams{ConversationID: conv, Sender: me, ClientID: clientID})
		if err != nil {
			s.log.Error("get retried message", "err", err)
			return socialv1.SendFailedReason_SEND_FAILED_REASON_ERROR
		}
		msg.Seq, msg.Text, msg.SentAt, msg.ClientId = uint64(old.Seq), old.Text, old.SentAt.UnixMilli(), clientID
		msg.Friend = uint64(other(a, b, me))
		s.publish(me, &socialv1.SocialEvent{Event: &socialv1.SocialEvent_Message{Message: msg}})
		return socialv1.SendFailedReason_SEND_FAILED_REASON_UNSPECIFIED
	}
	if err != nil {
		s.log.Error("save message", "err", err)
		return socialv1.SendFailedReason_SEND_FAILED_REASON_ERROR
	}
	msg.Seq, msg.SentAt = uint64(saved.Seq), saved.SentAt.UnixMilli()
	// Kept for moderation, as zone chat (phase-8 D14).
	s.log.Info("message", "trainer", me, "conversation", conv, "seq", saved.Seq, "text", text)
	for _, m := range members {
		out := &socialv1.ConversationMessage{Conversation: msg.Conversation, Seq: msg.Seq, Sender: msg.Sender,
			Text: msg.Text, SentAt: msg.SentAt, Friend: uint64(other(a, b, m)), SenderName: name}
		if m == me {
			out.ClientId = clientID
		}
		s.publish(m, &socialv1.SocialEvent{Event: &socialv1.SocialEvent_Message{Message: out}})
	}
	return socialv1.SendFailedReason_SEND_FAILED_REASON_UNSPECIFIED
}

// MarkRead records that me has read the conversation up to seq (D10); never backwards.
func (s *Service) MarkRead(ctx context.Context, me int64, conv, seq uint64) {
	if err := db.New(s.pool).MarkRead(ctx, db.MarkReadParams{Seq: int64(seq), Conversation: int64(conv), Player: me}); err != nil {
		s.log.Error("mark read", "account_id", me, "err", err)
	}
}

// PruneLoop deletes, once a day, all but each conversation's newest 1,000 messages (D10). Every
// replica runs it; deleting twice does nothing.
func (s *Service) PruneLoop(ctx context.Context) {
	t := time.NewTicker(24 * time.Hour)
	defer t.Stop()
	for {
		n, err := db.New(s.pool).PruneMessages(ctx)
		if err != nil && ctx.Err() == nil {
			s.log.Error("prune messages", "err", err)
		} else if n > 0 {
			s.log.Info("pruned messages", "deleted", n)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// conversations answers GET /api/social/conversations: each with its unread count and last line.
func (h *Handler) conversations(w http.ResponseWriter, r *http.Request) {
	me := caller(r)
	ctx := r.Context()
	q := db.New(h.Social.pool)
	rows, err := q.ListConversations(ctx, me)
	if err != nil {
		h.fail(w, "list conversations", err)
		return
	}
	res := &socialv1.ConversationsList{}
	for _, c := range rows {
		out := &socialv1.Conversation{Id: uint64(c.ID), Kind: kindOf(c.Kind), LastSeq: uint64(c.LastSeq), LastReadSeq: uint64(c.LastReadSeq)}
		if c.Kind == "channel" {
			out.Channel = &socialv1.Channel{Id: uint64(c.ID), Name: c.ChannelName, Owner: uint64(c.ChannelOwner), Members: uint32(c.Members)}
		}
		var peer int64
		if c.Kind == "direct" {
			peer = other(c.PairA.Int64, c.PairB.Int64, me)
			f, err := h.Social.player(ctx, q, peer)
			if err != nil && !errors.Is(err, errNoPlayer) {
				h.fail(w, "conversation member", err)
				return
			}
			out.Friend = f
		}
		if c.LastSender != 0 {
			out.Last = &socialv1.ConversationMessage{Conversation: uint64(c.ID), Seq: uint64(c.LastSeq),
				Sender: uint64(c.LastSender), Text: c.LastText, SentAt: c.LastAt.UnixMilli(), Friend: uint64(peer), SenderName: c.LastSenderName}
		}
		res.Conversations = append(res.Conversations, out)
	}
	if res.Invites, err = h.Social.channelInvites(ctx, q, me); err != nil {
		h.fail(w, "list channel invites", err)
		return
	}
	httpx.WriteProtoJSON(w, http.StatusOK, res)
}

// messages answers GET /api/social/conversations/{id}/messages?before=|after= (D10).
func (h *Handler) messages(w http.ResponseWriter, r *http.Request) {
	me := caller(r)
	ctx := r.Context()
	conv, ok := pathID(r)
	if !ok {
		http.Error(w, "bad conversation", http.StatusBadRequest)
		return
	}
	q := db.New(h.Social.pool)
	c, err := q.GetConversation(ctx, conv)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "no such conversation", http.StatusNotFound)
		return
	} else if err != nil {
		h.fail(w, "get conversation", err)
		return
	}
	if member, err := q.IsConversationMember(ctx, db.IsConversationMemberParams{Conversation: conv, Player: me}); err != nil {
		h.fail(w, "conversation member", err)
		return
	} else if !member {
		http.Error(w, "no such conversation", http.StatusNotFound)
		return
	}
	var peer int64
	if c.Kind == "direct" {
		peer = other(c.PairA.Int64, c.PairB.Int64, me)
	}
	num := func(k string) (int64, bool) {
		v := r.URL.Query().Get(k)
		if v == "" {
			return 0, false
		}
		n, err := strconv.ParseInt(v, 10, 64)
		return n, err == nil && n >= 0
	}
	res := &socialv1.MessagesPage{}
	add := func(seq, sender int64, text string, at time.Time, name string) {
		res.Messages = append(res.Messages, &socialv1.ConversationMessage{Conversation: uint64(conv), Seq: uint64(seq),
			Sender: uint64(sender), Text: text, SentAt: at.UnixMilli(), Friend: uint64(peer), SenderName: name})
	}
	if after, ok := num("after"); ok {
		rows, err := q.ListMessagesAfter(ctx, db.ListMessagesAfterParams{ConversationID: conv, After: after, N: pageSize + 1})
		if err != nil {
			h.fail(w, "list messages", err)
			return
		}
		res.More = len(rows) > pageSize
		for _, m := range rows[:min(len(rows), pageSize)] {
			add(m.Seq, m.Sender, m.Text, m.SentAt, m.SenderName)
		}
	} else {
		before, ok := num("before")
		if !ok {
			before = c.LastSeq + 1
		}
		rows, err := q.ListMessagesBefore(ctx, db.ListMessagesBeforeParams{ConversationID: conv, Before: before, N: pageSize + 1})
		if err != nil {
			h.fail(w, "list messages", err)
			return
		}
		res.More = len(rows) > pageSize
		rows = rows[:min(len(rows), pageSize)]
		for i := len(rows) - 1; i >= 0; i-- {
			add(rows[i].Seq, rows[i].Sender, rows[i].Text, rows[i].SentAt, rows[i].SenderName)
		}
	}
	httpx.WriteProtoJSON(w, http.StatusOK, res)
}
