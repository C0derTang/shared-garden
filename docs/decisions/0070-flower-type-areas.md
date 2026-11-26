# 0070 — Thirteen expanding flower-type areas

Status: the user approved dedicated, automatically grouped, expanding areas for
all thirteen types on 2026-11-26, recorded in
[issue #219](https://github.com/C0derTang/shared-garden/issues/219). Exact layout,
wording and mapping below are conservative choices under
[0067](0067-garden-overhaul.md) and [0004](0004-finalized-launch-rules.md).
This supersedes mixed-type bed organization for the new garden only. The legacy
archive, fixed two-member privacy boundary, activities and no-decay rules remain.
Prerequisite [#218](https://github.com/C0derTang/shared-garden/issues/218) is merged;
its [0069 shader optimization](0069-measured-kuwahara-optimization.md) remains intact.

## Presentation and planting

- Every type owns a meadow lane in catalog order, rose through peony, including
  types never planted. Lane centers are 3.3 world units apart, centered on the
  sunflower. Soil modules keep the existing 1.3 radius and twelve-address golden
  angle arrangement; modules expand away from the lake at 3.1-unit intervals.
  The rims cannot overlap, and the original lake, lighting, painterly pass and
  botanical flower models are retained.
- The immutable persisted spot is the address **within its flower's type lane**.
  Spots 1–12 belong to its first soil module, 13–24 its second, and so on. The
  original spot, UUID, seed, planting evidence, growth, entries, media, wishes,
  history and achievements are neither migrated nor rewritten. Filling an old
  lower-numbered hole cannot shift another flower. No schema or backend change
  is needed; existing transactions still serialize planting and reject conflicts.
- Sparse addresses deliberately remain sparse. Only modules containing flowers
  or the next planting target receive geometry: at most one per plant plus
  thirteen pending modules, regardless of the highest historical address. This
  avoids allocating empty intervening modules. A lane denotes one type area even
  when its used modules are separated by historical gaps.
- Each area has one glowing seed mark for the garden's current `next_spot`, and
  a handwritten type-name control nearby. The thirteen negative marker IDs are
  view-only and stable by type; only the positive persisted `next_spot` is sent
  to the planting action. Opening an area selects that type. The existing type
  picker remains available; choosing another type places the flower in that
  other area and the planting subtitle names its destination.
- **Tradeoff:** `next_spot` remains global. A pending marker and its nearby name
  can move within their lane after any planting, crossing into the next module
  at each twelve-address boundary, even if that type has not been planted. Empty
  pending modules may disappear once their target advances. This does not move
  existing plants or change their soil module, and avoids adding persisted
  presentation state or a destructive reindex. The keyboard area IDs remain
  stable through these changes. Tests cover this boundary explicitly.

## One spatial contract and retained access

`typeAreaLayout` returns the authoritative beds, spots and depth. Soil meshes,
edging, meadow exclusion and marker positions consume those beds/spots. The
flower layer's anchors use the same positions, so picking, focus, care hearts
and Dandelion seed animation follow the actual flower. A zero no-hover sentinel
keeps negative marker IDs from accidentally receiving a hover boost.

The existing sideways drag, horizontal wheel and left/right keys span all lanes.
The retained scroll/swipe/up/down journey covers the extra depth opened by used
modules. Terrain extends beyond the frontmost module as it grows. No free walking
or click-to-walk controls are introduced; that remains
[#220](https://github.com/C0derTang/shared-garden/issues/220).

The hidden keyboard list reads by type, then persisted flower address, with a
planting target after each type. Flower chips and accessible names retain stage,
growth and care status and identify the type area. Named area controls remain
keyboard accessible when projected offscreen, as existing world captions do.
Flower IDs, deep links, split-view histories and focus return are retained.

## Reproducible checks

The new opt-in `/dev/world?sky=dusk&planted=26&areas=1` scene exercises the same
mapping with 26 deterministic flower specs. The original `/dev/world` profiling
scene and immutable Kuwahara fixture are unchanged.

`/dev/garden-areas` renders the actual `GardenV2` interface with the committed,
validated synthetic JSON fixture. `?empty=1` starts it empty. Both development
routes return 404 in production. They do not create a sign-in or bypass access to
any real garden. Run a local development server on port 3219, then:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
CHROMIUM_EXECUTABLE=/absolute/path/to/chromium \
node scripts/profiling/check-type-areas.mjs
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
CHROMIUM_EXECUTABLE=/absolute/path/to/chromium \
node scripts/profiling/profile-type-areas.mjs
```

`BASE_URL` and `PROFILE_OUTPUT` override the defaults. The interaction harness
requires loopback and intercepts Next action responses by the running local dev
manifest's exported function names. It refuses unexpected actions and external
requests. No real action, session, database or private content is used. It opens
all thirteen planting areas at desktop/phone widths in empty/populated states,
plants two repeated roses, checks the original synthetic plants are unchanged,
and loads an earlier history entry through the original flower UUID. It also
checks actual camera projections change with retained keyboard navigation and
pointer-picks an outer-area seed. Results and screenshots are written to
`/tmp/ccapp-219-interactions`.

The profile harness uses the same optimized shader in both mixed and type-area
layouts, fixed dusk, reduced motion, the same 26 flower seeds/growth, four-second
warmup and ABBA order. It retains 80 GPU readbacks after dropping the first ten
for each run. Layouts and camera depth differ, so these measurements describe
scene cost, not a like-for-like visual or shader speed comparison. Both desktop
and phone emulation use the same Mac GPU; they do not measure actual phones.

Required checks include focused mapping/picking/planting/history and geometry
regressions, lint, typecheck, production build, full WGSL validation and the native
Kuwahara regression. No database verification is needed for this presentation-only
change. The local full suite has the six known native audio `audio_unavailable`
failures because this Mac checkout has only Linux audio executables; full Linux
CI must pass before merge. Independent review must approve the exact head.

Measured on Apple Metal 3 with Chromium 156.0.8078.4, desktop 1280 × 800/DPR 1
and phone-sized 390 × 844/DPR 2 (same physical Mac). Each layout has 160 retained
samples per viewport. [Machine summary](../evidence/0219-type-area-performance.json)
includes p95 and separate run medians; raw timings and screenshots are saved by
the harness. GPU envelope median is 6.261 ms mixed / 6.539 ms type areas on desktop
and 7.252 / 7.374 ms on phone-sized emulation. Desktop p95 is 7.344 / 9.235 ms;
phone-sized p95 is 9.105 / 8.971 ms. Median submission intervals remain about
16.7 ms. There is substantial run variation, and the new layout draws more soil
modules; no speedup is claimed. The unchanged optimized Kuwahara also passes its
immutable baseline GPU comparison, maximum linear-color difference 0.00001115
against the existing 0.00002 tolerance. No quality or resolution setting changed.

Production verification used `npm run build` followed by `npm run start -- --port
3220`: `/dev/garden-areas`, its `?empty=1` variant and `/dev/world?areas=1` each
returned HTTP 404, with the synthetic flower UUID absent from the response HTML.
[Browser interaction summary](../evidence/0219-type-area-interactions.json) records
the four successful development scenarios and their pointer/history limitations.
