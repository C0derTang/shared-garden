# Peony milestone interface

Status: conservative choices under [decision 0004](0004-finalized-launch-rules.md)
for [issue #31](https://github.com/C0derTang/shared-garden/issues/31), using the
merged [backend decision 0026](0026-peony-milestones.md) and
[garden boundary 0011](0011-working-garden.md).

The existing flower sheet displays four numbered milestone cards in order.
The current step is explicit; later steps stay compact, and completed cards
retain both contributions, original times, the final agreed plan, and completion
day/time as read-only history. Peony uses milestone progress rather than ordinary
daily care markers. Each personal contribution is readable before its partner
submits. Confirmation is a single explicit “Our date happened” action. Both
remote and in-person activities use the same free-text shared plan.

Ideas/favorites use the backend's 1–4,000 Unicode-character and 20,000-byte JSON
bounds. Edit availability also applies the backend's original deadline and exact
inclusive/exclusive rule against the calibrated garden clock. No client growth,
actor, contribution day, or operation time is sent. Completed history needs no
pagination because the backend bounds it to four milestones and six personal rows.

Plan editing keeps the observed version with the draft. Material partner changes
preserve that draft but disable its save until the author explicitly reviews the
new current plan. Acceptance labels include the exact displayed version, and
editing never accepts a plan implicitly. The server rejects concurrent stale
versions. A changed plan explains that earlier acceptances were cleared.

The scheduling control takes Pacific wall time and round-trips candidate offsets
through `America/Los_Angeles`. Nonexistent spring hours and invalid dates are
unsavable. A repeated autumn hour requires selecting its labeled PDT or PST
occurrence. Displayed agreed time includes full date, seconds and the Pacific
zone. Unchanged time fields retain the original serialized instant, including all six fractional-second digits, even during activity-only edits. JavaScript Date is used only for display and validation; it does not reserialize existing plan instants. Plans may be
retrospective; the UI imposes no future-date or in-person restriction.

Drafts survive errors and authoritative refresh while the sheet remains open.
Expired/completed personal drafts stay copyable but unsavable. Pending controls
prevent duplicate clicks and editing a draft during its save; no offline work is
queued. Closing the sheet discards its draft, matching ordinary care. The shared
mutation coordinator retains its read-wait/day-boundary guards. Peony originals
may still pair across days, and unfinished plan negotiation has no personal
thirty-minute restriction; the next explicit action uses the current snapshot.

Every Peony action independently authorizes membership, invokes a guarded RPC,
and rereads after success or rejection. The panel refreshes on the shared
garden snapshot's operation timestamp, so open/foreground/reconnect/rollover and
Realtime all use the existing garden refresh owner. Older Peony reads cannot
replace newer state. Failed reads retain the last visible snapshot and disable
mutation until refreshed.

Realtime adds only the three member-readable Peony tables to the existing
INSERT/UPDATE publication. A plan UPDATE invalidates deleted acceptances;
DELETE remains unpublished. Events only invalidate snapshots; guarded reads
never write these published rows, avoiding feedback loops. The local integration
harness verifies delivery, outsider/anonymous denial, live revocation, and no
read loop with synthetic fixtures.

No invitations, external messages, production fixtures, new paid services,
achievement evaluator, or general Memories screen are introduced. Apply the
additive publication migration before the interface; rollback can disable the
interface without deleting earned history.
