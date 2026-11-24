# 0067 — Garden overhaul

Status: approved by the user on 2026-11-24. Source:
[issue #171](https://github.com/C0derTang/shared-garden/issues/171).
Exact layouts and other listed details are conservative choices under the
discretion described below, in the style of
[decision 0004](0004-finalized-launch-rules.md). Follow
[AGENTS.md](../../AGENTS.md) and [CLAUDE.md](../../CLAUDE.md) for issue, build,
review and merge gates.

This record is the single approved source for every overhaul issue. It replaces
the garden's look, routes and some rules for a new garden, and freezes the
existing garden as a read-only legacy archive.

## Integration and workflow

All overhaul work lands on the integration branch `overhaul/garden-v2` through
per-issue PRs, each with its own issue, isolated builder and independent review.
One final reviewed PR merges `overhaul/garden-v2` into `main`. Because
[decision 0065](0065-ordered-database-releases.md) releases production on each
`main` push, nothing in the overhaul reaches production before that final merge.

## Supersession

The user directed: "disregard all changes regarding ui/ux of the app. we're
doing a full overhaul." For the new garden, the visual and interaction decisions
[0022](0022-flower-sprites.md), [0029](0029-immersive-garden.md)–[0033](0033-compact-settings.md),
[0036](0036-flower-idle-motion.md)–[0056](0056-guide-coach-mark-and-outer-pages.md)
and [0066](0066-private-sunset-home.md) do not apply. They continue to describe
the legacy garden.

Identity, privacy, the fixed two-person scope, media privacy and security
decisions all still apply to the new garden, including membership checks,
private media handling and explicit function grants. The new garden rules below
supersede [decision 0004](0004-finalized-launch-rules.md) for the new garden
only; 0004 continues to govern the legacy garden.

## Routes

- The existing garden moves from `/garden` to `/legacy`. `/memories`,
  `/achievements`, `/settings` and `/garden/songs` stop existing as paths; their
  content becomes in-page panels of `/legacy`.
- The sunset/spider-lily home from [decision 0066](0066-private-sunset-home.md)
  is unrouted, but its code and media stay in the repository. It is not deleted.
- `/` becomes a new landing: a lakeside house front in a forest. Signed-out
  visitors see the scene and a Log in control. Signed-in members see the house
  with an enter door; tapping it plays a walk-through animation (the door opens
  and the camera pushes through) into `/garden`. Successful login returns to `/`.
- The new garden lives at `/garden`. Its settings page links to the old garden
  at `/legacy`.

## Legacy garden

Once the overhaul ships, the legacy garden is frozen and read-only: no rollover
or settlement, no decay, no planting, entries, edits, replies, fulfilment or
milestones. Everything stays browsable, including flowers, entries, memories,
achievements and songs.

## New garden data

The new garden uses tables and functions separate from the legacy garden, not
shared tables distinguished by a tag. It starts fresh and empty: no flowers,
achievements or memories are carried over. Legacy content is visible only under
`/legacy`.

Identity-level shared infrastructure may be reused: members, the garden clock,
member settings, private interaction, the daisy question bank and catalogs.

## New garden rules

These rules supersede [decision 0004](0004-finalized-launch-rules.md) for the
new garden only.

- All existing features and per-flower activities are kept.
- Growth still requires both people to submit to the same flower on the same
  garden day, adding one growth unit at rollover. Flowers never lose growth
  when both do not submit. There is no decay of any kind.
- There are no planting restrictions: no per-type concurrent limits and no
  unlock order, so all 13 types are available from the start. More than one
  Cactus may be planted, and no initial Cactus is created automatically. Fixed
  planting spots remain, and beds expand as they fill.
- Everything else is unchanged: the garden day boundary at 4 a.m.
  America/Los_Angeles, first-submission-counts, the 30-minute same-day edit
  window, the Moonflower window, Peony ordered milestones, the Dandelion wish,
  partner visibility and replies.

## New garden look and interaction

- The garden is a 2.5D world leaning toward 3D, with the soft, painterly energy
  of the reference site `walk-with-zilin.vercel.app`: hand-painted gouache
  textures, rounded mossy hills, a winding flower path, oversized foreground
  blooms, soft glow and handwritten white type. It is implemented procedurally
  ("procedurally painted, but make it look like a 3d world from paint") with
  vgpu on WebGPU. No artwork, fonts or assets are copied from the reference site.
- WebGPU is required. Browsers without it see a short unsupported notice that
  links to `/legacy`.
- Clicking a flower shows it large on the left half of the screen, with its
  activity and details on the right half.
- Flowers are procedural: random petal generation, stalk growth and natural
  variation are seeded per flower, so no two flowers, even of the same type,
  look the same.
- The sky follows real America/Los_Angeles solar time through dawn, day, dusk
  and night. If any achievement was earned during a garden day, a fireworks show
  plays when either member opens the garden after sunset that night, once per
  person per night, with a replay control.

## Local development

A development-only seeded sign-in may exist for local demos. It must be
hard-gated to development with loopback Supabase and app origins, and must never
be usable in production builds.

## Discretion

In the style of [decision 0004](0004-finalized-launch-rules.md), each builder
makes and documents conservative choices for exact layouts, the phone layout of
the split flower view, shaders, palettes, wording, schema and function names,
animation timing, and adaptations of achievements to the removed unlock and
limit rules. Record them in this decision or a follow-up decision and in the
affected issue. Choices outside this discretion, conflicts, credentials or
account actions, unapproved costs and material scope or privacy changes still
require escalation.

### Recorded choice: new-garden media ([#178](https://github.com/C0derTang/shared-garden/issues/178))

New-garden photos and voice memos keep every rule of decisions 0025 and 0027
in a separate registry, guard trigger, `v2_` functions and private
`garden-v2-staging`/`garden-v2-media` buckets, serialized by the new garden's
lock. The existing `/api/media/*` routes take a server-validated `garden`
discriminator (`"v2"`; absent or `"legacy"` keeps legacy behavior). Intent
limits are counted per garden. See the
[media API contract](../media/backend.md#new-garden-media-issue-178).
