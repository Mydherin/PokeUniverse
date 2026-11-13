package social

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strconv"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"google.golang.org/protobuf/encoding/protojson"

	socialv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/social/v1"
	"pokeuniverse/mic-core/internal/chat"
	"pokeuniverse/mic-core/internal/db"
	"pokeuniverse/mic-core/internal/httpx"
)

// Private channels (phase-9 D16).
const (
	maxChannelName   = 16
	maxChannelPeople = 50 // Members plus pending invites.
	maxOwned         = 10
	maxJoined        = 30
)

var (
	errNoChannel   = errStatus{http.StatusNotFound, "no such channel"}
	errNoInvite    = errStatus{http.StatusNotFound, "no such invite"}
	errNoMember    = errStatus{http.StatusNotFound, "not a member"}
	errNotOwner    = errStatus{http.StatusForbidden, "only the owner can do that"}
	errBadName     = errStatus{http.StatusUnprocessableEntity, "bad channel name"}
	errOwnedLimit  = errStatus{http.StatusUnprocessableEntity, "owned channel limit reached"}
	errJoinedLimit = errStatus{http.StatusUnprocessableEntity, "joined channel limit reached"}
	errFull        = errStatus{http.StatusUnprocessableEntity, "channel is full"}
	errInviteOnly  = errStatus{http.StatusUnprocessableEntity, "only friends can be invited"}
	errMember      = errStatus{http.StatusConflict, "already a member"}
	errInvited     = errStatus{http.StatusConflict, "already invited"}
)

func (h *Handler) registerChannels(mux *http.ServeMux, user func(string, int, http.HandlerFunc) http.Handler) {
	mux.Handle("POST /api/social/channels", user("channels", 60, h.createChannel))
	mux.Handle("PATCH /api/social/channels/{id}", user("channels", 60, h.renameChannel))
	mux.Handle("DELETE /api/social/channels/{id}", user("channels", 60, h.deleteChannel))
	mux.Handle("GET /api/social/channels/{id}/members", user("conversations", 120, h.channelMembers))
	mux.Handle("POST /api/social/channels/{id}/invites", user("channels", 60, h.inviteToChannel))
	mux.Handle("POST /api/social/channels/{id}/accept", user("channels", 60, h.acceptChannel))
	mux.Handle("POST /api/social/channels/{id}/decline", user("channels", 60, h.declineChannel))
	mux.Handle("POST /api/social/channels/{id}/leave", user("channels", 60, h.leaveChannel))
	mux.Handle("DELETE /api/social/channels/{id}/members/{player}", user("channels", 60, h.removeFromChannel))
}

// channelName is a name as D16 allows it: FireRed's charset, trimmed, 1-16 characters.
func channelName(w http.ResponseWriter, r *http.Request) (string, bool) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 256))
	var req socialv1.ChannelName
	if err != nil || protojson.Unmarshal(body, &req) != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return "", false
	}
	name, ok := chat.Clean(req.Name)
	if !ok || utf8.RuneCountInString(name) > maxChannelName {
		http.Error(w, errBadName.text, errBadName.code)
		return "", false
	}
	return name, true
}

// outbox collects a change's events, sent once it is committed.
type outbox []func(s *Service)

func (o *outbox) to(ids []int64, ev *socialv1.SocialEvent) {
	*o = append(*o, func(s *Service) {
		for _, id := range ids {
			s.publish(id, ev)
		}
	})
}

// channelChange runs f in a transaction holding the channel's row lock (and, when lockMe, the
// caller's social lock first, so the joined and owned limits stay exact). Events go out after
// the commit.
func (s *Service) channelChange(ctx context.Context, me, id int64, lockMe bool, f func(q *db.Queries, ch db.Channel, out *outbox) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	q := db.New(tx)
	if lockMe {
		if err := q.LockSocial(ctx, int32(me)); err != nil {
			return err
		}
	}
	ch, err := q.LockChannel(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return errNoChannel
	} else if err != nil {
		return err
	}
	var out outbox
	if err := f(q, ch, &out); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	for _, send := range out {
		send(s)
	}
	return nil
}

