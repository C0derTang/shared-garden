# Working shared garden

Status: conservative implementation choices under the approved discretion in
[decision 0004](0004-finalized-launch-rules.md). Source:
[issue #27](https://github.com/C0derTang/shared-garden/issues/27).
Dependencies #17, #18, #21, #22, #24, #25, #40 and #41 are merged.

## Layout and ordinary care

The private Garden screen uses warm cream, sage beds, restrained pixel controls,
original reviewed flower sprites, readable system text and a serif heading.
Each twelve-spot bed uses permanent, naturally offset positions. Phones stack
the clock above vertically scrolling beds; wider screens place the clock and
short instructions alongside the beds. Every retained plant remains visible,
including the one Cactus and permanent blooms. Species names and numeric progress
remain visible because a tiny seed alone cannot identify the species. Filling a
bed exposes the next backend-provided bed; no client global cap is introduced.

An empty spot opens the shared accessible modal sheet. The picker shows all
thirteen types, exact growth targets, per-type availability and reasons for
locked/full choices. Cactus is always unavailable to plant, including after its
bloom. Dandelion requires its 1–500-character shared wish before planting.
The selected permanent spot is passed to `plant_flower_at`, never the automatic
allocator. Competing changes are resolved by the backend and a refreshed view.

A flower opens current authoritative progress, both daily markers, current
entries, ordinary care and paged read-only history. Partner content is immediately
visible without a reciprocal requirement. Forms use the exact bounded payloads
in [0009](0009-daily-entries-and-questions.md). The six Hydrangea mood labels are
shown with swatches; both current moods form an interleaved color patch with a
text equivalent. A live Daisy displays its shared category and question. Cactus
is one tap and remains usable after bloom. Ordinary blooms stop requiring care.
Tulip metadata and a safe provider link remain usable before music integration.

Author edit controls use the server's current `can_edit`, effective deadline,
inclusivity and garden day. A local countdown only removes stale controls; the
backend checks permission again. Drafts survive refresh and failed saves while
the sheet is open. At rollover an existing draft needs explicit review before
posting into the new day; an expired edit draft remains copyable but unsavable.
If the calibrated clock reaches the supplied rollover before a current snapshot
arrives, saving and draft acknowledgment remain disabled. A save waiting behind
an authoritative read is canceled if that read advances the day or leaves an
unresolved boundary. The draft remains for review; no captured command is queued
into the next day. This guard recalibrates immediately before dispatch, without
sending a client day or timestamp to the backend.
Moonflower keeps an unsaved thought visible when its window closes, with
submission disabled. Closing a sheet discards its unsaved draft. Actions are never queued offline.

Sunflower and Bluebell capture/playback, Peony milestones, Dandelion fulfillment,
music integration/collection, Memories, Achievements, onboarding and Settings
remain separate issues. Their destinations or care states honestly explain what
is unavailable. Supported ordinary actions are not withheld. The generic
navigation is unchanged and every destination independently authorizes members.

## Authoritative reads, sessions and refresh

Each private page or Server Action calls `requireMember()` before accessing any
state. Actor, day, timestamps and growth are never action inputs. Rendering uses
`current_garden_state()` and validates its consumed shape before mapping progress
to sprites. Mutations refresh after success **and** error, since rejected
transactions roll back settlement. Ambiguous transport results do not claim a
save and ask the user to check entries before retrying. Retryable Auth transport errors are classified centrally as unavailable.
Unavailable Server Action requests receive a generic 503 instead of a redirect,
and the action guard independently handles a later transient failure without
revealing data. Actual missing/denied membership still redirects to sign-in.
UI pending locks resist
accidental repeated taps; the database remains the authority under concurrency.

The prominent Pacific clock uses the server instant and monotonic elapsed time.
It refetches at the supplied rollover, at a detected Moonflower window change,
on foreground/focus, reconnect and after mutations. A visible-page 30-second
fallback refetch keeps the garden usable without Realtime. Growth is never
incremented in the client. Refreshes are coalesced and older snapshots cannot
replace newer ones. Errors preserve the last snapshot and identify stale state.

The supported Supabase SSR browser client shares the server's `sg-auth` cookie
name and host-only, path `/`, SameSite Lax, HTTPS Secure options. Its supported
session lifecycle handles token updates for Realtime. No Auth profile or token
is passed as a UI prop. Configuration remains the existing public URL and modern
publishable key; no browser secret key is introduced.

Postgres Changes is sufficient for the fixed two-member garden. Only `flowers`,
`flower_entries`, and `flower_unlocks` are published, and only INSERT/UPDATE.
Existing actual-member RLS authorizes each delivered row, including live
revocation. DELETE/TRUNCATE are excluded at publication level because deleted
rows cannot pass the same RLS check. No private configuration, garden-clock
bookkeeping or static catalog tables are published. Events only invalidate a
snapshot; they never apply partial growth updates. The garden table is omitted
to prevent ordinary settlement/read bookkeeping from causing refetch loops.
Subscription teardown removes the channel and pending debounce, and a successful
join/rejoin requests a fresh snapshot. The pinned SDK uses
`postgres_changes_options.wait: true`, so its subscribed status confirms the
actual replication subscription rather than only a channel join. Broadcast/Presence and their cached channel
authorization are not used.

Primary reference: [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes).
The [integration guide](../garden/integration.md) records the extension points
and repeatable local verification boundaries. No hosted migration, Google account
configuration, production content or deployment is part of this issue.
