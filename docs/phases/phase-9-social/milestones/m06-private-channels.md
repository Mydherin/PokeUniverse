# M6: Private Channels

Part of [Phase 9](../phase-9-social.md). Decisions: [context.md](context.md#messaging) D8-D10, D16.

## Resume Here

Not started. Needs M5 (same tables and thread).

## Tasks

- **Migration:** `channels(id → conversation, name, owner)`, roles on `conversation_members`, `channel_invites`.
- **HTTP:** create, rename, delete (owner), invite (owner, friends only), accept / decline invite, leave, remove member (owner), members list. Limits D16; `422` beyond.
- **Events:** invite received, member joined, left or removed, renamed, deleted, to every member's inbox (D9); messages as M5.
- **Client:** NEW CHANNEL (name with FireRed charset check) on the CHATS list; channel thread header → members (faces, owner mark) and settings; invites shown as rows with ACCEPT / DECLINE; INVITE from M2's menu and from a friend's row; the owner's long-press on a member → REMOVE.
- **Owner leaving:** oldest member becomes owner; last one out deletes it.
- **Bots:** `--channel` creates one and invites friends, `--flood` in it.

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Create and invite | Create "KANTO", invite bot and tab 2 | Invites arrive; accepted they are members | ⬜ |
| 2 | Group chat | Three members talk | All see every line in order; non-members see nothing | ⬜ |
| 3 | Decline | Invitee declines | Not a member, owner can invite again | ⬜ |
| 4 | Remove, leave | Owner removes one; another leaves | Lose access live; others see it | ⬜ |
| 5 | Owner leaves | Owner leaves | Oldest member owns it | ⬜ |
| 6 | Rename, delete | | All members updated; deleted disappears | ⬜ |
| 7 | 50 members | Bots fill it, flood | Delivery holds, rate limit applies | ⬜ |
| 8 | Persistence | Everyone logs out and back | Channel and history kept | ⬜ |
| 9 | Phone | Members and settings on the sheet | Gestures as M3 | ⬜ |
