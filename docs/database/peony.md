# Peony API and local verification

Implements [issue #49](https://github.com/C0derTang/shared-garden/issues/49) under
[decision 0026](../decisions/0026-peony-milestones.md) and the
[final launch rules](../decisions/0004-finalized-launch-rules.md). Requires the
existing [identity boundary](../auth/identity-setup.md), an unlocked planted Peony,
and the [rollover operation contract](rollover.md).

## Callable functions

All five RPCs return the same authoritative JSON state described below. None
accepts a client actor, operation timestamp, garden day, or growth amount.

| Signature | Operation |
| --- | --- |
| `current_peony_state(p_flower_id uuid)` | Settle elapsed days and read the complete current state and milestone history |
| `submit_peony_contribution(p_flower_id uuid, p_milestone integer, p_payload jsonb)` | Submit the caller's original idea (1), happened confirmation (3), or favorite (4) |
| `edit_peony_contribution(p_contribution_id bigint, p_payload jsonb)` | Replace the caller's unfinished idea or favorite inside its original edit window |
| `set_peony_plan(p_flower_id uuid, p_expected_version bigint, p_activity text, p_starts_at text)` | Create version 1 with expected version 0, or negotiate the current unfinished plan with its exact version |
| `accept_peony_plan(p_flower_id uuid, p_plan_version bigint)` | Explicitly accept the current version; two current acceptances immediately complete milestone 2 |

Milestones 1 and 4 take exactly `{"text":"..."}`. Trimmed text must contain
1–4,000 Unicode characters; the serialized JSON may not exceed 20,000 bytes.
Milestone 3 takes exactly `{}`. Milestone 2 uses only the plan RPCs. Unknown keys,
wrong types, skipped/completed milestones, and duplicate originals are rejected.
Only the first original from each member per milestone counts, across all days.

Plan activity is trimmed, 1–2,000 Unicode characters and at most 8,000 bytes.
`p_starts_at` must use `YYYY-MM-DDTHH:MM:SS[.ffffff]Z` or an explicit `±HH:MM`
offset, such as `2030-09-18T19:00:00-07:00`. It is the planned event time, never a
contribution timestamp. The stored `starts_at` is an absolute instant. Display
it with `Intl.DateTimeFormat` using `timeZone: "America/Los_Angeles"`, including
the local date, time, and `timeZoneName: "short"`. Resolve repeated/nonexistent
local input hours before submitting; do not let a database session select an
offset. Remote and in-person activities and retrospective plans are accepted.

The expected version protects both negotiation writes and acceptance. A material
activity/time edit creates the next version and removes all previous acceptance.
An equal trimmed activity and equal instant is a no-op, preserving acceptance
and original metadata. A changed offset alone is a no-op only when it represents
the same instant. Both people must explicitly accept the same current version;
the plan author is not automatically an acceptor. Once both accept, the shared
agreement is fixed permanently. The thirty-minute personal edit window does not
restrict unfinished plan negotiation.

SQLSTATE `42501` is access denial. `22023` covers invalid payloads, stale plan
versions, duplicate originals/acceptances, skipped/completed milestones, and
expired personal edits. Malformed values rejected by PostgreSQL before entering
the RPC can instead produce its native argument conversion errors. Retry after
an ambiguous network response only after rereading authoritative state. The RPCs
are not arbitrary request-id APIs: duplicate submissions fail rather than alter
original evidence. A failed mutation rolls back catch-up settlement too; refetch
after rejection. Stronger-isolation serialization/deadlock errors require a new
transaction and reread, as with existing garden operations.

## Stable state and history shape

| Field | Value |
| --- | --- |
| `server_now`, `garden_day`, `day_starts_at`, `next_rollover_at` | One post-lock operation instant and its Pacific garden-day boundaries |
| `member_id` | Caller slot 1 or 2, without private account information |
| `flower` | Durable flower row, including stable spot, `growth_units`, and first-bloom facts |
| `stage` | Completed milestone count, 0–4, equal to `flower.growth_units` |
| `next_milestone` | Next required milestone, 1–4; JSON null after bloom |
| `contributions` | All personal rows ordered by milestone then member; empty array initially, at most six |
| `plan` | Current or final shared plan with version/acceptance/permissions; JSON null until created |
| `completed_milestones` | Existing `peony_activity` rows ordered 1–4; completion day/instant and both original times |

Each contribution exposes `id`, `flower_id`, `milestone`, `author_id`,
`garden_day`, `original_posted_at`, `updated_at`, and `payload`, plus
`edit_deadline`, `edit_deadline_inclusive`, and caller-specific `can_edit`.
The deadline is the earlier of original time plus thirty minutes or that
original day's next 4 a.m. Exact thirty minutes is inclusive; rollover is
exclusive, including when the two coincide. Completed milestones, prior-day
submissions, confirmations, and the other author's contributions always have
`can_edit: false`. These are display snapshots; each mutation rechecks after
the shared lock. Partner originals are immediately readable without submitting.

The plan has `flower_id`, `version`, `activity`, `starts_at`, `updated_by`,
`updated_at`, `display_timezone: "America/Los_Angeles"`, `can_edit`, `can_accept`,
and `acceptances`. Each acceptance contains `flower_id`, `plan_version`,
`author_id`, `garden_day`, and `original_posted_at`, ordered by member. Acceptance
is cleared on a material draft edit; completed acceptances and agreed content
remain forever. Prior discarded draft versions are not an audit history.
If `plan` is null and `next_milestone` is 2, either member can create it with
expected version 0. A present plan is editable only while milestone 2 is open;
`can_accept` additionally requires the caller has not already accepted it.

`completed_milestones` provides `flower_id`, `milestone`, `garden_day`,
`completed_at`, `member1_posted_at`, and `member2_posted_at`. Join by flower and
milestone to personal rows or milestone 2's fixed plan and acceptances. Four
completions in one day are four events and one qualifying streak day. Originals
may span days; activity credit belongs to the completion day. No daily growth
or decay applies to Peony; stage four blooms once through the existing seam.

Both current and bloomed Peonies use this same bounded read as their history.
`current_garden_state()` remains compatible and exposes the updated flower's
growth/bloom, while this separate RPC supplies Peony-specific details. Refresh
on open, foreground return, reconnect, rejected/successful mutations, and at
`next_rollover_at`. [Issue #31](https://github.com/C0derTang/shared-garden/issues/31)
adds the [Peony interface](../decisions/0015-peony-interface.md) and a separate
additive migration publishing the three Peony tables for authorized INSERT/UPDATE
invalidation. DELETE stays unpublished; plan UPDATE covers acceptance clearing.

## Tables, access, and verification

`peony_contributions`, `peony_plans`, and `peony_acceptances` are member-readable
under the existing live-membership RLS policy. Direct SELECT does not settle
elapsed days or provide current edit permission. Use the guarded read for that.
Browser and service roles cannot directly mutate these tables, use the identity
sequence, or execute private validation/progress/state helpers. Public functions
have a fixed safe search path and recheck live membership after the garden lock.

Use a fresh dedicated local Supabase project, without a hosted link. Copy the
repository `supabase/config.toml`, `supabase/migrations`, and `supabase/tests`
to `/tmp/shared-garden-issue49/supabase`. Change only the copy's project ID to
`shared-garden-peony49`, and API/database/shadow ports to `57421`, `57422`, and
`57420`. Keep Auth enabled and startup/status output private (it contains local
development keys). Use the repository-pinned CLI installed by `npm ci`.

```sh
node_modules/.bin/supabase start --workdir /tmp/shared-garden-issue49
node_modules/.bin/supabase db reset --local --workdir /tmp/shared-garden-issue49
node_modules/.bin/supabase test db --workdir /tmp/shared-garden-issue49
python3 supabase/tests/concurrency/planting_race.py supabase_db_shared-garden-peony49
python3 supabase/tests/concurrency/entries_race.py supabase_db_shared-garden-peony49
python3 supabase/tests/concurrency/rollover_race.py supabase_db_shared-garden-peony49
python3 supabase/tests/concurrency/peony_race.py supabase_db_shared-garden-peony49
docker exec -i supabase_db_shared-garden-peony49 \
  psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  < docs/auth/verify-identity-auth-role.sql
node_modules/.bin/supabase db reset --local --workdir /tmp/shared-garden-issue49
node_modules/.bin/supabase test db --workdir /tmp/shared-garden-issue49
npm test
npm run lint
npm run typecheck
npm run build
node scripts/sync-daisy-bank.mjs --check
```

The Peony race harness observes real lock waits with independent sessions for
paired originals and favorites, duplicate submissions, both plan-edit/acceptance
orderings, paired current-version acceptance, live revocation, actual personal
edit expiry, and a rollover while queued. Only its disposable database temporarily
shifts the operation's ticking clock to near the upcoming boundary; it asserts
the lock holder began before rollover and restores the exact production function
in `finally`. All committed fixtures are synthetic and removed child-first.
It rejects configured membership/Auth/domain data and nonlocal container names.
Reset afterward even when interrupted, and confirm empty tables. The pgTAP
clock replacement and fixtures are confined to a rolled-back transaction.

These checks do not claim browser Peony rendering, Realtime delivery, real Google
sign-in, hosted changes, or actual achievement awards. The additive migration
does not rewrite existing functions or records; old frontend calls remain valid.


## Interface and live-update verification

For #31 use `/tmp/shared-garden-issue31`, project ID
`shared-garden-peony-ui31`, API/database/shadow ports 57921/57922/57920, and
loopback app/helper ports 57929/57930. Capture local status outside the repository
with mode 600. Run all checks above against that container/project, then with
empty fixture tables run:

```sh
node scripts/verify-peony-realtime.mjs /tmp/shared-garden-issue31/status.json
```

The committed harness admits only that dedicated endpoint/container or explicit
`ci` mode, and refuses preconfigured membership/Auth/garden data. It verifies
actual partner idea/plan/acceptance invalidation, material edit clearing,
exact-version rejection, four same-day completions, anonymous/outsider denial,
live revocation and repeated reads without a notification loop. It removes its
synthetic fixtures child-first in `finally`. Reset afterward, rerun pgTAP, and
confirm membership/Auth/garden are empty. The database CI also runs this harness.

Phone verification uses two synthetic local sessions on separate loopback hosts,
never real Google sign-in or production accounts. Check visible partner ideas
before submitting, explicit PDT/PST fold choice, a plan edit after one acceptance,
both members reaccepting the new version, confirmations and favorite moments,
author edit original time retention, immediate bloom and read-only final history.
The temporary loopback cookie helper is outside application source and is never
shipped. Unit tests additionally cover preserved drafts on rejection/partner
revision, expired edits, DST gaps/folds, exact-version inputs and guarded actions.
