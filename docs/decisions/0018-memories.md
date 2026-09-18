# Shared retained Memories

Status: conservative implementation choices under [decision 0004](0004-finalized-launch-rules.md), for [issue #34](https://github.com/C0derTang/shared-garden/issues/34).
Dependencies #27–#32 are merged. This record does not change their content,
growth, editing, media, or special-flower rules.

## Read contract and history

A dedicated `memories_page` RPC is a stable, security-invoker read with an explicit
live membership check and the existing member table policies. Each server action
independently authorizes the caller, uses the member client with no shared cache,
and returns a field allowlist. No service-role feed or configured private-event
fields are used. The RPC does not initialize the garden, assign a Daisy question,
settle elapsed days, or change history/credit. The shared guarded layout retains
its existing private-interaction and normal lazy settlement behavior; this is a
read-only guarantee for the Memories query, not a claim that the whole page has
no existing global operations.

Ordinary contributions remain separate records for both authors, including
legitimate repeated songs. Daisy answers join their original public assignment's
retained prompt. A Dandelion wish has its own planting record even before any
watering; detail entries remain individual records. Fulfillment is displayed as
a retained fact on that plant and never interpreted as another plant or bloom.

Each Peony is one small history bundle, anchored to its immutable planting time.
It includes both people's retained ideas, happened confirmations, favorite
moments, the latest saved activity/time plan and its current-version acceptances,
and completed milestones. Every personal contribution, acceptance and completion
keeps its original timestamp and garden day. The plan's schedule is labeled
separately from when it was last saved; its editor is not called the original
author. Earlier unfinished plan drafts and cleared acceptances are not stored and
are not presented as retained history. An empty Peony bundle stays discoverable.

## Browsing and updates

The feed sorts descending by `(original instant, source kind, source ID)`;
ordinary contributions use their original posting instant, wishes and Peonies
use planting time. Source kinds and IDs use PostgreSQL C collation, matched by
ASCII client comparison. IDs remain opaque strings, including bigint IDs above
JavaScript's safe integer range. Timestamp strings retain PostgreSQL's full
microsecond precision. A source-qualified identity prevents independent sequence
collisions. Plan edits, scheduled dates, and fulfillment never move a card.

Pages have at most 20 records, with one additional row used only to report more.
Filtering by flower type, stable planting spot, and inclusive garden-day range is
optional. The UI explicitly explains the 4 a.m. Pacific day boundary and that
wish/Peony dates filter their planting day; individual dates remain visible inside
a Peony bundle. Filters never query a private question bank or final-event data.

Older pages use exclusive composite cursors. New arrivals are read nearest-first
in ascending cursor order, one bounded page per refresh, so more than 20 arrivals
cannot skip a gap. The UI reports additional arrivals and permits repeated
refreshes. The newest watermark advances only through returned rows; the oldest
loaded boundary is separate and unchanged by refreshes. Newly found cards wait
behind an explicit Show newer memories button, preserving reading position.

Realtime is invalidation only. Focus, reconnect, manual refresh and a visible-page
60-second fallback refresh all loaded and staged identities in batches of 20,
then check newer records. Full snapshots replace Peony bundles, removing obsolete
acceptances. Server read timestamps are compared without losing microseconds;
serial requests and a filter/unmount generation prevent older responses restoring
stale content. Errors retain loaded pages and usable retry; a failed initial read
is not represented as an empty garden. Applying filters deliberately starts a new
browse. There is no feed mutation, deletion or archive API.

## Presentation and private resources

Single-column cards preserve readable time, author, flower spot/type, permanent
bloom and wish/date context at 320px, 390px and wider widths. Posting instants
show their real Pacific calendar date/time; garden-day labels are separate.
Text is rendered as text. Historical content is read-only, with a Garden link
for the existing server-enforced currently eligible edit workflow.

Photo signing/mounting requires Load private photo; replacing its media ID closes
the old viewer. The existing contained-square PhotoViewer preserves dimensions
and offers expiry retry. VoiceViewer and SongPlayer retain their explicit loading
and user playback controls, cancellation, no autoplay and existing safe fallbacks.
The feed stores media IDs only, never storage paths or signed URLs. Already issued
short-lived URLs keep their existing bounded lifetime; browsing does not promise
revocation of bytes already downloaded.
