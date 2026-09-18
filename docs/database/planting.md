# Garden planting API and local verification

This is the contract for [decision 0007](../decisions/0007-garden-catalog-and-planting.md)
and [Issue #21](https://github.com/C0derTang/shared-garden/issues/21).
Callers must first pass the [identity boundary](../auth/identity-setup.md).

## Application reads and RPCs

| Object | Safe member-visible state |
| --- | --- |
| `flower_catalog` | `type_key`, `display_name`, `action_label`, `growth_target`, `unfinished_limit`, `unlock_after_blooms` |
| `garden` | Singleton `id`, `initialized_at`, `next_spot` |
| `flowers` | UUID `id`, `garden_id`, `type_key`, stable `spot`, `planted_at`, `planted_day`, `planted_by`, `is_initial`, `shared_wish`, `growth_units`, `first_bloom_at`, `first_bloom_day` |
| `flower_unlocks` | Permanently earned `type_key`, original `unlocked_at` |

`public.initialize_garden()` takes no arguments and returns the singleton garden
row. Call after resolving current membership and before reading garden state.
The first valid call creates only the initial Cactus; subsequent calls preserve
existing state. A valid planting call also initializes atomically if necessary.

`public.plant_flower(p_type_key text, p_shared_wish text default null)` returns the
new flower row. For example, a browser RPC supplies `{ "p_type_key": "rose" }`.
A Dandelion additionally needs a shared wish, once its type is unlocked. No
caller-supplied actor, day, timestamp, spot, or stage fields are accepted. The
RPC is a new planting operation on each successful call; it is not a
client-idempotency-key API. Prevent duplicate clicks in the future UI and reread
state after an ambiguous network result before offering a retry.

The database uses `22023` for validation/capacity/lock errors and `42501` for
access denial. Unlocked Cactus remains displayed and waterable in later features,
but its planting operation always fails. Count unfinished capacity with
`first_bloom_at is null`, never by deleting finished flowers. Read durable unlock
rows to display availability and catalog thresholds to explain future unlocks.
No entry, watering, settlement, media, or achievement RPC exists in this slice.

For a future trusted evaluator, lock `public.garden` row `1` before mutation and
call `private.record_first_bloom(flower_id, qualifying_day)` only after proving
completion. Its trusted argument is a date, so rollover can credit the ended day.
It records the server settlement timestamp, clamps completed growth to the type's
target, and preserves any previously recorded completion. Browser roles cannot
invoke this seam. No service-role shortcut should be introduced for it.

## Isolated local checks

Use a dedicated disposable local Supabase project. Copy `supabase/config.toml`,
`supabase/migrations`, and `supabase/tests` to a temporary project directory.
Give the copy a distinct project ID such as `shared-garden-planting` and distinct
API/database/shadow ports (this build used `56521`, `56522`, `56520`). Keep the
repository configuration unchanged. Do not link the temporary project to a
hosted project, copy private production identities, or publish local key output.

With the repository's pinned Supabase CLI installed by `npm ci`, run:

```sh
node_modules/.bin/supabase start --workdir /tmp/shared-garden-issue21
node_modules/.bin/supabase db reset --local --workdir /tmp/shared-garden-issue21
node_modules/.bin/supabase test db --workdir /tmp/shared-garden-issue21
python3 supabase/tests/concurrency/planting_race.py supabase_db_shared-garden-planting
docker exec -i supabase_db_shared-garden-planting \
  psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  < docs/auth/verify-identity-auth-role.sql
node_modules/.bin/supabase db reset --local --workdir /tmp/shared-garden-issue21
node_modules/.bin/supabase test db --workdir /tmp/shared-garden-issue21
```

The database suite rolls back its fixtures. The Python standard-library harness
requires Docker, refuses existing members/Auth users/garden activity, commits
only synthetic `example.test` fixtures, and uses two separate authenticated SQL
sessions. A third observer confirms a real lock wait before asserting:

- Concurrent first initialization yields one garden and one Cactus at spot 1.
- Competing for the last Rose slot admits one request and rejects the other,
  leaving three Roses and no consumed failed spot.
- Concurrent plantings of different types receive distinct increasing spots.

The harness cleans its fixtures in `finally` and checks cleanup, but an interrupted
process can still leave disposable local state. Always reset afterward. It only
accepts a local `supabase_db_*` container name and never opens a hosted connection.
The separate existing Auth harness switches to the actual `supabase_auth_admin`
role, checks signup lifecycle/binding and spoofing/revocation, then rolls back.
Run these harnesses sequentially because both use the empty local membership
configuration. Application frontend tests are unrelated to this database-only
change; real Google account sign-in and hosted setup remain separate checks.
