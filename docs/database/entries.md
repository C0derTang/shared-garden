# Daily entry API and verification

Contract for [decision 0009](../decisions/0009-daily-entries-and-questions.md) and
[issue #24](https://github.com/C0derTang/shared-garden/issues/24). Callers use the
existing [membership](../auth/identity-setup.md) and
[flower UUID](planting.md) boundaries.

## RPCs

| Function | Result and use |
| --- | --- |
| `submit_flower_entry(p_flower_id uuid, p_payload jsonb)` | New `flower_entries` row; repeat original submissions fail |
| `edit_flower_entry(p_entry_id bigint, p_payload jsonb)` | Author's replacement row; original identity/time/day retained |
| `current_entry_state(p_flower_id uuid)` | JSON current flower, server clock/day, rollover, Moonflower availability, today's entries, and Daisy question when applicable |
| `get_daily_daisy_question()` | Persistent `daisy_assignments` row for the server day; initializes the existing garden if needed |
| `entry_history(p_flower_id uuid default null, p_limit integer default 50, p_before_id bigint default null)` | Latest-first rows, 1–100 per call; pass the last returned ID as the next exclusive cursor |

Use the exact payload keys and limits in decision 0009. For example, a Rose RPC
body is `{ "p_flower_id": "<FLOWER_UUID>", "p_payload": { "text": "<NOTE>" } }`.
Daisy additionally supplies `question_id` from the server's assigned question;
Cactus supplies `{}`. Actor, timestamps, garden day, and progress are never client
fields. SQLSTATE `42501` denotes denied access; `22023` denotes rejected input,
expired edits, duplicate originals, unavailable workflows, or closed care windows.
No original retry silently updates an existing row. After an ambiguous network
response, reread state before offering the explicit edit action.

`current_entry_state` has `server_now`, `garden_day`, `day_starts_at`,
`next_rollover_at`, `moonflower_open`, `flower`, `daisy_question`, and `entries`.
Each current entry adds `edit_deadline`, `edit_deadline_inclusive`, and `can_edit`
for the actual requesting member. A deadline limited by 4 a.m. is exclusive,
including when it coincides with 30 minutes. These flags are a UI snapshot; the
mutation rechecks live time after acquiring the garden lock. Never trust an old
flag or browser clock as permission. A new day returns no previous-day entries in
this current array; those remain available in history.

## Readable tables and evaluator facts

- `flower_entries`: `id`, `flower_id`, `author_id`, `garden_day`,
  `original_posted_at`, `updated_at`, `payload`, `daisy_assignment_day`.
- `daisy_assignments`: `garden_day`, `ordinal`, `question_id`, `category`, `prompt`,
  `assigned_at`. Join `daisy_assignment_day` for exact historical question text.
- `hydrangea_moods`: `mood_key`, `label`, `color_name`, `color_hex`.

Both actual members can immediately SELECT every entry and assignment. Anonymous,
unapproved, and revoked users cannot. All client writes use the guarded RPCs.
There are no real identities, example entries, or garden activity in migrations;
the question bank and six moods are approved static catalog content.

A later trusted rollover evaluator must acquire the same garden row lock before
reading final entry facts or changing growth. Group entries by flower/day; the
unique author/flower/day constraint gives at most one fact per member. Compare
`original_posted_at` for ten-minute credit, and final `payload.mood` for mood
matches. Entries never credit growth or achievements themselves and must not be
counted again after a day has been settled. The later evaluator owns settlement
idempotency. Cactus pairs remain activity after bloom; Peony is a separate path.

## Dedicated local verification

Install the repository's pinned CLI using `npm ci`. Copy `supabase/config.toml`,
`supabase/migrations`, and `supabase/tests` to a disposable project, e.g.
`/tmp/shared-garden-issue24/supabase`. In the copy only, set project ID
`shared-garden-entries` and API/database/shadow ports `56721`, `56722`, `56720`.
Keep Auth enabled. Do not link this project or copy private credentials/identities.

```sh
node scripts/sync-daisy-bank.mjs --check
node --test content/daisy-questions.test.mjs
node_modules/.bin/supabase start --workdir /tmp/shared-garden-issue24
node_modules/.bin/supabase db reset --local --workdir /tmp/shared-garden-issue24
node_modules/.bin/supabase test db --workdir /tmp/shared-garden-issue24
python3 supabase/tests/concurrency/entries_race.py supabase_db_shared-garden-entries
python3 supabase/tests/concurrency/planting_race.py supabase_db_shared-garden-entries
docker exec -i supabase_db_shared-garden-entries \
  psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  < docs/auth/verify-identity-auth-role.sql
node_modules/.bin/supabase db reset --local --workdir /tmp/shared-garden-issue24
node_modules/.bin/supabase test db --workdir /tmp/shared-garden-issue24
```

The suite exercises every supported payload, partner visibility, author-only
edits, exact elapsed-time and Pacific DST/rollover boundaries, Moonflower edges,
bloomed Cactus, ordinary blooms, malformed/unsafe/oversized content, assignment
exhaustion and cycle, history paging, actual browser roles, and revocation. The
entry test saves the original RPC definitions in a temporary table and replaces
only `clock_timestamp()` expressions within its rollback-only transaction. No
test clock, helper, or setting exists in production migrations. Existing clock,
identity, and planting suites run unchanged.

The standard-library Python entry harness uses separate authenticated sessions
and a third observer to confirm real overlapping lock waits. It checks duplicate
originals, an overlapping author edit and partner original, shared Daisy reads,
and an edit that expires while waiting for the lock using the real server clock.
It refuses configured garden/Auth state, commits only synthetic fixtures, cleans
them in `finally`, and is restricted to local `supabase_db_*` containers. Run it
sequentially with the existing planting and Auth-role harnesses; reset afterward
even if interrupted. The Auth harness verifies the real `supabase_auth_admin`
role and rolls back. No hosted change, live Google sign-in, UI, media validation,
Realtime subscription, player, or rollover behavior is claimed by these checks.

The generator is for this initial migration's authored bank import. Once a
migration has been applied to a persistent environment, update catalog content
through a new reviewed migration and retain historical assignment snapshots;
never rewrite applied migration history.
