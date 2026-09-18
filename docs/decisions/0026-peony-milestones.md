# Peony milestone backend

Status: conservative implementation choices under the approved discretion in
[decision 0004](0004-finalized-launch-rules.md). Implements the database slice
[issue #49](https://github.com/C0derTang/shared-garden/issues/49), split from
[issue #31](https://github.com/C0derTang/shared-garden/issues/31). The Peony sheet,
browser interaction, and Realtime integration remain in #31.

## Ordered progress and history

Peony has four stages, each earned immediately by completing the next pair:
ideas, acceptance of one shared activity-and-time plan, confirmation that the
date happened, and favorite moments. Both people may complete all four in one
garden day. Each personal contribution belongs to a flower, milestone, and member,
with one immutable original time and garden day. Ideas and favorites accept only
`{"text":"..."}`: trim surrounding whitespace and allow 1–4,000 Unicode
characters with a 20,000-byte JSON limit. Confirmations accept only `{}`.
There is no per-day Peony submission limit across different milestones.

Only the author can edit an unfinished idea or favorite, through exactly thirty
elapsed minutes after its original submission and before that original garden
day ends. Edits keep the original time and day. Completing a pair fixes both
contributions immediately, even when an individual edit window remains open.
Confirmations carry no editable content. The ordinary entry APIs keep rejecting
Peony. No client supplies a member, operation time, day, or growth value.

Keep six personal contribution rows at most per flower, one current/final plan,
two current-version acceptances at most, and the existing four immutable
`peony_activity` rows. The authoritative state RPC returns this bounded complete
history without pagination; final accepted plan details remain after bloom.
Superseded draft text and invalidated acceptances are replaced, not archived.
No generic Memories page or new achievement evaluator is included.

## Shared plan negotiation

Either member can create or revise the shared plan while milestone two remains
unfinished. A plan contains a trimmed activity of 1–2,000 Unicode characters
(8,000 bytes maximum) and an exact scheduled instant. This free text accommodates
remote and in-person activities. No location field, duration, future-date-only
rule, or restriction based on the original proposal time is introduced.

The scheduling input is ISO 8601 text with seconds and an explicit `Z` or numeric
`±HH:MM` offset; at most six fractional second digits are allowed. Validate this
shape before PostgreSQL interprets it, then store `timestamptz`. Offsetless wall
times, named zones, nonfinite values, and invalid dates are rejected. This avoids
depending on a database session's time zone and distinguishes the repeated hour
at the fall daylight saving transition. The display contract is
`America/Los_Angeles`: render the date, time, and Pacific zone label from the
stored instant. Later UI input must resolve ambiguous/nonexistent local times
explicitly and send the selected offset; the backend never guesses that choice.

Every write supplies its expected current version (zero means no plan yet).
The first plan has version one. An activity or instant change increments the
version and deletes both members' prior acceptance. Trimming-only activity
changes and alternate offsets representing the same instant are no-ops; they
preserve version, last update metadata, and acceptance times. A stale expected
version fails even for a no-op. Creating/editing a plan never implicitly accepts
it. Each member explicitly accepts its exact current version. The second current
acceptance immediately fixes the agreement and earns stage two. Later plan edits
and repeat acceptance are rejected. Personal thirty-minute edit restrictions do
not limit unfinished shared-plan negotiation.

## Serialization, private access, and lifecycle

Every public Peony read and mutation calls `private.begin_garden_operation()`.
It locks the singleton garden, rechecks live membership, captures trusted time,
and settles elapsed days. All following eligibility, reads, writes, and returned
edit flags use that operation instant. The common lock serializes Peony with
existing planting, entry, and rollover operations. An edit racing acceptance
either invalidates that acceptance's version before it runs or loses to the
completed immutable agreement. A queued operation reevaluates revocation,
personal edit expiry, and garden-day rollover after acquiring the lock.

Paired completion calls the existing `private.record_peony_activity` with both
original timestamps and that same operation instant, then advances exactly one
stage. Stage four calls `private.record_first_bloom_at`, preserving bloom count
and permanent unlock behavior. Rollover already excludes Peony from ordinary
growth/decay and credits streak activity by milestone completion day. A pair may
span days; later timing achievements must independently require originals from
the same garden day. Edits cannot rewrite that evidence.

All three new tables enable member-only SELECT RLS. Browser and service roles
have no direct write or sequence grants; private helper execution is revoked.
Only the five guarded public RPCs are executable by authenticated users, with
live membership required inside them. No Realtime publication, hosted change,
private identity configuration, or production fixture is added.

## Compatibility and rollout

The migration only adds Peony tables and functions. Existing signatures and data
are unchanged; an older frontend continues to use its existing APIs, and a newer
Peony interface can adopt the separate [contract](../database/peony.md).
Apply the additive migration before enabling that interface. If rollout must be
stopped, retain the tables/history and disable the new client flow; revoke the
five new RPC grants if the mutation path itself must be disabled. A destructive
down migration that removes earned milestones or agreed plans is not authorized.
Re-enabling the same guarded interface resumes from stored stage and version.

Verification covers a clean migration, all existing database assertions, new
Peony boundary tests, real concurrent sessions, the existing Auth/planting/entry/
rollover harnesses, and ordinary web checks. The test-only clock replacements are
rolled back or restored and never exposed through production configuration.
