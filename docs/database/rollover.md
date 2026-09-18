# Rollover API and verification

Implements [issue #25](https://github.com/C0derTang/shared-garden/issues/25) under
[decision 0010](../decisions/0010-garden-rollover.md). Existing
[planting](planting.md) and [entries](entries.md) signatures remain compatible.
All calls require actual membership through the identity boundary, not just an
`authenticated` JWT role.

## Read operation

`public.current_garden_state()` takes no arguments and returns JSON:

| Field | Meaning |
| --- | --- |
| `server_now` | One trusted instant captured after the garden lock |
| `garden_day`, `day_starts_at`, `next_rollover_at` | Pacific 4 a.m. calendar boundaries |
| `moonflower_open` | Whether this instant is within 10 p.m.–4 a.m. |
| `member_id` | Safe caller slot 1 or 2 |
| `garden` | Existing ID, initialization/spot fields plus `last_settled_day`, `current_streak`, `longest_streak`, `qualifying_days` |
| `catalog` | All thirteen approved catalog rows |
| `unlocks` | Permanent type unlock rows with original earning timestamps |
| `plants` | Every retained flower, ordered by permanent spot, using the state shape below |

Each plant state contains `flower`, `entries`, `daisy_question`,
`member1_submitted`, `member2_submitted`, and the same clock fields as the root.
`flower` is the existing durable row including growth and first-bloom facts.
`entries` contains both current-day originals immediately, with
`edit_deadline`, `edit_deadline_inclusive`, and caller-specific `can_edit`.
Exactly thirty minutes is allowed, except that 4 a.m. rollover is exclusive.
Markers mean an original exists today, not that an achievement or stage has
already been awarded. Ordinary blooms have no new care requirement; Cactus can
continue submitting after bloom.

A live Daisy includes/requests its current shared assignment. No live Daisy means
a garden read consumes no question. `current_entry_state(uuid)` uses the same
plant shape and also skips question assignment for an already-bloomed Daisy.
The explicit `get_daily_daisy_question()` remains an assignment request.

Call this state operation when opening the garden, returning to the foreground,
reconnecting, after successful or rejected mutations, and at `next_rollover_at`.
Base the visual countdown on `server_now` and elapsed local time. A suspended
browser may miss a timer; foreground refresh settles all elapsed days. Later
Realtime messages should trigger a refetch, not client-derived growth. This
slice configures neither Realtime nor scheduling.

## Transaction integration

`initialize_garden()`, both planting RPCs, both entry mutations,
`current_entry_state(uuid)`, `get_daily_daisy_question()` and `entry_history(...)`
all acquire the common garden lock and settle overdue days before reading their
eligibility/capacity state. Exactly one operation time flows through their
private helpers. READ COMMITTED waiters see the prior committed settlement.
Serialization/deadlock failures at stronger isolation require a fresh read and
retry; no mutation is successful merely because a client timed out.

A rejected mutation rolls back *all* its writes, including catch-up. For example,
a Rose that earned bloom yesterday rejects today's stale submission, then a
successful authoritative read persists that bloom. This transactional behavior
cannot allow stale care or extra planting capacity. Clients refresh after errors
and never assume settlement persisted from a failed request.

Direct SELECT on tables is protected but only exposes already stored state.
Use the authoritative RPC to make time-derived state current. No RPC accepts a
client actor, clock, garden day, growth amount or arbitrary activity fact.

## Durable evidence for later achievement evaluation

- `garden_days`: unique completed date, independently converted `starts_at` and
  `ends_at`, actual `settled_at`, qualifying activity, completed-day streak,
  `before_noon_eligible_count` and `before_noon_complete`.
- `flower_day_facts`: unique `(flower_id, garden_day)`, type, stage before/after,
  paired/qualifying/first-bloom flags, both original timestamps, final Hydrangea
  mood keys and stable paired Daisy question ID. `growth_after < growth_before`
  is actual stage loss. First-bloom permanence and total/type counts also remain
  on `flowers`; do not count Cactus pairs as further blooms.
- `before_noon_snapshots`: unique `(garden_day, flower_id)`, retained original
  timestamps and completion. Current-day membership is materialized on refresh;
  timing/completion is finalized only when that day settles. The day's summary
  rejects an empty snapshot. Comparison uses that date's absolute Pacific noon,
  so after-midnight entries do not qualify by having an early clock-of-day.
- `peony_activity`: unique `(flower_id, milestone)`, completion garden day and
  instant, and both same-milestone originals. Count activity by completion day;
  future timing achievements additionally check whether both originals belong
  to the same garden day and are at most ten elapsed minutes apart.

Every table is member-readable under RLS and has no client mutation grant.
Original timestamps and final mood choices survive later display/edit changes.
No achievement awards are emitted in this issue.

The trusted future Peony workflow obtains `v_now` by calling
`private.begin_garden_operation()`, proves the next milestone, then calls
`private.record_peony_activity(flower_id, milestone::smallint,
member1_original, member2_original, v_now)` before recording any final bloom.
Identical milestone/timestamp retries preserve the original event; a different
pair cannot rewrite it. This seam records no progress or negotiation data.
For earned first bloom, call
`private.record_first_bloom_at(flower_id, qualifying_day, v_now)` so all facts
share the operation instant. The older two-argument trusted completion seam is
retained for compatibility, with its own post-lock clock; new domain workflows
use the explicit internal operation instant. Neither helper is browser-callable.

## Local verification

Use a fresh dedicated local Supabase project with Auth enabled and no hosted
link. Configure unused API/database/shadow ports. Run the repository-pinned CLI;
keep `start` and `status` output private because it includes local development
keys. The committed migrations create no membership, garden or activity fixture.

```sh
npm run db:reset
npm run db:test
python3 supabase/tests/concurrency/planting_race.py supabase_db_shared-garden-clock
python3 supabase/tests/concurrency/entries_race.py supabase_db_shared-garden-clock
python3 supabase/tests/concurrency/rollover_race.py supabase_db_shared-garden-clock
docker exec -i supabase_db_shared-garden-clock \
  psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  < docs/auth/verify-identity-auth-role.sql
npm run db:reset
npm run db:test
```

Substitute only your dedicated local container name; the race harnesses reject
nonlocal names and preexisting domain/member/Auth data. They use separate real
sessions and verify an observed lock wait before accepting results. Their
synthetic `example.test` fixtures are removed child-first, and the final reset
also restores identity sequences. Never point these checks at a hosted database.

The pgTAP suite covers chronological growth/loss, floors/targets, permanent
blooms/unlocks, post-bloom Cactus, Peony-only activity, streak history, exact
noon/edit/rollover boundaries, DST, catch-up snapshots, final mood/original
pairing evidence, distinct questions, stale APIs, member RLS and grants.
Test-only function replacement freezes the private operation clock inside a
rolled-back test transaction; no production override is shipped. The older
entry suite intentionally travels backwards through unrelated boundary cases,
so it resets only derived settlement fixtures when changing its test clock.

The new race harness checks duplicate settlement, a stale queued entry after a
bloom, concurrent planting after a bloom releases capacity, use of a newly earned
unlock, and revocation while an authoritative read waits. Existing entry and
selected-spot race cases remain enabled. These checks do not simulate live
Google OAuth or a hosted deployment, media, Peony negotiation, browser rendering,
Realtime delivery, or actual achievement awarding.
