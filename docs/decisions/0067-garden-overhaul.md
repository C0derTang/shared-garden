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

The private final interaction ([decision 0020](0020-private-interaction.md))
keeps its legacy gate, all 26 ordinary achievements of the legacy garden; the
new garden's achievements do not affect it. After the freeze, the gate reads
the frozen legacy awards, and delivery, answer, owner controls and
acknowledgment keep working (user decision on
[issue #176](https://github.com/C0derTang/shared-garden/issues/176)).

Choices made under the discretion below for the freeze
([issue #176](https://github.com/C0derTang/shared-garden/issues/176)):

- The freeze is a private singleton marker (`private.legacy_garden_freeze`)
  that the migration installs, so existing and fresh databases are frozen alike.
  Only a database administrator can remove it; legacy rule tests lift it inside
  their own disposable fixtures.
- While frozen, reads never create the garden or initial Cactus, unlock types,
  assign a Daisy question, settle days, decay growth or evaluate achievements.
  Days still unsettled at freeze time stay unsettled, so before the production
  deploy that ships the freeze, a member should open the legacy garden after the
  last 4 a.m. rollover to settle the final day. A never-initialized
  archive reads as an empty twelve-spot garden with no achievement progress.
- Every legacy write (planting, entries, edits, replies, fulfilment, Peony
  steps and plans, and new photo or voice uploads) refuses with SQLSTATE
  `55000` and the message "The legacy garden is archived and read-only", after
  the usual membership check. Signed reads of existing entry media continue.
  Member settings and the private interaction stay writable.
- `/legacy` shows "Archived garden · read-only" in its clock and settings, hides
  bare-soil planting, care cues, the Today card, the guide, and every entry,
  edit, reply, fulfilment, Peony and capture control, and keeps history,
  replies, photos, voice notes, songs, memories and achievements readable.

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

## World look (amendments and #174 choices)

The user amended the look twice on 2026-11-24 (recorded on
[#174](https://github.com/C0derTang/shared-garden/issues/174)). Where these
amendments conflict with "New garden look and interaction" above, they win.

- **Update 1:** match the reference site's art style only (painted look, visible
  directional brushstrokes, canvas grain, soft glow). Do not copy its
  composition: no mounds or rolling mossy hills, and no winding path-into-hills
  layout. Flowers must be intricate and built from brushstrokes.
- **Update 2, which supersedes update 1 where they conflict:**
  - The visual target is the sunset home's own art (`public/sunset-home/painted-lake.png`,
    `public/sunset-home/red-spider-lily.png`). Landscapes are realistic
    impressionist oil paintings with golden-hour light, haze and canvas texture.
    Flowers are botanical-illustration realism with a soft coloured glow.
  - The garden should be more 3D than those images: real geometry, lighting,
    depth and camera movement under a painterly finish.
  - The UI/UX feel follows the reference site: white handwritten type floating
    in the scene, minimal chrome, camera-journey navigation and soft hover
    glows.

Conservative choices made for the world renderer (#174, PR #189):

- **Mountains:** distant mountain ranges are allowed. This is an orchestrator
  clarification, not the user's words: the "no mounds" rule concerns a
  mound-field composition, not hazy ranges on the far horizon.
- **Composition:** an original lakeside garden meadow. Beds of soil edged with
  mossy stones sit in a meadow with long golden grass, reeds, boulders and
  wildflowers. Our shore has framing trees with branches. A reflective lake
  separates us from far-shore groves and hazy mountain ranges.
- **Orientation:** the camera faces west across the lake, so summer sunsets and
  their glitter path are in view.
- **Sky reference point:** the sun is computed for a generic point at Los
  Angeles (34.05, −118.24), the time zone's namesake city. Night is below −6°,
  day is 8° and above, and dawn or dusk lies between. The moon is an artistic
  fixed position over the lake, not an ephemeris.
- **Rendering:**
  - Real shadow mapping.
  - A painterly post-process: a smoothed structure tensor, then an anisotropic
    Kuwahara whose radius grows with distance, then flow-aligned brush streaks
    and canvas weave.
  - Bloom for the sun, glints and seed marks.
  - The scene and filter render within a 1.9 MP budget on a canvas at
    devicePixelRatio ≤ 2, clamped to the device texture limit.
- **Planting spots:**
  - Beds hold twelve spots and are laid on a four-row lattice that fills from
    the middle outward.
  - Spot identifiers keep their positions as new beds open.
  - Empty spots are soft glowing seed marks that brighten on hover, with no
    rings.
- **Navigation:** scroll, swipe or the arrow keys walk the camera from the
  overview in among the beds, and the pointer adds parallax. Reduced motion
  removes drift, sway and easing. A sideways drag, a horizontal scroll or the
  left and right arrow keys walk along the beds, as far as the outermost open
  bed, so every spot can be reached on narrow screens (added in #181).
- **Type:** Gochi Hand (SIL Open Font License 1.1), bundled in the repository
  and loaded with `next/font/local`; there are no remote font requests.
  Captions glow softly and drift gently.
- **Fallbacks:** browsers without WebGPU see "This garden is painted with
  WebGPU." with a link to `/legacy`. A runtime failure shows "The painted
  garden stopped." with Reload and `/legacy`. After a GPU device loss the world
  recreates its GPU context once before showing that notice; if that restart
  finds no GPU, it shows the "stopped" notice rather than the unsupported one.
- **Development showcase:** `/dev/world` is available in development only and
  returns 404 in production.

## Local development

A development-only seeded sign-in may exist for local demos. It must be
hard-gated to development with loopback Supabase and app origins, and must never
be usable in production builds.

## Achievements in the new garden

Conservative choices under the discretion below, recorded for
[issue #177](https://github.com/C0derTang/shared-garden/issues/177). The new
garden keeps its own achievement progress and awards; legacy awards are never
read or changed.

- The legacy catalog is reused with the same IDs, titles, targets, units and
  order wherever its meaning holds, so the new garden has 25 achievements.
- **Recovery is retired.** It required a flower to lose growth and then bloom.
  Nothing ever loses growth in the new garden, so it could never be earned.
- **First seed planted** counts any planted flower, since there is no initial
  Cactus to exclude.
- **All 13 types planted** counts every planted type; its wording drops the
  initial Cactus and unlocks, because all types are available from the start.
- Every other achievement keeps its legacy rule over new-garden evidence only,
  including completed Peony milestones for the streak and ten-minute
  achievements. Several Cacti or unfinished flowers of one type may count, and
  each bloomed flower counts once toward the bloom totals.
- Each award records the garden day (4 a.m. America/Los_Angeles boundary) of
  the operation that first met its target. Awards confirmed at rollover, such
  as streaks, belong to the day of the first operation after that rollover.
- Achievements are evaluated whenever a new-garden operation settles the garden
  (every state read and change except replies and Memories) and again after
  planting, daily care, Dandelion fulfilment and each completed Peony milestone. Entry and
  Peony text edits do not trigger another evaluation: they never change
  achievement evidence (original times, settled moods and Daisy questions are
  fixed).

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

### Recorded choice: procedural flowers ([#179](https://github.com/C0derTang/shared-garden/issues/179))

Conservative choices for the procedural flowers, made under this decision's
discretion and the look in "World look":

- **Look:** botanical-plate realism after the sunset home's spider lily. Each
  flower is real 3D geometry: curved, cupped, twisted, ruffled petals and
  leaves; tapered stalks; stamens with anthers; composite disks of florets;
  ribbed cactus bodies with spines. Petals and leaves are shaded with tonal
  brush streaks along their length, fanned veins, a midrib and ragged brushy
  margins. They let light through when backlit and take a rim of light and
  the world's shadows. Each head has a soft coloured aura. In the world the
  aura is strongest in the golden hour and faint at night, and it brightens
  under the pointer.
- **Painterly finish:** flowers within 14 world units keep most of their
  botanical detail through the world's painterly filter (they write the
  detail alpha); the canvas brush streaks and weave still pass over them.
- **Determinism:** everything comes from the flower's seed (an integer up to
  2^53 − 1; both 32-bit halves are hashed) through named random streams. A
  plant keeps its identity — colour variant, petal count and stalk — from
  seedling to bloom. Each type has a small palette of natural colour
  variants, chosen and jittered per seed.
- **Growth stages** come from growth / target: seedling below 25% (shoot and
  seed leaves; cactus a small ribbed ball), bud from 25%, opening from 50%,
  bloom at 100%. The stalk lengthens, the head swells and petals unfold
  continuously between them.
- **Type details:**
  - Rose: about 24–38 spiralled petals.
  - Tulip: six tepals in a cup. Some seeds are lily-flowered and some are
    flamed.
  - Marigold: a ruffled pompom.
  - Daisy and sunflower: ray florets around a disk of florets.
  - Hydrangea: a mophead of four-petal florets.
  - Snapdragon: a raceme that opens from the bottom.
  - Moonflower: a pale trumpet with a green star that glows at night.
  - Bluebell: nodding bells on an arching stem.
  - Dandelion: a yellow head, or a seed puff when asked (`puff`). Whether a
    dandelion shows its puff is left to the data wiring.
  - Forget-me-not: clusters of tiny five-petalled flowers with yellow eyes.
  - Peony: a full ruffled bowl, sometimes semi-double with golden stamens.
  - Cactus: a column, barrel or branched body, with a flower from the bud
    stage.
- **Hydrangea colour:** florets take the given mood colours (sRGB hex, e.g.
  the mood palette) when provided, otherwise a seeded blue, pink, lavender or
  white.
- **Motion:** gentle wind sway that grows with height; none under reduced
  motion. Flowers turn at most about ±30° from facing the camera so heads face
  the viewer.
- **Rendering:** three instanced templates (blade, tube, blob) bent in the
  vertex shader from 44 floats per part. ~100 flowers draw in a handful of
  calls per pass. World flowers cast shadows into the key light's shadow map
  through a new optional `drawShadow` layer hook.
- **Hero quality:** at hero size petals are tessellated finely (52 × 27 per
  blade), ruffles stay near the margin so blades read as smooth, fleshy cups,
  and inner petals follow ordered spirals or whorls with consistent cupping.
  Fine longitudinal veins appear as a petal grows on screen and fade out when
  it is small. Bases are deeper and more saturated; margins are lighter, with
  a thin edge highlight. Thin tissue gets a soft subsurface fill, so no part
  falls flat and unlit. Stalks have a satin sheen, a taper and small nodes
  where leaves join.
- **Edge anti-aliasing:** petal and leaf margins compute coverage from screen
  derivatives and write it as an MSAA sample mask. The alpha channel stays
  free for the painterly filter, so this replaces alpha-to-coverage.
- **Hero mode:** `FlowerHero` renders one flower large on a deep, softly
  brushed ground with studio light from the upper left, the light colour
  following the sky time. It turns slowly, about one turn per 40 seconds, and
  stays still under reduced motion. It frames the whole plant or a close-up of
  the bloom. There is no Kuwahara pass, so close-ups stay crisp. A
  hue-preserving filmic tone map keeps saturated reds modelled instead of
  clipping flat. A wide, soft bloom and a petal-tinted aura hug the flower,
  and they brighten at night.
- **Development gallery:** `/dev/flowers` shows the 13 types × stages,
  × seeds, one type × seeds × stages (including the dandelion puff and
  hydrangea mood colours), and the hero mode. It is available in development
  only and returns 404 in production. `/dev/world` now shows the real flowers
  instead of placeholders.

### Recorded choice: lakeside house landing ([#180](https://github.com/C0derTang/shared-garden/issues/180))

The landing at `/` is a second composition of the shared world renderer
(`composition: "landing"`), not a separate engine. It reuses the sky, the
painterly filter, the water, the stroke primitive, the WebGPU gate and the
device-loss handling.

- **Composition:**
  - A wooden house front stands in a forest clearing. It has a fieldstone
    foundation and chimney, honey clapboard siding, slate shingles and cream
    trim. Its covered porch has posts, railings, wide steps and flowering
    hydrangeas. Window boxes hold geraniums.
  - Warm six-pane windows and two iron lanterns flank a red plank door, which
    is the focal point.
  - Stepping stones lead up to the house. The clearing has long grass and
    wildflowers, with mixed conifers, broadleaves and birches around it.
  - The lake opens on the viewer's left toward the garden's far shore and
    mountains.
  - There are no mounds.
- **Orientation:** the viewer faces north with the lake to the west. The low
  evening sun lights the lake side, and the house front takes raking golden
  light for much of the year. The sky follows the same Los Angeles solar time.
  The windows and lanterns warm as the sky darkens. A warm local lamp (a
  `World` uniform that the garden leaves off) lights the porch, the path and
  the nearby grass.
- **Visitors:**
  - Visitors see only the scene and a handwritten "log in". It floats above the
    porch and is a plain POST form to `/auth/start`, so it works without
    JavaScript.
  - Until the world places it, "log in" waits low in the middle of the scene.
  - Visitors see no other text or links.
- **Members:**
  - For members, the door's edges and its little window breathe with warm light,
    and "come in" floats above the porch. A small "old garden" link sits in the
    corner.
  - "come in" is a real link to `/garden`, so it works before scripts run;
    scripts turn a plain click into the walk-through, and its start is
    announced to screen readers ("Opening the door. Walking into the
    garden…").
  - Tapping the words or the painted door plays a 4.8-second walk-through. The
    camera walks up the path and the door swings about 104° inward as warm light
    spills out. The camera then climbs onto the porch and pushes through the
    doorway into the lit room.
  - The walk-through dissolves into a warm light overlay, then navigates to
    `/garden`, which is prefetched.
  - If the walk-through never reports its end, the landing navigates after 7
    seconds.
  - With reduced motion, the landing crossfades into the warm light for 450 ms
    instead.
- **Fallbacks:**
  - Without WebGPU, visitors see "This house is painted with WebGPU." with a
    working "log in". Members get "come in" (`/garden`) and "old garden"
    (`/legacy`).
  - After a failure, the same controls appear under "The painting stopped."
    with a reload button.
- **Sunset home:** the sunset home from
  [decision 0066](0066-private-sunset-home.md) is unrouted. Its components,
  `lib/landing`, `/api/home/*`, its media and its tests remain. The new
  landing reuses the guarded `loadLandingAccess` membership check.
- **Development preview:** `/dev/landing?sky=dusk&member=1` shows a fixed sky
  and the member view without a session. It is available in development only
  and returns 404 in production.

### Recorded choice: the garden page and flower activities ([#181](https://github.com/C0derTang/shared-garden/issues/181))

Conservative choices for the new `/garden`, made under this decision's
discretion and the look in "World look":

- **The page:** `/garden` is the full-screen painted world, fed by
  `v2_current_garden_state` and its Realtime channel with the same sync rules
  as the legacy garden (shared through `useGardenSync`: Realtime invalidation,
  focus and 30-second reads, a server-calibrated clock, boundary refreshes and
  one guarded save at a time). The only chrome is "our garden" floating over
  the lake and two small handwritten links in the corner, "home" (`/`) and
  "old garden" (`/legacy`). A hint, "scroll to wander closer · tap a flower to
  visit", floats at the bottom until the first scroll, drag, key or tap. The
  page is members-only (`requireMember`); `/garden?flower=<id>` opens that
  flower directly. No development showcase controls appear on the page;
  `/dev/world`, `/dev/flowers` and `/dev/landing` are unchanged and still 404 in
  production.
- **Floating words:** every flower has its lower-case name floating above it
  (Gochi Hand, soft glow). Names fade in as the camera walks closer (within
  about 6.4 world units) so the overview stays a painting; a focused name always
  shows (names outside the view are pinned inside the screen edge, by their own
  size, while focused). A flower whose care is open for you is bright; the rest are quieter,
  and "♡" follows the name when your partner cared and you have not yet. Each
  name is a real link to `?flower=<id>` with an accessible name that says the
  stage, growth and who has cared today. "plant a seed" floats above the next
  empty spot ("tap a glowing seed to plant" while the garden is empty). Names
  outside the view stay keyboard-reachable (invisible until focused).
- **Visiting a flower:** tapping a flower or its name glides the camera to a
  close, raised look at it (about 0.95 s) that frames it where the painting
  will appear, then the split view opens and the world stops painting new
  frames behind it. Closing glides back. Reduced motion and arrival by link
  open at once.
- **The split view:** a modal dialog (Radix) with the flower's own procedural
  render (`FlowerHero`, the exact type, seed, growth, mood colours and puff) on
  the left half and its activity on the right half, over a translucent dark
  umber wash with canvas grain. Behind the flower the painting shows a darkened,
  colour-graded impression of the garden for the time of day: the sky over a
  hazy, ragged horizon and a dim meadow in loose dabs and leaning brush
  strokes, under the studio's canvas tooth and vignette, kept well below the
  flower so its colours and aura lead. Focus starts at the flower's name, stays inside,
  and returns to the flower's floating name; Escape, "×" or "back to the
  garden" close it. Seedlings stay small in the painting (a minimum framing) and
  grow into the frame. Text is cream on the dark wash (above WCAG AA); headings
  and controls are handwritten, entries are set in the display serif.
- **Phones and portrait screens** (up to 760 px wide, or portrait up to
  1100 px): the split view stacks, with the painting on top at 45% of the
  viewport height and the panel scrolling below it. The panel's title names the
  flower, so the painting keeps only its stage words there.
- **The panel:** growth as "x of y" with painted dots and "It grows by one when
  you both care on the same garden day. Nothing is ever lost."; who has cared
  today; one cue from the shared care rules without decay; today's cards (your
  partner's first once it has something) with the shared entry form, your entry
  with "edit" during the 30-minute window, your partner's entry and reply
  threads; then "earlier days" on request, each with its replies. After a
  share, "next: <flower>" offers the next flower waiting for you. Bloomed
  flowers that need no more care say so and show only today's entries.
- **Per flower:** Rose, Marigold, Snapdragon, Moonflower, Dandelion and
  Forget-me-not take a note with a type-specific placeholder; the Cactus is a
  one-tap "I'm here"; the Tulip has Spotify search, manual song fields and the
  song player; the Daisy shows today's light or deeper question; the Hydrangea
  shows each member's latest colour and today's blend ("color of the day"), and
  its florets in the world and the painting take both members' colours; the
  Moonflower shows "opens at 10 p.m." and keeps a draft outside its window; the
  Dandelion shows its wish and, once bloomed, "our wish came true" then "blow
  the seeds" after a confirmation. Sunflower, Bluebell and Peony grow and show
  their painting with "coming soon" for their activity (#182). Until then they
  are never treated as due: their names stay quiet, their accessible names say
  nothing about care, and "next" never offers them. One predicate
  (`hasCareActivity` in `lib/garden-v2/flowers.ts`) decides this, so #182 only
  adds each type to it.
- **The Dandelion in the world:** growing, it shows its golden head; bloomed
  and waiting on its wish, a seed puff; once fulfilled, its seeds have flown and
  it shows its golden head again as a keepsake.
- **Planting:** tapping a glowing seed mark or "plant a seed" glides to the spot
  and opens the same split view: the left half paints the chosen type in bloom
  from a fixed preview seed ("every seed grows its own way"), the right half
  lists all 13 flowers with a line about each activity and how long they take
  to bloom. The Dandelion asks for its shared wish (1–500 characters). After
  planting, the new flower opens so today's care is one tap away.
- **While you were away:** a handwritten note floats over the scene listing
  what your partner planted and cared for today, what grew, bloomed or had its
  wish come true since your last visit in this browser. It keeps only flower ids
  and growth numbers in local storage per member; a first visit or unreadable
  storage shows nothing. "lovely, thanks" dismisses it.
- **Shared logic:** the legacy and new gardens share the mood palette and pick
  rules (`lib/garden/moods.ts`), entry validation and payloads
  (`lib/garden/entry-draft.ts`), today's care rules with decay only for the
  legacy garden (`lib/garden/care.ts`), the sync hook and the reply thread,
  which now takes its read and save actions. The legacy garden's behaviour is
  unchanged.
- **Flower rendering follow-ups:** a changed flower set is generated, packed,
  uploaded and compiled in a task outside the frame callbacks (the previous
  flowers keep drawing) and swapped in when ready; the shared camera uniform is
  written once per frame; growth is quantised downward so a fraction just below
  a stage threshold never rounds into the next stage. A bloomed flower averages
  about 21,700 triangles at world detail. On the real page on a desktop Apple
  GPU, both 15 and 100 bloomed flowers held the display's 120 fps (95th
  percentile frame 9.5 ms), with no dropped frame when a flower was planted
  live, so no distance level of detail was added. Phones were not measured;
  revisit level of detail if a phone garden grows past about 60 flowers.
- **Softer Peony and Marigold blooms:** their petals have smaller, broader
  ruffles and rounder tips, the Marigold has five to seven rings and a full
  Peony 28 to 38 inner petals, so the hero blooms read as petals rather than
  shards.

### Recorded choice: night fireworks ([#184](https://github.com/C0derTang/shared-garden/issues/184))

Conservative choices for the fireworks named in "New garden look and
interaction", made under this decision's discretion:

- **When it is night:** from the real sunset (the sun's upper limb at −0.833°,
  computed with the world sky's own sun for the Los Angeles reference point)
  until the next 4 a.m. America/Los_Angeles rollover. From midnight to 4 a.m.
  it is always the same night; from 4 a.m. to noon a dark sky is the new day's
  dawn, not the night. Wall-clock hours come from the time zone, so both
  daylight-saving transitions keep the boundary at 4 a.m. local time. The
  instant is the garden's server-calibrated clock.
- **Which achievements count:** any new-garden award whose `earned_day` is the
  garden day of that night (so at 1 a.m. the previous calendar day's awards
  count). The garden reads `v2_awards_for_day` for that day only at night: on
  opening, when the garden day changes, when garden activity changes and every
  three minutes. An award earned at night while the garden is open counts too.
- **Once per member per night:** the show plays by itself the first time the
  painted world is ready and nothing covers it, and the browser remembers the
  garden day in local storage (`garden-v2:fireworks:<member slot>`, the day
  only). It is marked seen when the show's first frame paints. A later visit
  that night offers only a small handwritten "replay fireworks" in the
  bottom-right corner while it is still night and the award holds. Storage is
  per browser, so a member may see the show once on each device. When storage
  cannot be read, the show never plays by itself (it could otherwise repeat on
  every visit) but the replay is still offered.
- **The show:** about 34 seconds (33 to 35, seeded by the garden day and
  varied per replay). Rockets with glittering trails rise from the water and
  burst over the lake, framed between the trees and to the right of the moon
  (world x −9 to 25; −9 to 13 on narrow portrait screens). It opens with three
  single shells. It then builds through overlapping volleys of two to four
  shells. The finale bursts eight shells at once, then a second wave of four.
  It ends with three willows whose golden embers fall slowly over the water.
- **Shells:** each has 150 to 400 stars. The types are peony (with a coloured
  pistil, some stars glittering), chrysanthemum (long comet tails),
  willow (hanging golden strands), ring, heart and crackle (white pops on dim
  embers). The colours are gold, rose, violet, teal, white, coral, green and
  blue. Each star drifts from its shell's colour to a second hue as it burns
  (for example gold to rose, or teal to violet), then cools to embers.
- **Rendering:**
  - A compute pass (vgpu) simulates about 13,000 particles (a pool of 24,576)
    from records written once per show. It applies gravity, air drag and a
    slow breeze that carries embers as they slow.
  - Sparks draw as camera-facing streaks stretched along their motion, in
    HDR far above the night sky, so the world's glow gives them soft halos.
    Hues are deepened before tone mapping so colours stay coloured.
  - Their cores opt out of the painterly filter (scene alpha −1, the same
    path as the flowers' close-up detail). They stay crisp and luminous,
    while the canvas streaks and the bloom still paint over them.
  - Each burst lights the air around it with a soft, mottled glow that cools
    into smoke of its second hue and fades over several seconds.
  - Sparks and glows also draw, brighter, into the lake's mirror image, so the
    water carries strong reflections.
  - The open bursts throw a coloured flash on the meadow, shore and tree
    edges through the world's local lamp, which now has a colour and falloff
    (the landing's porch lamp is unchanged).
  - While the show plays, the sky deepens by up to 30%, and the moon and its
    glitter on the water dim by up to 75%. This eases in and out over the
    first and last seconds.
- **Caption:** while the show plays, a gentle handwritten line reads for
  example "✦ for today’s achievement: First seed planted". Several titles are
  joined with commas and "and". It has a soft warm glow and rests below the
  sky's action: over the far shore on wide screens, and low above the hint on
  phones. It is a polite live region and catches no pointer events.
- **Reduced motion:** a still sky of five open bursts (peony, ring,
  chrysanthemum, heart and willow) spread across the burst lane, with their
  glow, reflection and the dimmed moon. It is held for 16 seconds and then
  faded over 1.4 seconds. The words and the replay control do not animate.
- **The split view and picking:** the show's clock advances only while the
  world paints, so it pauses behind the split view and the planting view and
  resumes when they close. The caption and the replay hide while they are
  open. The fireworks draw only inside the world, so flower and seed picking
  is unchanged.
- **World hooks:** layers gain an optional `update` hook that runs first in
  each painted frame (compute work, and a light and sky dimming for the scene)
  and an optional `drawReflection` hook for the lake's mirror image. The
  `World` uniform gains `lampColor`, `lampFalloff` and `showDim`.
- **Development showcase:** `/dev/world` has "fireworks" and "still fireworks"
  buttons and shows a sample caption (development only, 404 in production).
