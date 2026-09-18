# Garden catalog, initialization, and planting

Status: implementation choices under the conservative discretion in
[decision 0004](0004-finalized-launch-rules.md).
Source: [Issue #21](https://github.com/C0derTang/shared-garden/issues/21).
Identity follows [decision 0006](0006-fixed-identity-boundary.md).
These choices add no product scope or extra capacity limit.

Historical allocation details below are partially superseded by
[decision 0023](0023-selected-planting-spots.md): callers can select a visible
empty fixed spot, `next_spot` is the lowest empty spot, and beds expose twelve
spots at a time. The catalog, retained facts, limits, and completion seam remain.

## Catalog and persistent facts

`public.flower_catalog` contains exactly the 13 approved lowercase type keys,
display names, action labels, growth targets, unfinished limits, and bloom unlock
thresholds. `forget-me-not` retains its hyphenated key. The catalog's Cactus limit
of one describes the permanent instance; it is never available for planting.

One `public.garden` row has the constrained identifier `1`. Initialization is
lazy: the first approved member calls `public.initialize_garden()`, or plants an
initially available flower. The migration itself stores no garden activity,
identities, or demo content. Initialization atomically creates Cactus at spot `1`
and the four initial unlock records. Repeated initialization preserves every
existing flower and original timestamp. Both member slots share this state.

`public.flowers` retains one UUID per plant, a unique positive `bigint` spot,
server planting instant and garden day, safe member ID, and initial provenance.
Cactus has `is_initial=true` and no planter; all user plantings have an actual
member ID and `is_initial=false`. These retained rows support First seed,
all-types-planted, and five-Dandelion-wishes facts without attributing the initial
Cactus to a user's seed planting. No delete, move, archive, or history-reset API
exists. Spots start at one, increase on successful plantings, and remain attached
to blooms. They are placement identifiers for expanding beds, not coordinates or
a prescribed visible grid. There is no application-level overall plant cap.

New flowers start at zero `growth_units`, with null `first_bloom_at` and
`first_bloom_day`. A permanent first-bloom timestamp and qualifying garden day
represent once-per-instance credit. Completed flowers cease consuming unfinished
capacity but retain all planting facts and their spot. Cactus's unique partial
index and the planting rejection apply even after its bloom.

`public.flower_unlocks` stores each earned type once. Initial types have threshold
zero; total distinct first blooms unlock thresholds one through nine. Unlock
rows are inserted without updating an existing row, preserving their original
earning timestamp. Neither a stage change nor repeated Cactus completion can
remove an unlock or add another bloom credit. Only trusted database routines can
change growth, first-bloom metadata, or unlock records.

## Authoritative planting and concurrency

The only planting inputs are `p_type_key text` and optional `p_shared_wish text`.
The server derives member ID through `private.require_member()`, captures time
after obtaining the garden lock, and derives the garden day with the existing
Los Angeles 4 a.m. clock primitive. A queued request crossing rollover therefore
uses its actual planting day. Client actor, day, timestamp, progress, or spot
arguments are absent from the API and rejected.

Dandelion wishes are trimmed of surrounding SQL whitespace and must contain
1–500 Unicode characters after trimming. The title is retained with the plant.
Other types reject any non-null wish, including an empty string. Unknown and
locked types, a second Cactus, invalid wishes, and exhausted per-type capacity
raise SQLSTATE `22023`. Unauthorized callers receive the existing `42501` guard.
Failed transactions create no flower and consume no spot.

Initialization uses a singleton insert with conflict handling, then locks the
garden row. Planting holds the same row lock while checking unlocks and current
unfinished capacity, allocating `next_spot`, and inserting the flower. This
serializes competing requests without an overall cap. At ordinary READ COMMITTED
isolation, a waiting request sees the prior committed request in its subsequent
statements. Stronger isolation can abort a conflicting transaction for retry;
clients must not treat a serialization failure as successful planting. Future
settlement and growth routines must lock the garden row before changing capacity
or credit, using the same lock order.

## Private completion seam and downstream responsibilities

`private.record_first_bloom(uuid, date)` is a trusted internal seam for the later
settlement/milestone evaluator. It requires live membership, locks the garden
row, checks that the qualifying day is between planting day and the current
garden day, and atomically records the first bloom, target growth, and newly
earned unlocks. A repeated call cannot replace the original bloom timestamp/day
or count the instance again. The evaluator must prove earned growth before
calling it; this routine deliberately does not implement daily entries,
rollover, decay, or milestones. It is not executable by browser, anonymous,
service API, or Auth roles, and it does not grant private-schema access.

The evaluator supplies the qualifying day explicitly so ordinary rollover
credit can belong to the day just ended and Peony credit to its completion day.
The recorded timestamp is when the fact was settled; it must not be used as a
substitute for the qualifying day. The planting instant/day and retained bloom
day support future historical eligibility snapshots; this slice does not claim
to evaluate a before-noon achievement or create daily snapshots. Further durable
events belong to those later issues.

## Access and validation boundaries

All four public tables have explicit SELECT grants and RLS using the existing
safe membership predicate. Both approved members can read the same application
state; anonymous and unrelated authenticated callers cannot. No account email,
Auth UUID, Google subject, or private membership configuration is in these
public tables. All direct mutation grants are revoked, including service-role
defaults. Public mutation functions use a fixed `pg_catalog` search path and
membership guards; private helpers remain ungranted.

The [API and verification guide](../database/planting.md) describes the database
suite and repeatable two-session contention checks. Local fixtures exercise the
actual Auth tables and roles, but are not a live Google OAuth exchange or a
hosted deployment. No hosted state is changed in this issue.
