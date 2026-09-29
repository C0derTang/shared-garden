# Partner entry replies

Status: approved user request and conservative implementation choices under
[decision 0004](0004-finalized-launch-rules.md).
Issue: [#141](https://github.com/C0derTang/shared-garden/issues/141).
This supplements [daily entries](0009-daily-entries-and-questions.md) and the
[two-person flower sheet](0053-two-person-flower-sheet.md).

The other member can append a plain-text reply to any ordinary flower entry,
including historical entries and permanent blooms. Both members read replies
immediately. Peony keeps its separate milestone workflow. Only the partner of
the original entry author can create replies on that entry; the author can read
them. This is a flat reply list, without nested replies, editing, deletion,
media, notifications or extra growth rules.

Replies are immutable rows in `entry_replies`, linked to `flower_entries`.
The server derives the member and creation time, validates the parent and live
membership, and accepts 1–4,000 Unicode characters after trimming whitespace.
The RPC takes the garden lock, rechecks membership and writes only the reply;
it never settles the garden or evaluates achievements. Daily response limits,
care markers, growth, streaks, achievements and original entry edit windows
continue to depend on the existing entry records, never on replies.

A UUID request ID is unique per replying member. Retrying the same entry/text
returns the existing reply. Reusing an ID for other content is rejected. The
composer retains its request ID and freezes the message after an ambiguous
response until the same message can be confirmed. A definite validation/access
rejection allows editing again. Pending submits are guarded synchronously.

Each Today and loaded history entry displays its replies with author and Pacific
date/time, then a labeled composer when eligible. Copy explicitly says replies
do not count toward daily responses or growth. Text is rendered as plain React
text; long content wraps on narrow screens. Existing pixel frames, buttons,
focus styles and readable typography are retained.

Reads return the latest 50 replies in chronological order, with an exclusive
older-ID cursor for earlier pages. Realtime invalidates the existing garden
snapshot; its refresh key reloads visible reply panels. Reopen, reconnect,
visibility refresh and existing fallback polling also refresh through that same
flow. If a disconnected interval fills an entirely newer page, the panel resets
to it so earlier pagination cannot skip unseen replies. Read failures offer a
retry without discarding a draft. Replies are member-readable through RLS;
anonymous, revoked and outside identities cannot read them. Browser and service
roles have no direct mutation grants.

Verification includes database membership, authorization, bounded content,
idempotence, pagination, historical/bloomed parents and no care/progression
changes; UI/action tests cover safe text, both identities, independent reply
submits, pending and ambiguous retry, pagination and refresh. Existing database
and web CI remain required before merge. No production content or identities
are part of fixtures or this public decision.
