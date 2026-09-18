# Garden planting API and local verification

This is the current contract for
[decision 0023](../decisions/0023-selected-planting-spots.md) and
[Issue #41](https://github.com/C0derTang/shared-garden/issues/41), correcting the
allocation details of [decision 0007](../decisions/0007-garden-catalog-and-planting.md)
and [Issue #21](https://github.com/C0derTang/shared-garden/issues/21).
Callers must first pass the [identity boundary](../auth/identity-setup.md).

## Application reads and RPCs

| Object | Safe member-visible state |
| --- | --- |
| `flower_catalog` | `type_key`, `display_name`, `action_label`, `growth_target`, `unfinished_limit`, `unlock_after_blooms` |
| `garden` | Singleton `id`, `initialized_at`, lowest empty `next_spot`, inclusive visible `spot_capacity` |
| `flowers` | UUID `id`, `garden_id`, `type_key`, stable `spot`, `planted_at`, `planted_day`, `planted_by`, `is_initial`, `shared_wish`, `growth_units`, `first_bloom_at`, `first_bloom_day` |
| `flower_unlocks` | Permanently earned `type_key`, original `unlocked_at` |

`public.initialize_garden()` takes no arguments and returns the singleton garden
row. Call after resolving current membership and before reading garden state.
The first valid call creates only the initial Cactus at spot 1 and one bed with
`spot_capacity = 12`; subsequent calls preserve existing state. Either valid
planting operation also initializes atomically if necessary.

Render fixed spots numbered `1..spot_capacity`, omitting occupied identifiers
from seed selection. Every `flowers.spot` remains occupied even after bloom.
Each bed contains twelve spots; bed number is `1 + floor((spot - 1) / 12)` and
position within it is `1 + ((spot - 1) % 12)`. Natural visual arrangements can use
these stable identifiers without free placement. Capacity expands by twelve
only when all visible spots are occupied. A high visible choice does not hide or
skip lower gaps. `next_spot` is the lowest empty identifier, not capacity.

`public.plant_flower_at(p_type_key text, p_spot numeric,
p_shared_wish text default null)` returns the new flower row in the selected
empty spot. A browser RPC calls `plant_flower_at` with, for example,
`{ "p_type_key": "rose", "p_spot": 12 }`. `p_spot` must be a positive integer
within the current visible range. Null, fractional, nonfinite, huge, invisible,
or already occupied selections fail without consuming space. Numeric input
prevents fractional selections from being rounded implicitly to an integer.

`public.plant_flower(p_type_key text, p_shared_wish text default null)` returns the
new flower row in the lowest empty spot. Existing browser RPC callers can still
supply `{ "p_type_key": "rose" }`. This legacy signature accepts no spot field.
Both signatures require `p_shared_wish` for unlocked Dandelion (1–500 Unicode
characters after trimming); other types reject any non-null wish. Neither accepts
caller-supplied actor, day, timestamp, stage, or coordinate fields. Each RPC
is a new planting operation on each successful call; it is not a
client-idempotency-key API. Prevent duplicate clicks in the future UI and reread
state after an ambiguous network result before offering a retry.

The database uses `22023` for validation/capacity/type-lock errors and `42501` for
access denial. Invalid selection reports `Invalid planting spot`; an occupied
selection reports `Planting spot is occupied`. The same garden-row lock protects
initialization, both allocation APIs, and completion. A same-spot race admits one
plant and rejects the other; reread the garden and flowers to display authoritative
availability and let the user choose again. A stronger-isolation serialization
error also requires a reread/retry. Identity and planting time are checked after
the lock. Unlocked Cactus remains displayed and waterable in later features,
but its planting operation always fails. Count unfinished capacity with
`first_bloom_at is null`, never by deleting finished flowers. Read durable unlock
rows to display availability and catalog thresholds to explain future unlocks.
This allocation slice does not implement entry, watering, settlement, media, or
achievement RPCs.

For a future trusted evaluator, lock `public.garden` row `1` before mutation and
call `private.record_first_bloom(flower_id, qualifying_day)` only after proving
completion. Its trusted argument is a date, so rollover can credit the ended day.
It records the server settlement timestamp, clamps completed growth to the type's
target, and preserves any previously recorded completion. A bloom frees unfinished
type capacity, never its spot. Preserve every UUID, spot, and prior bloom/history
when implementing settlement #25. Browser roles cannot
invoke this seam. No service-role shortcut should be introduced for it.

## Isolated local checks

Use a dedicated disposable local Supabase project. Copy `supabase/config.toml`,
`supabase/migrations`, and `supabase/tests` to a temporary project directory.
Give the copy a distinct project ID such as `shared-garden-planting` and distinct
API/database/shadow ports (this correction used `56821`, `56822`, `56820`, with
project ID `shared-garden-selected-spot`). Keep the
repository configuration unchanged. Do not link the temporary project to a
hosted project, copy private production identities, or publish local key output.

With the repository's pinned Supabase CLI installed by `npm ci`, run:

```sh
node_modules/.bin/supabase start --workdir /tmp/shared-garden-issue41
node_modules/.bin/supabase db reset --local --workdir /tmp/shared-garden-issue41
node_modules/.bin/supabase test db --workdir /tmp/shared-garden-issue41
python3 supabase/tests/concurrency/planting_race.py supabase_db_shared-garden-selected-spot
docker exec -i supabase_db_shared-garden-selected-spot \
  psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  < docs/auth/verify-identity-auth-role.sql
node_modules/.bin/supabase db reset --local --workdir /tmp/shared-garden-issue41
node_modules/.bin/supabase test db --workdir /tmp/shared-garden-issue41
```

The database suite rolls back its fixtures. The Python standard-library harness
requires Docker, refuses existing members/Auth users/garden activity, commits
only synthetic `example.test` fixtures, and uses two separate authenticated SQL
sessions. A third observer confirms a real lock wait before asserting:

- Concurrent first initialization yields one garden and one Cactus at spot 1.
- Competing for the last Rose slot admits one request and rejects the other,
  leaving three Roses and no consumed failed spot.
- Concurrent plantings of different types receive distinct increasing spots.
- Two members selecting spot 12 produce exactly one plant; the second receives
  the occupied-spot error, and the unfilled first bed does not expand.
- Concurrent selections of different valid spots both succeed within type limits;
  the waiting planter's server timestamp follows lock acquisition.
- Revocation committed by the lock holder is enforced by queued initialization
  and selected-spot planting after they acquire the shared lock.

`selected_spot.test.sql` also covers high/low selections, automatic hole filling,
full-bed expansion, durable rows/blooms, invalid and occupied selections, wish
validation, trusted author/day/time, caps, RLS, direct-write denial, and grants.
For upgrade verification, reset the disposable project through migration
`20260918030000`, create a synthetic legacy garden using the original APIs, then
apply `20260918050000_selected_planting_spot.sql`. Check that all prior flower
rows remain identical, `next_spot` remains the next empty identifier, and capacity
includes that identifier in whole beds. Reset the disposable project afterward.

The harness cleans its fixtures in `finally` and checks cleanup, but an interrupted
process can still leave disposable local state. Always reset afterward. It only
accepts a local `supabase_db_*` container name and never opens a hosted connection.
The separate existing Auth harness switches to the actual `supabase_auth_admin`
role, checks signup lifecycle/binding and spoofing/revocation, then rolls back.
Run these harnesses sequentially because both use the empty local membership
configuration. Application frontend tests are unrelated to this database-only
change; real Google account sign-in and hosted setup remain separate checks.

## Settlement integration

[Decision 0010](../decisions/0010-garden-rollover.md) and the
[rollover contract](rollover.md) add settlement before planting unlock/capacity
checks. Initialization, automatic and selected planting use the same post-lock
operation instant. Blooms release unfinished type capacity and retain their spots.