func channelOf(row db.GetChannelRow) *socialv1.Channel {
	return &socialv1.Channel{Id: uint64(row.Conversation), Name: row.Name, Owner: uint64(row.Owner), Members: uint32(row.Members)}
}

// updated is the channel as it is now, for its members.
func updated(ctx context.Context, q *db.Queries, id int64) (*socialv1.Channel, []int64, error) {
	row, err := q.GetChannel(ctx, id)
	if err != nil {
		return nil, nil, err
	}
	members, err := q.ListConversationMembers(ctx, id)
	return channelOf(row), members, err
}

func channelEvent(ch *socialv1.Channel) *socialv1.SocialEvent {
	return &socialv1.SocialEvent{Event: &socialv1.SocialEvent_ChannelUpdated{ChannelUpdated: ch}}
}

func memberEvent(id int64, who *socialv1.Friend, c socialv1.ChannelMemberChange) *socialv1.SocialEvent {
	return &socialv1.SocialEvent{Event: &socialv1.SocialEvent_ChannelMember{ChannelMember: &socialv1.ChannelMemberChanged{Channel: uint64(id), Player: who, Change: c}}}
}

func goneEvent(id int64, c socialv1.ChannelMemberChange) *socialv1.SocialEvent {
	return &socialv1.SocialEvent{Event: &socialv1.SocialEvent_ChannelGone{ChannelGone: &socialv1.ChannelGone{Channel: uint64(id), Change: c}}}
}

func inviteClosed(id, player int64, why socialv1.ChannelInviteClosedReason) *socialv1.SocialEvent {
	return &socialv1.SocialEvent{Event: &socialv1.SocialEvent_ChannelInviteClosed{ChannelInviteClosed: &socialv1.ChannelInviteClosed{Channel: uint64(id), Player: uint64(player), Reason: why}}}
}

