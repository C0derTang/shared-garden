# Dandelion fulfillment contract

See [decision 0016](../decisions/0016-dandelion-fulfillment.md).
Authenticated actual members call `fulfill_dandelion(p_flower_id uuid)` without
supplying an actor or clock. Result: `{flower_id, fulfilled_at, fulfilled_by}`.
It is stable on repeats, including a different actor. The authoritative flower
in `current_garden_state` and `current_entry_state` carries the same nullable
`fulfilled_at`/`fulfilled_by` fact. Direct writes remain denied to browser roles.
No additional read endpoint, event identity or achievement credit is needed.

For disposable local verification, copy config/migrations/tests to
`/tmp/shared-garden-dandelion32/supabase`, change the copy's project ID to
`shared-garden-dandelion32` and API/database/shadow ports to 58021/58022/58020.
Never link or modify a hosted project. Keep local status credentials outside Git.

```sh
node_modules/.bin/supabase start --workdir /tmp/shared-garden-dandelion32
node_modules/.bin/supabase test db --workdir /tmp/shared-garden-dandelion32
python3 supabase/tests/concurrency/dandelion_race.py supabase_db_shared-garden-dandelion32
```

The race harness refuses configured data, observes the waiting session in an
actual database lock wait, compares results from both members, then repeats as
one member. It verifies unchanged plant/spot/wish/growth/bloom facts and no added
activity, and removes its synthetic fixtures. Run existing planting, entries,
rollover, Peony and media race harnesses and the Auth-role SQL regression too.
Reset afterward and rerun the SQL suite. Full web tests use Linux for the shipped
native audio binaries; a macOS run without local audio binaries cannot verify
those audio tests. Browser fixtures are synthetic and temporary, never shipped.
