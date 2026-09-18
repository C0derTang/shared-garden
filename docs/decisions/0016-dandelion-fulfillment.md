# Dandelion wish fulfillment

Status: conservative implementation choices under [0004](0004-finalized-launch-rules.md), for [issue #32](https://github.com/C0derTang/shared-garden/issues/32).

Each existing Dandelion retains its one named wish, original spot, bloom and daily
history. Either actual member can fulfill it after authoritative bloom. The
flower sheet asks for explicit confirmation and explains that the action is
permanent. The resulting text identifies who fulfilled it and when in Pacific
time. Fulfilled wishes remain selectable and their entries remain readable.

The existing original sprite's static scattered seeds are the gentle, motion-free
presentation for everyone, including reduced-motion users. No timed animation,
new plants, undo, reminders or extra growth/bloom credit is introduced.

Nullable `flowers.fulfilled_at` and `fulfilled_by` jointly form the permanent
fact, keyed by the existing unique flower ID. A constraint requires both values,
a member slot, an actual Dandelion bloom and a finite timestamp no earlier than
that bloom. Existing live-member RLS, denied direct writes, and the flowers
Realtime publication apply. No new publication or subscription is needed.

`fulfill_dandelion(uuid)` authenticates through the existing garden-operation
lock and uses its post-lock time. It settles overdue ordinary days as other garden
operations do; fulfillment itself never awards growth, bloom, streak or activity.
The first call records the fact; all later calls return its original flower ID,
actor and timestamp. No duplicate event can exist for an instance. Unknown,
unbloomed, wrong-type and unauthorized requests fail closed, including retries.

The current garden/entry snapshots expose the columns in their existing flower
objects. Future Memories and achievement consumers (#33/#34) can read the stable
fact without interpreting UI state or counting decorative seeds. Those features
and award evaluation remain separate. The normal mutation coordinator provides
shared synchronous locks, boundary guards, refresh after accepted/rejected writes,
and existing partner Realtime invalidation.