// createChannel answers POST /api/social/channels: the caller owns a new channel.
func (h *Handler) createChannel(w http.ResponseWriter, r *http.Request) {
	me := caller(r)
	name, ok := channelName(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	var ch *socialv1.Channel
	err := func() error {
		tx, err := h.Social.pool.Begin(ctx)
		if err != nil {
			return err
		}
		defer tx.Rollback(ctx)
		q := db.New(tx)
		if err := q.LockSocial(ctx, int32(me)); err != nil {
			return err
		}
		if _, err := q.GetSocialTrainer(ctx, me); errors.Is(err, pgx.ErrNoRows) {
			return errNoPlayer
		} else if err != nil {
			return err
		}
		if n, err := q.CountOwnedChannels(ctx, me); err != nil {
			return err
		} else if n >= maxOwned {
			return errOwnedLimit
		}
		if n, err := q.CountJoinedChannels(ctx, me); err != nil {
			return err
		} else if n >= maxJoined {
			return errJoinedLimit
		}
		id, err := q.CreateChannelConversation(ctx)
		if err != nil {
			return err
		}
		if err := q.InsertChannel(ctx, db.InsertChannelParams{Conversation: id, Name: name, Owner: me}); err != nil {
			return err
		}
		if err := q.JoinConversation(ctx, db.JoinConversationParams{Player: me, Conversation: id}); err != nil {
			return err
		}
		ch = &socialv1.Channel{Id: uint64(id), Name: name, Owner: uint64(me), Members: 1}
		return tx.Commit(ctx)
	}()
	if err != nil {
		h.fail(w, "create channel", err)
		return
	}
	h.Social.publish(me, channelEvent(ch)) // The caller's other tabs.
	httpx.WriteProtoJSON(w, http.StatusCreated, ch)
}

// renameChannel answers PATCH /api/social/channels/{id} (owner).
func (h *Handler) renameChannel(w http.ResponseWriter, r *http.Request) {
	me := caller(r)
	id, ok := pathID(r)
	if !ok {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	name, ok := channelName(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	var res *socialv1.Channel
	err := h.Social.channelChange(ctx, me, id, false, func(q *db.Queries, ch db.Channel, out *outbox) error {
		if ch.Owner != me {
			return errNotOwner
		}
		if err := q.RenameChannel(ctx, db.RenameChannelParams{Conversation: id, Name: name}); err != nil {
			return err
		}
		c, members, err := updated(ctx, q, id)
		res = c
		out.to(members, channelEvent(c))
		return err
	})
	if err != nil {
		h.fail(w, "rename channel", err)
		return
	}
	httpx.WriteProtoJSON(w, http.StatusOK, res)
}

// deleteChannel answers DELETE /api/social/channels/{id} (owner): gone for every member, and
// every pending invite closes.
func (h *Handler) deleteChannel(w http.ResponseWriter, r *http.Request) {
	me := caller(r)
	id, ok := pathID(r)
	if !ok {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	err := h.Social.channelChange(ctx, me, id, false, func(q *db.Queries, ch db.Channel, out *outbox) error {
		if ch.Owner != me {
			return errNotOwner
		}
		return deleteChannel(ctx, q, id, out)
	})
	if err != nil {
		h.fail(w, "delete channel", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func deleteChannel(ctx context.Context, q *db.Queries, id int64, out *outbox) error {
	members, err := q.ListConversationMembers(ctx, id)
	if err != nil {
		return err
	}
	invited, err := q.ListChannelInvitees(ctx, id)
	if err != nil {
		return err
	}
	if err := q.DeleteConversation(ctx, id); err != nil {
		return err
	}
	out.to(members, goneEvent(id, socialv1.ChannelMemberChange_CHANNEL_MEMBER_CHANGE_UNSPECIFIED))
	for _, p := range invited {
		out.to([]int64{p}, inviteClosed(id, p, socialv1.ChannelInviteClosedReason_CHANNEL_INVITE_CLOSED_REASON_DELETED))
	}
	return nil
}

// channelMembers answers GET /api/social/channels/{id}/members (members only); the owner also
// gets the players invited.
func (h *Handler) channelMembers(w http.ResponseWriter, r *http.Request) {
	me := caller(r)
	id, ok := pathID(r)
	if !ok {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	q := db.New(h.Social.pool)
	row, err := q.GetChannel(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		h.fail(w, "", errNoChannel)
		return
	} else if err != nil {
		h.fail(w, "get channel", err)
		return
	}
	if member, err := q.IsConversationMember(ctx, db.IsConversationMemberParams{Conversation: id, Player: me}); err != nil {
		h.fail(w, "channel member", err)
		return
	} else if !member {
		h.fail(w, "", errNoChannel)
		return
	}
	rows, err := q.ListChannelMembers(ctx, id)
	if err != nil {
		h.fail(w, "list channel members", err)
		return
	}
	res := &socialv1.ChannelMembers{Channel: channelOf(row)}
	for _, m := range rows {
		f, err := h.Social.player(ctx, q, m.Player)
		if err != nil {
			h.fail(w, "channel member", err)
			return
		}
		res.Members = append(res.Members, &socialv1.ChannelMember{Player: f, JoinedAt: m.JoinedAt.Unix()})
	}
	if row.Owner == me {
		invited, err := q.ListChannelInvitees(ctx, id)
		if err != nil {
			h.fail(w, "list channel invites", err)
			return
		}
		for _, p := range invited {
			f, err := h.Social.player(ctx, q, p)
			if err != nil {
				h.fail(w, "channel invitee", err)
				return
			}
			res.Invited = append(res.Invited, f)
		}
	}
	httpx.WriteProtoJSON(w, http.StatusOK, res)
}

// inviteToChannel answers POST /api/social/channels/{id}/invites (owner, friends only).
func (h *Handler) inviteToChannel(w http.ResponseWriter, r *http.Request) {
	me := caller(r)
	id, ok := pathID(r)
	if !ok {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 256))
	var req socialv1.ChannelInviteRequest
	if err != nil || protojson.Unmarshal(body, &req) != nil || req.Id == 0 {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	who := int64(req.Id)
	ctx := r.Context()
	err = h.Social.channelChange(ctx, me, id, false, func(q *db.Queries, ch db.Channel, out *outbox) error {
		if ch.Owner != me {
			return errNotOwner
		}
		if who == me {
			return errSelf
		}
		a, b := pair(me, who)
		if yes, err := q.AreFriends(ctx, db.AreFriendsParams{A: a, B: b}); err != nil {
			return err
		} else if !yes {
			return errInviteOnly
		}
		if yes, err := q.IsConversationMember(ctx, db.IsConversationMemberParams{Conversation: id, Player: who}); err != nil {
			return err
		} else if yes {
			return errMember
		}
		members, err := q.CountConversationMembers(ctx, id)
		if err != nil {
			return err
		}
		invites, err := q.CountChannelInvites(ctx, id)
		if err != nil {
			return err
		}
		if members+invites >= maxChannelPeople {
			return errFull
		}
		if n, err := q.InsertChannelInvite(ctx, db.InsertChannelInviteParams{Channel: id, Player: who, InvitedBy: me}); err != nil {
			return err
		} else if n == 0 {
			return errInvited
		}
		row, err := q.GetChannel(ctx, id)
		if err != nil {
			return err
		}
		from, err := h.Social.player(ctx, q, me)
		if err != nil {
			return err
		}
		inv := &socialv1.ChannelInvite{Channel: channelOf(row), From: from, SentAt: time.Now().Unix()}
		out.to([]int64{who}, &socialv1.SocialEvent{Event: &socialv1.SocialEvent_ChannelInvite{ChannelInvite: inv}})
		return nil
	})
	if err != nil {
		h.fail(w, "invite to channel", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// acceptChannel answers POST /api/social/channels/{id}/accept: the caller's invite makes them a
// member, told to every member.
func (h *Handler) acceptChannel(w http.ResponseWriter, r *http.Request) {
	me := caller(r)
	id, ok := pathID(r)
	if !ok {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	var res *socialv1.Channel
	err := h.Social.channelChange(ctx, me, id, true, func(q *db.Queries, ch db.Channel, out *outbox) error {
		if n, err := q.DeleteChannelInvite(ctx, db.DeleteChannelInviteParams{Channel: id, Player: me}); err != nil {
			return err
		} else if n == 0 {
			return errNoInvite
		}
		if n, err := q.CountJoinedChannels(ctx, me); err != nil {
			return err
		} else if n >= maxJoined {
			return errJoinedLimit
		}
		if n, err := q.CountConversationMembers(ctx, id); err != nil {
			return err
		} else if n >= maxChannelPeople {
			return errFull
		}
		if err := q.JoinConversation(ctx, db.JoinConversationParams{Player: me, Conversation: id}); err != nil {
			return err
		}
		c, members, err := updated(ctx, q, id)
		if err != nil {
			return err
		}
		who, err := h.Social.player(ctx, q, me)
		if err != nil {
			return err
		}
		res = c
		out.to([]int64{me}, inviteClosed(id, me, socialv1.ChannelInviteClosedReason_CHANNEL_INVITE_CLOSED_REASON_ACCEPTED))
		out.to(members, memberEvent(id, who, socialv1.ChannelMemberChange_CHANNEL_MEMBER_CHANGE_JOINED))
		out.to(members, channelEvent(c))
		return nil
	})
	if err != nil {
		h.fail(w, "accept channel invite", err)
		return
	}
	httpx.WriteProtoJSON(w, http.StatusOK, res)
}

// declineChannel answers POST /api/social/channels/{id}/decline: the owner may invite again.
func (h *Handler) declineChannel(w http.ResponseWriter, r *http.Request) {
	me := caller(r)
	id, ok := pathID(r)
	if !ok {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	err := h.Social.channelChange(ctx, me, id, false, func(q *db.Queries, ch db.Channel, out *outbox) error {
		if n, err := q.DeleteChannelInvite(ctx, db.DeleteChannelInviteParams{Channel: id, Player: me}); err != nil {
			return err
		} else if n == 0 {
			return errNoInvite
		}
		out.to([]int64{me, ch.Owner}, inviteClosed(id, me, socialv1.ChannelInviteClosedReason_CHANNEL_INVITE_CLOSED_REASON_DECLINED))
		return nil
	})
	if err != nil {
		h.fail(w, "decline channel invite", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// leaveChannel answers POST /api/social/channels/{id}/leave. An owner leaving hands the channel to
// the longest member; the last one out deletes it (D16).
func (h *Handler) leaveChannel(w http.ResponseWriter, r *http.Request) {
	me := caller(r)
	id, ok := pathID(r)
	if !ok {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	h.dropMember(w, r, me, id, me, socialv1.ChannelMemberChange_CHANNEL_MEMBER_CHANGE_LEFT)
}

// removeFromChannel answers DELETE /api/social/channels/{id}/members/{player} (owner).
func (h *Handler) removeFromChannel(w http.ResponseWriter, r *http.Request) {
	me := caller(r)
	id, ok := pathID(r)
	who, err := strconv.ParseInt(r.PathValue("player"), 10, 64)
	if !ok || err != nil || who <= 0 {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if who == me {
		h.fail(w, "", errSelf)
		return
	}
	h.dropMember(w, r, me, id, who, socialv1.ChannelMemberChange_CHANNEL_MEMBER_CHANGE_REMOVED)
}

func (h *Handler) dropMember(w http.ResponseWriter, r *http.Request, me, id, who int64, change socialv1.ChannelMemberChange) {
	ctx := r.Context()
	err := h.Social.channelChange(ctx, me, id, false, func(q *db.Queries, ch db.Channel, out *outbox) error {
		if change == socialv1.ChannelMemberChange_CHANNEL_MEMBER_CHANGE_REMOVED && ch.Owner != me {
			return errNotOwner
		}
		if n, err := q.RemoveConversationMember(ctx, db.RemoveConversationMemberParams{Conversation: id, Player: who}); err != nil {
			return err
		} else if n == 0 {
			return errNoMember
		}
		out.to([]int64{who}, goneEvent(id, change))
		left, err := q.CountConversationMembers(ctx, id)
		if err != nil {
			return err
		}
		if left == 0 {
			return deleteChannel(ctx, q, id, out)
		}
		if ch.Owner == who {
			next, err := q.OldestConversationMember(ctx, id)
			if err != nil {
				return err
			}
			if err := q.SetChannelOwner(ctx, db.SetChannelOwnerParams{Conversation: id, Owner: next}); err != nil {
				return err
			}
		}
		c, members, err := updated(ctx, q, id)
		if err != nil {
			return err
		}
		gone, err := h.Social.player(ctx, q, who)
		if err != nil && !errors.Is(err, errNoPlayer) {
			return err
		}
		if gone == nil {
			gone = &socialv1.Friend{Id: uint64(who)}
		}
		out.to(members, memberEvent(id, gone, change))
		out.to(members, channelEvent(c))
		return nil
	})
	if err != nil {
		h.fail(w, "leave channel", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// channelInvites is the caller's pending invites, for the conversation list.
func (s *Service) channelInvites(ctx context.Context, q *db.Queries, me int64) ([]*socialv1.ChannelInvite, error) {
	rows, err := q.ListMyChannelInvites(ctx, me)
	if err != nil {
		return nil, err
	}
	var res []*socialv1.ChannelInvite
	for _, i := range rows {
		from, err := s.player(ctx, q, i.InvitedBy)
		if errors.Is(err, errNoPlayer) {
			from, err = &socialv1.Friend{Id: uint64(i.InvitedBy)}, nil
		}
		if err != nil {
			return nil, err
		}
		res = append(res, &socialv1.ChannelInvite{
			Channel: &socialv1.Channel{Id: uint64(i.Channel), Name: i.Name, Owner: uint64(i.Owner), Members: uint32(i.Members)},
			From:    from, SentAt: i.SentAt.Unix(),
		})
	}
	return res, nil
}
