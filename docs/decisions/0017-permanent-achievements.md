# Permanent ordinary achievements

Status: implementation choices under the conservative discretion in
[decision 0004](0004-finalized-launch-rules.md), for
[issue #33](https://github.com/C0derTang/shared-garden/issues/33).

The exact 26 ordinary requirements and thresholds in decision 0004 remain
unchanged. The fixed catalog assigns stable descriptive identifiers and order.
It contains no final-event configuration, participant identities, or private copy.

## Authority and permanence

A private evaluator runs under the existing singleton garden lock using the
operation's single post-lock instant. It reads durable flowers, completed-day
facts, original entry pairs, Peony activity and Dandelion fulfillment. It runs
after catch-up and after planting, entry insertion, completed Peony milestones
(including stage four's bloom), and fulfillment. It never trusts a client count,
time, event name, or award request. Failed operations roll back their evaluation.

Progress is capped at each requirement's threshold. Streak progress uses the
retained longest completed-day run; the screen separately shows the current
shared streak. Recovery requires loss followed by the same instance's credited
bloom day. Mood matches use final settled days; Daisy uses distinct immutable
question IDs from paired entries or historical facts. Timing includes exactly
ten minutes, and Peony originals must belong to the same garden day and milestone.
Before-noon completion uses the nonempty settled snapshot and its absolute
Pacific noon; it is confirmed at rollover, not from editable or live counts.

Awards are insert-once records. `earned_at` means the first authoritative
**discovery** of satisfaction, using the operation's server time. For a late
visit, this can be later than the activity's credited garden day. It is never
rewritten on refresh, later decay, repeated calls or concurrent member activity.
No historical time is invented from a late settlement. No removal API is added.

## Read and refresh contracts

`public.current_achievements()` takes no inputs, requires live membership,
settles/evaluates, and returns safe catalog, bounded progress, earned times,
current streak and server time. RLS also protects all three public achievement
tables; members have no direct write privilege. No shared private cache is used.
The private `all_ordinary_achievements_complete()` predicate requires membership
and checks all 26 fixed catalog awards. Future gated interaction code must call
it after beginning its garden operation. It does not read final configuration.

Only safe progress and award tables join the existing INSERT/UPDATE Realtime
publication. Unchanged progress is not updated and duplicate awards do not write,
so a read-triggered refresh cannot create an invalidation loop. The screen
coalesces requests, refreshes after reconnect/focus, and checks once per minute
while visible to notice rollover even when no partner mutation occurs.

## Phone presentation

The existing guarded navigation opens a complete collection of 26 cards. Every
card shows its plain requirement, numeric progress, labeled progress bar, and
explicit Growing or Earned state. Earned dates use Pacific time. The summary is
always out of 26. Long-term requirements explain that there is no deadline;
locked flower types remain represented honestly. Earned cards use a brief fade
only when reduced motion is not requested. No sound, reminders, external
notifications, changes to growth, or final interaction are added.

All synthetic fixtures live in rolled-back tests or disposable local tooling.
There is no production seeding or force-award endpoint.
