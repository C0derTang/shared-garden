# Adaptive garden guide and personal settings

Status: conservative implementation choices under [decision 0004](0004-finalized-launch-rules.md), for [issue #35](https://github.com/C0derTang/shared-garden/issues/35). Dependencies #27, #33 and #34 are merged.

## Real care, without a second game state

The guide is a nonmodal card above the existing garden. It opens the normal
Cactus sheet, selected empty patch seed picker, or Rose sheet; it never submits,
plants, edits, or retries on the member’s behalf. All four initial species remain
accessible, including the one permanent, non-decaying Cactus. The ordinary
shared mutation coordinator retains its online, pending, day and refresh guards.
Partner contributions remain immediately readable.

The current garden snapshot adds two own-member, all-history facts derived from
retained entries under the existing garden lock: whether the caller has checked
in to Cactus and whether they have shared a Rose note. These are read-only facts,
not accepted inputs, client success flags, today-only flags or stored tutorial
claims. They survive garden-day rollover. A success receipt without a fresh
snapshot does not advance the guide; later authoritative facts can reconcile an
ambiguous request. Guide presentation cannot confer gameplay credit.

Either account slot may arrive first. The path depends on the actual garden,
not role or arrival metadata. When a growing Rose exists and the caller has not
yet shared a Rose note, the guide goes directly to the lowest-numbered growing
Rose spot, including a Rose planted by the partner, even before that caller’s
first Cactus check-in. After the Rose note it introduces Cactus if needed. In a
fresh Cactus-only garden it starts with Cactus, then opens the first empty patch
for a deliberate Rose seed choice and explicit planting. Both retained own
contribution facts satisfy the action portion. If only permanent
Roses exist, it explains their read-only care state and permits finishing without
an impossible repeat. Ordinary planting remains available independently. A cap,
unavailable target or progressed garden always permits an exit. No guide state
locks seeds, resets history or grants another flower.

Deliberate Close moves keyboard focus to Show garden guide; Show focuses the
reopened guide heading. A confirmed Skip or Finish moves focus to the Garden
heading. Pending saves keep the action focusable but unavailable to repeat,
and unsuccessful saves retain focus. Each handoff is consumed once and only
applies when focus still belongs to the action or its removed control; a later
focused draft or other control is left alone. Remote preference and garden
refreshes do not request focus.

Garden sheets remain keyed by permanent spot and keep their existing local draft
lifetime. The guide does not select or remount a different sheet when an unrelated
snapshot changes. Closing a flower sheet retains the existing deliberate discard
behavior. The guide has no focus trap. A shared sheet scope queues an automatically
pending private moment behind the open flower sheet, preserving its draft and
focus; closing or unmounting the active sheet releases the next requested sheet.
The server pending event is unchanged. Each visible Close remains available
during saves. Guide targets pause while the shared garden reports a pending save
or uncertain refresh, so a confirmed action with a lost refresh first needs a
current snapshot before another guide action is offered.

## Own presentation preferences

A private, RLS-enabled table holds only a fixed member key, guide presentation
(`open`, `skipped`, `finished`), gentle-motion choice, and revision. Defaults are an
open guide and allowed gentle motion. Reads return defaults without writing a
row or initializing the garden. Finish describes closing the introduction, not
proof that actions occurred. Skip and finish persist; Settings explicitly reopens
the guide. Close guide for now only hides it during this Garden visit, including
when a preference save is slow or unavailable, and offers a local reopen control.

Public authenticated RPCs derive the live caller and never accept another member
or gameplay fields. Direct table access is revoked and the table is absent from
Realtime publications. Each write accepts exactly one validated field, obtains
a per-member advisory lock and row lock, rechecks membership after waits, and
updates only that field. Different-field concurrent saves therefore preserve
one another; the last serialized save to the same field wins. Unchanged saves
do not increment the revision. Server Actions independently authorize, validate
input and return a safe field projection with generic error wording.

The client applies monotonically increasing revisions, serializes local saves,
and ignores reads started before a save. It rereads on focus, reconnect and a
visible-page 30-second interval; refresh and a second device recover missed
changes. No read produces a write or notification. Failed/ambiguous writes keep
the last confirmed preferences and offer refresh, never claim durable success,
and never queue an offline action. Reopen navigation waits for a confirmed save.

## Motion and separate Settings

Every authenticated destination retains its server membership guard. The shared
layout independently loads preferences and wraps all content, including its
single existing private-interaction mount. Generic settings do not consume or
expose private-event configuration or owner answers. Separate Settings contains
only reopening, personal motion, the fixed 4 a.m. Pacific explanation, and the
existing same-origin POST sign-out form. No audio, reminders, timezone selection,
account replacement, or external notification is added.

Authenticated document responses use `Referrer-Policy: same-origin`. In WebKit,
the previous `no-referrer` document policy made native sign-out forms send a
null Origin, which the existing exact-origin protection correctly rejected.
This correction covers Settings and the existing shared-header sign-out on
Garden, Songs, Memories and Achievements. External destinations still receive
no referrer. Missing, null and foreign Origin requests remain denied; the
sign-out endpoint and private media's `no-referrer` policy are unchanged.

A stored motion-off preference renders a global style with the authenticated
content on the server, before children can animate. It covers portaled sheets,
achievement fades, private celebrations and any animated decorations. If the
preference cannot load, motion stays off until a confirmed read. System reduced
motion independently disables animation and always wins. Static flowers and
fulfilled Dandelion seeds remain visible. The style belongs to the mounted
member scope and is removed on navigation out/sign-out; no account preference is
cached in localStorage or left on the document root.

Verification evidence and browser limitations are recorded with the issue/PR.
Only disposable local synthetic fixtures are used. No hosted setup, actual
private interaction, production content, or tutorial fixture is shipped.
