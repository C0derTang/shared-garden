# Immersive garden and panels

Status: approved direction, with conservative implementation choices for
[issue #74](https://github.com/C0derTang/shared-garden/issues/74).
Preserves [decision 0004](0004-finalized-launch-rules.md) and all existing
identity, privacy, care, progression, media, and private-interaction rules.

## Approved direction and scope

The user approved an actual garden occupying most of the screen (roughly
80–90%), compact tutorial content over translucent black dimming, and Memories,
Achievements, and Settings as panels over that garden. The garden should feel
immediately visitable, with less repeated prose. Memories will use visual cards,
achievements a badge grid with details on demand, and Settings compact controls.
These child-content changes are separately tracked in issues
[#75](https://github.com/C0derTang/shared-garden/issues/75),
[#76](https://github.com/C0derTang/shared-garden/issues/76),
[#77](https://github.com/C0derTang/shared-garden/issues/77), and
[#78](https://github.com/C0derTang/shared-garden/issues/78), each dependent on #74.
Their conservative layouts, wording, and component choices are within the
approved direction; new product/privacy rules still require escalation.

Issue #74 supplies the shared stage and panel foundation. The old guide remains
functional temporarily; its closed reopen button shares a small toolbar with
help and songs. The modal guide conversion belongs to #75. Child page contents
remain substantially intact until their own issues.

## Persistent authorized composition

A `(member)` route group shares one server layout across `/garden`, `/memories`,
`/achievements`, `/settings`, and `/garden/songs`. The group guard runs before
loading the shell. Each destination also retains its own member guard, and data
actions independently authorize. Public entry and authentication routes remain
outside the member layout. No new backend, policy, schema, or dependency is used.

The layout reads garden state and preferences and mounts one `MemberPreferences`,
one `SheetScope`, one `GardenClient`, and one `PrivateInteraction` lifecycle.
`GardenStage` uses the current pathname to display the destination's server
children in a Radix modal. The garden remains mounted and subscribed on ordinary
client navigation; panels show the actual authorized garden, never a duplicate
or a decorative substitute. Direct URLs and refresh use the same composition.
Garden and panel consumers share a reference-counted garden Realtime channel.
Status and coalesced invalidations fan out to each active consumer; leaving one
view cannot unsubscribe the others. A unique channel generation prevents a rapid
remount from reusing a channel whose asynchronous removal is still pending.
The distinct views retain their existing refresh queries for their own data.
Next.js shared-layout state preservation is documented in its official
[layout guide](https://nextjs.org/learn/dashboard-app/creating-layouts-and-pages).

Navigation links disable scroll reset. Opening a panel ordinarily preserves the
background scroll position; its own body scrolls independently. Close and Escape
use browser Back when the panel was opened from Garden in this layout. For a
fresh direct URL, Close replaces the route with `/garden`, so it does not leave
the application or create a loop. Browser Back/Forward uses normal route history.
Refresh creates a fresh garden view rather than restoring an old scroll offset.
On returning to Garden, focus returns to the matching navigation/song link
without scrolling, once no sheet holds focus. Navigating away from a destination
ends its child-content lifetime; it does not erase a mounted garden flower draft.

## Modal and private-interaction contract

The route panel is a parent modal, deliberately **not** an item in the sheet FIFO
queue. Its black overlay and safe-area-aware header stay fixed while the body
scrolls. The centered panel fits its content up to 88dvh, leaving the actual
garden visible around it; long contents scroll within that bound. Desktop width
is capped at 900px. Radix provides focus trapping; the garden and navigation are additionally
`inert` whenever a route panel or a scoped sheet is active. Visible Close and
Escape dismiss the route; clicking the dimmed ground does not dismiss it.

`SheetScope` remains the exclusive FIFO coordinator for flower/seed sheets and
private pending/preview sheets. The active sheet owns focus until it closes.
A pending private moment waits behind an existing flower draft, then opens;
arrival while only a route panel is open can open immediately above it, avoiding
starvation. Conversely, a browser-history navigation to a panel while a flower
sheet is active defers the new panel trap until that sheet closes, retaining
the flower draft and focus. Radix nested focus scopes pause the parent trap and restore the sheet
opener on child close. Route overlays are below sheet overlays.

Owner controls portal from the single private-interaction lifecycle into a
Settings-owned element inside the panel. They never render on the garden
backdrop. Preview state belongs to that Settings-only control subtree; leaving
Settings unmounts it, releases its queue slot, and ignores late preview responses.
A dismissed recipient moment returns focus to the open route panel’s Close
control, because its garden trigger is outside that parent modal.
Recipient pending state and answer delivery keep their existing durable lifecycle
and never require a second polling/subscription instance. Existing owner answer
notifications remain part of that one lifecycle.

The follow-up tutorial must cooperate with this same coordinator. It should
request an exclusive sheet slot, release it before opening a real flower/seed
sheet, and re-request only after yielding so the action can take focus. Preserve
its progress in member preferences; ordinary live refresh must not steal focus.
The shared provider exposes `guideRequest`, a local counter incremented only
after a successful explicit guide-open save. It lets Settings reopen a locally
closed guide even when the persisted guide was already open; refreshes do not
reopen it or interrupt drafts.
Never queue a child action behind a tutorial that waits for that child to finish.
A pending private moment keeps its queued priority. Do not introduce a second
preferences/private-interaction provider in any panel or tutorial.

## Garden presentation

The real grass/path bed begins below the roughly 50px clock HUD; small help,
song, guide, and bottom navigation controls overlay it. Beds occupy the remaining
viewport and continue vertically. The help disclosure contains garden-day/date,
4 a.m. rollover, Moonflower hours, plant/bloom counts, marker legend, sync state,
and refresh. Refresh errors stay visible with the garden. Sign out is available
inside Settings only.

Fixed spot indices, the repeating twelve-position bed geometry, and automatic
bed expansion remain unchanged. Flowers retain their readable names, progress,
64px mobile sprites (80px on wider screens), and two care markers. Empty spots
are understated ground patches with a plus; their accessible labels retain the
spot number. Targets remain at least 44px. No whole-bed shrinking is used to fit
phones. The warm palette, pixel sprites, reduced-motion behavior, and safe-area
insets remain supported.
