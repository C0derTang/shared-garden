# 0074 — Garden clarity, lakeside composition and daily visits

Approved user direction, 2026-11-27: address flower visual priority, orientation
and the effort of routine daily visits while preserving the feeling of a garden.
The flower picker contains only flower names and pictures. Bring the garden near
the original lake where physical fit and retained original-site rules allow.

[0004](0004-finalized-launch-rules.md) and [0067](0067-garden-overhaul.md)
authorize documented conservative exact layouts and wording.
[0069](0069-measured-kuwahara-optimization.md) and
[0073](0073-compact-scrolling-garden.md) remain authoritative for fixed render
quality, original site, true identities, continuous native input and retained
route/camera frames. No care, growth, private content, identity, backend, schema,
capacity, legacy, cost or service rule changes.

Three atomic issues execute in dependency order: orientation
[#228](https://github.com/C0derTang/shared-garden/issues/228), then lakeside
visibility/readability [#229](https://github.com/C0derTang/shared-garden/issues/229),
then quicker existing daily interactions
[#230](https://github.com/C0derTang/shared-garden/issues/230). The latter two
are approved intent, not a finalized spatial design or implemented action here.

## Orientation choices under existing discretion

- A quiet handwritten current-place cue and a small passive route-position mark
  sit outside the picker. Actual accepted tour distance and semantic tour-stop
  metadata are their only authority; they never navigate or select a camera.
  This passive position mark narrows 0073’s earlier removal of route markers;
  fixed-stop selectors and navigation controls remain removed.
- Porch, woodland, overlook, all 13 flower types, occupied terraces, meadow bend
  and return remain distinct without assumptions about woodland stop count or
  only first type anchors. Ordinary accessible text avoids live announcements
  on every native input frame. The context contract is independent of geometry.
- Current type styling/aria-current and focus on picker open use that derived
  context. Exactly 13 canonical static picture/name-only rows remain.
- The existing guide describes scrolling, choosing a picture/name in the flower
  picker, tapping an actual flower to visit and a seed mark to plant. The existing
  waiting-care heart is explained outside the picker. No new navigation mode,
  permanent task list or daily-action shortcut is introduced.
- Safe areas, global chrome, actual targets and existing reserved rectangles
  determine cue placement. Cues take no pointer events. The note prefers a safe margin and retains it
  while clear; a small deterministic set of margin slots clears actual projected
  flower/seed/heart envelopes and reserved chrome/text. A wholly clipped world
  envelope is excluded before screen reservation so near-plane estimates from
  offscreen plants cannot cover the whole viewport. Crossing stems/heads remain
  protected. If no safe slot exists, the note temporarily steps aside. It is
  hidden while the picker is open. The actual submitted view is the projection
  authority. Unchanged frames return before DOM/layout reads; React commits and
  note ResizeObserver invalidation cover word/target/chrome/size changes.
  Existing status text, fireworks replay and private notice surfaces also
  reserve space. A content-only MutationObserver catches sibling notice changes
  without observing the per-frame caption style attributes.

[Design](../superpowers/specs/2026-11-27-garden-ux-design.md) ·
[Plan](../superpowers/plans/2026-11-27-garden-ux.md).

All canonical issue/builder/independent exact-head review, current CI/protection,
merge and cleanup gates apply. Later issues consume the merged orientation
contract and receive their own isolated builders.

## Orientation verification

[Evidence](../evidence/0228-garden-orientation.json) records 20 synthetic browser
cases/500 semantic places at four sizes, with zero target/heart collisions or
suppressed notes; six actual landscape flower taps return to the exact uploaded
camera. Current picker focus/ARIA and strict 13 picture/name rows, live notice
adaptation,16 established native cases, four remap/lifecycle cases and two
interruption cases pass. Lint, typecheck, build, Node 55 and actual-production
fixture404 checks pass. Full Vitest has 1482 passing, three skipped and only six
known Mac audio-tool failures; complete Linux Web CI remains required.

Exact base Git-object execution preserves actual tour geometry, arc/native
mapping, path/ground/meadow buffers and Float32 camera matrices at every tested
leg/fraction/aspect.357 other source/portrait/dependency files are byte-identical.
Native handlers, remap/freeze/cancellation and sampling functions also retain
exact source identity. Original paint/WGSL/house/front evidence is retained with
its own metadata; no baseline or quality tolerance is replaced.

A temporary local timing wrapper around the actual callback was restored
byte-for-byte after sampling normal-motion 78-plant desktop/phone scenes. Quiet
frames mostly take the cached path; its p95 is 0.1ms on this Mac. Travel placement
p95 is 0.2ms in both sampled sizes. This short callback sample is no universal
hardware or FPS claim. Phone/touch checks are browser emulation.
