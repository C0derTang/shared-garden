# Garden rollover, durable activity, and authoritative reads

Status: implementation choices under the conservative discretion in
[decision 0004](0004-finalized-launch-rules.md).
Issue: [#25](https://github.com/C0derTang/shared-garden/issues/25).
Dependencies: merged clock #9, identity #18, planting #21, entries #24 and selected
spots #41. Identity, entries, and placement retain decisions
[0006](0006-fixed-identity-boundary.md),
[0009](0009-daily-entries-and-questions.md), and
[0023](0023-selected-planting-spots.md).

## One transaction and operation instant

Every existing public domain RPC now starts with the same private operation
boundary. It checks membership, initializes/locks garden row 1, rechecks live
membership after any wait, then captures one `clock_timestamp()` value. That
instant drives initialization, chronological settlement, allocation/submission,
edit eligibility, question assignment and assembled reads. No public API accepts
an actor, historical day, timestamp, progress, or settlement override. The
existing selected and automatic allocation signatures remain compatible.

`garden.last_settled_day` starts one day before the garden's initialization day.
Each operation settles every later completed garden day, in date order, and
leaves the current day unsettled. Boundaries independently convert 4 a.m. local
calendar times through `America/Los_Angeles`, including 23- and 25-hour days.
All events, blooms, unlocks, snapshots, streak updates, and the cursor commit
atomically under the same lock. Repeated/overlapping operations cannot duplicate
credit. A failed mutation rolls back its settlement too; clients refresh the
authoritative state after rejection so the next successful read commits it.
There is no hosted scheduler, reminder or paid service.

## Growth and permanent evidence

Each unbloomed ordinary instance participates from its planting garden day,
including a planting immediately before rollover. Both member rows for that
instance/day produce +1; an incomplete pair produces -1 floored at zero. Each
completed-day `flower_day_facts` row preserves before/after stage, original member
timestamps, paired/qualifying flags and first-bloom flag. An actual decrease is
`growth_after < growth_before`; zero-to-zero is not Recovery evidence. Blooms
reach the catalog target once, retain their spot/history, release unfinished
capacity and invoke the existing trusted first-bloom/unlock seam. Later missed
days never change ordinary blooms. Total/type bloom counts come from permanent
flower first-bloom facts; the existing thresholds 1–9 never relock.

Cactus participates after its first bloom, preserving original paired timestamps
and qualifying activity without more growth or bloom credit. It never decays.
Peony is excluded from generic growth, decay, and daily flower facts.

Final Hydrangea mood keys for both members are copied into daily evidence at
settlement. Matching achievements can count distinct days across instances.
Paired Daisy evidence copies the stable shared question ID; repeated cycles
retain the same identity for future distinct-question counting. Catch-up never
assigns questions to missed days. This feature records evidence and no actual
achievement award.

## Before-noon snapshots and streak

`before_noon_snapshots` records exactly the eligible instances at each local
4 a.m. start: planted on an earlier garden day, not already bloomed before that
day, excluding Moonflower and Peony. Unbloomed Cactus is included; bloomed Cactus
is excluded. A plant created exactly at 4 a.m. joins the following day's snapshot.
The initialization day therefore has an empty snapshot.

Snapshots are reconstructible from immutable planting and qualifying bloom days;
late `first_bloom_at` settlement timestamps are never used for eligibility.
Settlement completes day D before constructing D+1, so an intermediate catch-up
bloom correctly disappears from subsequent snapshots. The current snapshot is
also materialized before any new planting. Completion is finalized at settlement
and requires a nonempty snapshot and both original timestamps strictly before
that date's local noon for every member. Entries after midnight fail that day's
noon cutoff; edits after noon preserve their original timing.

`garden_days` stores each completed day's actual bounds, settlement instant,
qualifying-activity flag, resulting streak and noon result. Any ordinary paired
growth, paired Cactus check-in including after bloom, or Peony milestone completion
qualifies once for the day. Empty/incomplete days reset the current streak; the
longest streak and total qualifying days persist. Current-day activity does not
increment the completed-day streak early.

## Guarded Peony extension

`private.record_peony_activity(uuid, smallint, timestamptz, timestamptz,
timestamptz)` is a trusted, ungranted seam for issue #31. Its future workflow must
start with `private.begin_garden_operation()`, prove the actual ordered milestone
completion, and pass both original same-milestone member timestamps and that
operation's instant. Record activity before recording the fourth milestone's
first bloom. The seam checks the Peony instance, order 1–4, current settled cursor,
non-null originals between planting and completion, and immutable retry identity.
It records no growth, negotiation, personal payloads, or achievement award.

The milestone's qualifying day is its completion day, even when its contributions
span days. Both originals remain available so the later timing evaluator can
require the originals to share a garden day as well as be within ten minutes.
Multiple ordered milestones can complete on one day; the streak counts that day
once. Browser, service API and platform Auth roles cannot call this seam.

## Authoritative refresh contract

`public.current_garden_state()` returns one trusted clock/day/next rollover and
Moonflower availability, caller's safe member ID, the garden/streak/spot fields,
catalog, permanent unlocks and all persistent plant states. Every plant state
contains both current-day markers, immediately visible entries and author-only
edit eligibility/deadlines from the same instant. A live Daisy requests today's
shared question; a bloomed Daisy does not consume an assignment. The explicit
question RPC retains its existing first-request behavior.

Existing `current_entry_state`, `entry_history`, question, initialization, planting
and entry-mutation RPCs all settle first. Direct table reads expose stored state
and do not trigger settlement. The working garden (#27) must use the authoritative
read on entry, foreground/reconnect, after actions/errors, and at the supplied
next-rollover instant. Use the server time to calibrate the countdown and refetch
when its deadline arrives. Browser suspension can delay timers; foreground
refresh catches up. Future Realtime notifications invalidate/refetch this model;
they are not a substitute for its rollover timer or a reason to derive growth
from a browser clock.

All new tables have member-only SELECT grants and RLS; writes stay behind guarded
transactions. All routines fix their search path. No private account or final-event
configuration is returned. The [database guide](../database/rollover.md) records
exact interfaces and local verification. No hosted changes or live OAuth exchange
are part of this issue.
