# Daily entries, edit bounds, and shared questions

Status: implementation choices under the approved discretion in
[decision 0004](0004-finalized-launch-rules.md).
Issue: [#24](https://github.com/C0derTang/shared-garden/issues/24).
Dependencies: merged identity #18, Daisy bank #19, and planting #21.

## Durable submissions and editing

One row records each member's original submission to a flower and Pacific garden
day. Submission and editing are separate RPCs. A duplicate submission fails with
an instruction to edit; it never silently replaces content. Both members can read
all entries immediately, including without first submitting. No growth, bloom,
unlock, or achievement is awarded by these RPCs. The later rollover evaluator
uses the two durable member rows per flower/day.

A valid edit occurs at or before `original_posted_at + 30 minutes` and strictly
before the next local 4 a.m. rollover. Exactly 30 minutes is included; exactly
4 a.m. belongs to the next day and is excluded even when 30 minutes has not
elapsed. Both bounds use actual elapsed instants and the existing Pacific clock,
including DST. Editing preserves ID, author, flower, day, original posting time,
and Daisy assignment. Only final allowed payload and last-update time change;
this retains original timestamps for ten-minute comparisons and final moods for
rollover. Past days are read-only. The UI receives the effective deadline and
whether its final instant is inclusive.

All reads resolve actual membership, and mutation/snapshot RPCs take the existing
singleton garden lock before reading eligibility or capturing `clock_timestamp()`.
Queued requests therefore use their execution time after the wait. No client
actor, date, timestamp, stage, or test-clock argument exists. Existing bloom
facts reject further ordinary submissions. Cactus continues once per member/day
after its single bloom. New Moonflower contributions require 22:00 inclusive
through 04:00 exclusive; edits use the general edit rules.

## Bounded payloads

Unknown fields are rejected. Payloads must be JSON objects no larger than 20,000
UTF-8 bytes when encoded by PostgreSQL. Text values are strings, trimmed at the
outside, and limited by Unicode character count:

| Flowers | Exact payload | Bounds |
| --- | --- | --- |
| Rose, Marigold, Snapdragon, Moonflower, Dandelion, Forget-me-not | `text` | 1–4,000 characters |
| Daisy | `text`, `question_id` | Same text bound; actual assigned question ID |
| Cactus | Empty object | One tap, no extra content |
| Tulip | `title`, `artist`, `url` | Title/artist 1–200; URL 1–512 |
| Hydrangea | `mood` | One of the six keys below |

Dandelion entries only add text details; its original shared wish remains on the
flower. Sunflower, Bluebell, and Peony reject generic payloads until their private
media and ordered milestone workflows are implemented. There is no placeholder
media reference that a browser can forge.

Tulip links accept HTTPS URLs with a valid ASCII DNS hostname of at most 253
characters (each label at most 63), optional port 1–65,535, and optional
path/query/fragment. Only the hostname counts toward the hostname length limit.
International hostnames use punycode.
Credentials, whitespace, control characters (including percent-encoded ASCII
controls), backslashes, malformed percent escapes, malformed hosts, and other
schemes are rejected. No submitted URL is fetched by this database feature.
The future player may embed supported Spotify track links, while other safe
provider links remain usable as links. Accepting a link does not promise playback
or a provider integration.

## Shared Daisy assignment

The reviewed `content/daisy-questions.json` remains the editorial source. A
checked generator copies its exact 100 ID/category/prompt rows into the migration;
there is no separately authored backend bank. Delivery alternates `light-001`,
`deeper-001`, `light-002`, `deeper-002`, through `light-050`, `deeper-050`. After all
100 assignments, the next cycle restarts at `light-001`. Assignment is deterministic
and does not add a randomness dependency.

The first requested assignment on each garden day is retained permanently. All
members and all Daisy instances use that same assignment. Unrequested missed days
do not consume questions. A day with a requested question consumes a position even
if nobody answers it. The garden lock serializes concurrent assignment attempts.
Each row saves ordinal, exact question ID, category, prompt, and server assignment
time. Each Daisy entry references that day's row. Stable question IDs, rather than
cycle ordinals, support the later distinct-question achievement.

## Six mood colors

These choices are coordinated with sprite issue #40 and decision 0022, without a
code dependency on that feature. Both labels and colors are member-readable:

| Key | Label | Color name | Hex |
| --- | --- | --- | --- |
| `calm` | Calm | Blue | `#6F9EAB` |
| `joyful` | Joyful | Yellow | `#E2B84F` |
| `tender` | Tender | Pink | `#D88798` |
| `energized` | Energized | Orange | `#D9854F` |
| `low` | Low | Lavender | `#8B87AB` |
| `tense` | Tense | Red | `#B86B61` |

## History and integration boundaries

Entry IDs are server-generated bigint values. History pages sort by descending
ID, accept an exclusive `before_id` cursor, default to 50 rows, and allow 1–100.
They optionally filter by flower; no cursor or filter bypasses membership.
Assignments, entries, and mood choices have RLS, explicit SELECT-only member
grants, and no browser/service-role mutation grants. Private helpers have no
browser execution grants and all routines fix their search path to `pg_catalog`.

The [API contract and verification guide](../database/entries.md) documents these
interfaces. Rollover, achievement evaluation, media, Peony, Realtime delivery, and
frontend presentation remain their separate issues. Immediate visibility here
means authorized reads expose committed partner content without a reciprocal
submission gate. It does not yet establish Realtime subscriptions.
