# 0071 — Free walking through the type areas

Status: the user approved WASD/arrows, touch movement and click-to-walk on
2026-11-26 in [#220](https://github.com/C0derTang/shared-garden/issues/220).
Clicking a flower opens its activity. This supersedes the constrained scroll
journey for GardenV2, extending [0070](0070-flower-type-areas.md). Prerequisites
[#218](https://github.com/C0derTang/shared-garden/issues/218) and
[#219](https://github.com/C0derTang/shared-garden/issues/219) are merged.
The following exact choices use the discretion in
[0067](0067-garden-overhaul.md) and [0004](0004-finalized-launch-rules.md).

- Movement is a local camera position, never an avatar, shared position, saved
  preference or backend mutation. Hold WASD/arrows while the world or its pad is
  focused. Opposed directions cancel; diagonals normalize. Speed is four world
  units per second using elapsed frame time, including reduced motion. The
  reduced-motion setting removes idle drift and close-up/arrival travel, while
  retaining intentional walking. Idle drift and pointer parallax are disabled
  for this camera so its visible position obeys the terrain boundaries.
- A small labeled arrow pad in the lower left has four 44-pixel targets. Pointer
  holds walk continuously; keyboard/screen-reader button activation takes a short
  step. At every viewport width the first-use hint sits above the pad, leaving its targets
  unobscured. The persistent pad and first-use hint explain walking; the guide now
  describes the same controls. Full-screen views and scoped sheets hide the pad.
  The retained accessible plot list provides direct access to every flower and
  planting area, including offscreen plots.
- Primary click/tap picks a flower or seed first; only otherwise does a valid
  ground ray/heightfield intersection set a destination. Type-name controls and
  all other UI own their events. A drag past six CSS pixels is permanently a
  drag for that press, including an out-and-back gesture. It neither visits nor
  starts walking. Wheel/swipe journeys are superseded for GardenV2, and no
  plot-stepper is restored. Landing and the default dev showcase keep their
  existing navigation; the showcase can opt into walking with `walking=1`.
- A ground destination stops on arrival, interruption or the first obstruction.
  There is no automatic obstacle-routing promise; walk around it and choose
  again. New directional input cancels a destination. Key release, window blur,
  visibility changes, focus leaving the world/pad, pointer cancellation/lost
  capture, overlays and arrival clear held input. Repeated keydown events after
  an interruption cannot restart walking without a fresh press. Fields never
  own movement keys, including drafts in scoped sheets.
- Terrain is the shared meadow heightfield. The camera is 2.5 units above it,
  looking twelve units ahead with the retained portrait tilt. Initial depth
  matches the expanded overview. The title is lowered to height seven to stay
  in that downward view. Focus blends toward the existing flower close-up and
  back to the unchanged walked position. Movement remains blocked until that
  return settles; the landing's existing warm-light arrival is preserved.
- Bounds extend two units beyond each outer bed rim and ten beyond the furthest
  module, using the authoritative type-area layout. The lakeshore has a 1.2-unit
  dry-side margin. Solid obstacles use the actual shared shoreline/foreground
  rock positions and framing-tree trunks. Rocks receive 1.2 times their mesh
  radius plus a 0.25-unit margin; trunks use size times 0.35 plus 0.25. Low bed
  edging, flowers, reeds and grass are step-over meadow, rather than inaccessible
  islands. Analytic circle sweeps and terrain samples at most 0.08 units apart
  prevent large elapsed times from tunneling through solids or the shore. A
  clear approach nine units behind every mapped flower/seed remains reachable,
  including distant expansions; regression tests verify both viewport sizes.

No flower identity, spot address, catalog rule, growth, activity, history, media,
privacy, authentication, schema or legacy behavior changes. The optimized WGSL,
immutable reference and quality/resolution budgets from
[0069](0069-measured-kuwahara-optimization.md) remain unchanged.

## Verification

Movement/input regressions exercise real navigation and DOM event handlers.
The existing type-area browser harness is extended with held movement, trusted CDP touch input at
phone-sized viewports, click/drag priority, ground destinations, interruption,
scoped drafts, repeated planting and original-UUID history. Loopback-only
synthetic action responses remain fail-closed. The development fixture can
simulate the real client-mounted arrival and a scoped sheet; its route still
returns 404 in production, with no authentication or real garden access.
Only the Next.js development debug badge is hidden by the browser harness,
because it overlaps the lower-left pad; production UI is not masked.

`profile-walking.mjs` uses separate ABBA pairs: the immutable pre-218 shader
against the optimized shader in the walking scene, then the retained type-area
journey scene against free walking with the optimized shader. Both use fixed
dusk/reduced motion, identical 26 synthetic flowers, viewport and quality settings. The terrain-following eye height and downward view differ,
so these measure representative scene cost, not identical composition or an FPS
improvement. Historical #218/#219 measurements remain separate evidence. Phone
emulation uses the same Mac GPU, not actual mobile hardware. Required lint,
typecheck, full tests, production build, WGSL and native paint checks, browser
observations, timing and limitations are recorded with the PR before review.

Start an isolated development server on port 3221, supply external browser paths
if needed, and run the following sequentially (never concurrent GPU workloads):

```sh
node scripts/profiling/check-type-areas.mjs
node scripts/profiling/check-walking-arrival.mjs
node scripts/profiling/profile-walking.mjs
node scripts/profiling/summarize-walking.mjs
npm run test:paint
```

`PLAYWRIGHT_MODULE` and `CHROMIUM_EXECUTABLE` select an independently installed
Playwright and browser. `BASE_URL` and `PROFILE_OUTPUT` override the loopback
origin and output directory. Defaults save interaction, normal-arrival and timing
artifacts under `/tmp/ccapp-220-interactions`, `/tmp/ccapp-220-arrival` and
`/tmp/ccapp-220-profile`. The main interaction harness also accepts `EMPTY_ONLY=1`
for a focused empty-scene recheck. Null interaction fields mean that scenario did
not exercise the check; they do not represent failures. Pointer seed/drag checks
are specific to empty scenes, and original-UUID history checks to populated ones.

[Timing summary](../evidence/0220-walking-performance.json) retains all pairwise
medians, p95 and per-run medians. On the same Mac/Chromium156 setup, 160 retained
samples per variant/pair/viewport give GPU envelope median/p95 milliseconds:

| Pair | Desktop | Phone-sized emulation |
| --- | --- | --- |
| Same walking view, pre-218 shader | 8.292 / 9.779 | 8.473 / 9.391 |
| Same walking view, optimized shader | 8.808 / 10.466 | 8.522 / 10.753 |
| Retained 219 camera, optimized shader | 6.176 / 6.805 | 9.348 / 10.440 |
| Walking camera, optimized shader, camera pair | 6.322 / 8.304 | 7.586 / 10.321 |

These are stationary render samples with timestamp/readback overhead, not active
walking latency or end-to-end FPS. Separate ABBA pairs show considerable variation;
the earlier shader speedup is **not reproduced** here, including worse optimized
median/p95 results in the same-view shader pair. The camera pair changes framing
and eye height, so its phone improvement is not a general speedup claim. Submission
interval medians stay approximately16.6–16.7ms. Historical218/219numbers remain
separate-session/composition evidence. No repeat run was selected to replace an
adverse result. Raw1280frames and16screenshots remain in the timing output.
The unchanged optimized shader still matches its immutable native-GPU reference
within0.0000111461maximum linear-color error against0.00002fixed tolerance; no
shader arithmetic or quality/resolution setting changed in this issue.

[Interaction summary](../evidence/0220-walking-interactions.json) records the four
reduced-motion scenarios, final empty-scene rechecks and normal-motion arrival.
The original unchanged renderer/landing browser harness also passes both widths,
including original journey/drag, stages, night/fireworks and device-loss recovery.
Final focused regressions pass113tests in10files; lint, typecheck, production
build, full WGSL validation and native paint pass. The full local suite passes
1402tests with three skipped and the six already-known `audio_unavailable` Mac
normalization failures; no audio code changed. Separately run downstream Node
suites pass55tests. Full Linux CI and fresh independent exact-head review remain
merge gates.

An actual production server on loopback returned404 for `/dev/garden-areas`, its
empty and arrival/scoped-sheet variants, `/dev/world?areas=1`, its walking variant,
and the member landing showcase. Neither the synthetic UUID nor scoped-draft
fixture text appeared in those response bodies. The temporary production server
was stopped after guard validation. No database checks were run locally because
this issue changes no backend/schema/data; the required CI database gate remains.


## Responsive review correction

Independent review of PR223 at `4509be35a28a4f591a18c75d4d0f78336e9dabb2`
found the first-use hint overlapping the right arrow at844×390 landscape-phone
and800×600 narrow-desktop sizes. The original spacing was confined to the
portrait/narrow media query. Its safe-area-aware bottom offset now applies in the
base hint rule at every width; the portrait text-wrapping rule remains.

`check-walking-layout.mjs` runs the actual synthetic GardenV2 at1280×800,
390×844,844×390 and800×600. It records hint/pad rectangles, requires at least eight
CSS pixels of separation, checks the hint fits the viewport, and verifies all
four44px controls are inside the viewport and unobscured. Trusted CDP touch holds
at phone sizes and mouse holds at desktop sizes must move the real camera and
stop on release. The same test was observed red against the reviewed CSS at
exactly the two reported sizes before the correction. It hides only the Next.js
development badge and uses the same fail-closed loopback synthetic actions.
Run `node scripts/profiling/check-walking-layout.mjs`; optional browser/origin
variables are as above and `PROFILE_OUTPUT` defaults to
`/tmp/ccapp-220-responsive`. See
[responsive evidence](../evidence/0220-walking-responsive.json) for geometry and
input outcomes. This changes hint placement only; camera, movement, activities,
shader/reference and quality settings are unchanged. Independent review and all
required CI must apply to the corrected exact head before merge.

All four corrected viewport cases pass with10.609375CSSpx vertical separation;
each hint and all four44px targets fit the viewport, all target centers remain
unobscured, and every directional hold moves the camera and stops on release.
There are no browser page/console errors. The prior wide/portrait layouts also
pass the same geometry/input assertions. Raw before/after geometry and eight
screenshots remain in the respective responsive artifact directories.
