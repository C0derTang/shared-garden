# Selected fixed planting spots and visible beds

Status: implementation correction under the conservative discretion in
[decision 0004](0004-finalized-launch-rules.md).
Source: [Issue #41](https://github.com/C0derTang/shared-garden/issues/41).
Dependencies: identity [#18](https://github.com/C0derTang/shared-garden/issues/18)
and planting [#21](https://github.com/C0derTang/shared-garden/issues/21), both merged.

## Correction and retained rules

[Decision 0002](0002-progression-and-mobile-garden.md) approved choosing an empty
fixed spot. The original [decision 0007](0007-garden-catalog-and-planting.md)
implementation offered only the next sequential spot. This record supersedes its
automatic-only input and monotonically increasing allocation details. It does
not introduce free placement or change the catalog, per-type limits, permanent
Cactus, unlocks, retained blooms/history, wish validation, or private membership.

## Capacity and stable identifiers

A bed contains twelve fixed spots. `garden.spot_capacity` is the inclusive upper
bound of visible spots; the initial bed exposes identifiers 1–12 with Cactus at
1. Subtract every retained `flowers.spot` from that range to find empty spots.
Bed numbering is one-based: `1 + floor((spot - 1) / 12)`. Position within the bed
is `1 + ((spot - 1) % 12)`. These are stable layout identifiers, not coordinates
or a required visible grid. The working garden may arrange them naturally.

`garden.next_spot` now means the lowest empty spot. It remains useful to older
automatic callers; it is not the bed capacity or the highest occupied spot.
Selecting spot 12 while spot 2 remains empty leaves capacity at 12 and the next
automatic spot at 2. Filling every visible spot adds twelve more visible spots
in the same transaction. No overall garden or active-flower cap is added.
Completed flowers still occupy their original spots permanently.

The additive migration preserves all existing flower rows and assigns existing
gardens enough whole beds to include their next empty spot. An already-full
legacy bed therefore gains an empty bed. No migration fixture or activity is
created for a garden that has not initialized.

## One authoritative allocation path

`public.plant_flower_at(p_type_key text, p_spot numeric,
p_shared_wish text default null)` selects one visible, currently empty integer
identifier and returns the new flower row. Numeric input permits explicit
fraction rejection before PostgreSQL could round a conversion to `bigint`.
Null, fractional, nonfinite, nonpositive, and beyond-capacity selections are
rejected; a very large input never allocates a large range. Occupied spots are
rejected without changing any capacity or plant.

The compatible `public.plant_flower(p_type_key text,
p_shared_wish text default null)` automatically chooses the lowest empty spot.
Both operations delegate to one ungranted private helper for identity, type,
unlock, wish, capacity, and insertion checks. Initialization and allocation lock
the same singleton garden row. Membership is rechecked after that lock and the
planting instant/day are captured afterward. A fresh garden's initialization
and initial unlock timestamps use the same post-lock instant as its Cactus; existing
initialization timestamps remain unchanged. A waiting request cannot retain
access revoked while it queued or use its earlier request time as planting time.

At READ COMMITTED, two callers selecting the same empty spot serialize; one
plants, and the second receives `22023` with `Planting spot is occupied`. Distinct
empty spots can both succeed within per-type limits. Serialization failures at
stronger isolation require a reread/retry. Clients reread garden and flower
state after a race or ambiguous network result; neither API is idempotent.

All existing table grants and RLS remain. Only authenticated members can execute
the public allocation operations; no direct capacity or spot writes are granted.
The private shared helper is inaccessible to browser, service API, and Auth roles.
All allocation functions use the fixed `pg_catalog` search path.

## Downstream contract and verification

Working garden [#27](https://github.com/C0derTang/shared-garden/issues/27) reads
the bounded spot range and uses the explicit operation for a clicked empty spot.
Settlement [#25](https://github.com/C0derTang/shared-garden/issues/25) keeps the
same garden-first lock order and the private first-bloom seam. Settlement must
not move plants or free their spots; a bloom only releases unfinished type
capacity. This correction does not change entry or settlement routines.

The [planting guide](../database/planting.md) records both exact signatures,
error handling, migration verification, database checks, and real concurrency
checks. Local fixtures are synthetic and disposable; no hosted migration,
production activity, or live Google OAuth exchange is part of this correction.
