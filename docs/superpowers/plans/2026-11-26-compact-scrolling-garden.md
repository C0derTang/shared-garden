# Compact scrolling garden Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development within the repository's dedicated-builder workflow. One builder owns this atomic scene/navigation contract; root dispatches fresh independent review. Do not spawn implementation agents that share the checkout.

**Goal:** An attractive compact full-bloom garden usable by continuous scroll and a right-side flower picker, with clearer rear woodland and the original front appearance.

**Architecture:** A pure compact planting/tour contract owns stable per-type addresses, the main path, cumulative arc distance, flower anchors and aspect-aware sampled camera pose. A native pinned-world scrollport and the flower drawer share one progress authority. Existing renderer/model/activity/privacy mechanisms remain; static canonical portraits avoid extra live GPU contexts.

**Tech Stack:** Existing pinned Next.js/React/TypeScript/vgpu0.6/WGSL stack, no new service or runtime dependency.

**Spec:** Current user direction and /tmp/ccapp-scroll-garden/design.md; builder versions docs/decisions/0073-compact-scrolling-garden.md and docs/superpowers/specs/2026-11-26-compact-scrolling-garden-design.md before product code.

## Global constraints

- Original house frame, lake/terrain/sun, front appearance/entry and far forest stay authoritative. Only documented near-forest thinning is newly authorized.
- Adjacent/non-round beds are explicitly allowed; mature-bloom organization and ease take priority over previous islands.
- Two navigation methods: continuous scroll and right flower picture/name picker. No old fixed-stop chrome or free walking in GardenV2.
- Persisted data/rules/privacy/backend/legacy unchanged; actual plants plus13 targets determine work, not maximum address.
- Preserve primary user changes and unrelated worktrees. Use a dedicated managed worktree from current fetched origin/main, issue-numbered codex branch, record base.

## Review focus

1. Native touch scroll versus tap/drag picking; panel/overlay scroll must not move the world or create stale input.
2. Compact stable per-type mapping with planting timestamps/ties/lower holes and distant IDs; actual mature crowns must stay readable/reachable.
3. One sampled tour pose/distance across scroll/picker/rendering/picking, including reverse, smooth turns, arrival, focus return and layout updates.
4. Near thinning opens the garden while actual original front composition, shadows and entry still match saved references, with one static shared site.
5. Full-bloom performance, static icon assets, GPU lifecycle/recovery and production fixture isolation.

## Task1 — establish the spatial and scroll contract

Files primarily src/lib/garden-v2/type-areas.ts, src/lib/world/scenic-route.ts or a focused new garden-tour.ts, layout/site-surface helpers and tests.

- [ ] Read current guidance/issue and verify prerequisites; create native managed detached worktree then issue branch from fetched current default tip; record base.
- [ ] Read installed vgpu0.6 docs and scene guide; do not upgrade dependencies.
- [ ] Specify concrete compact full-bloom bed map, stable packing/tie rules, main directed tour and cumulative-distance/anchor APIs, progress retention and expansion behavior. Record conservative choices in0073/spec/plan and link issue BEFORE core edits. Escalate only genuinely uncovered choices.
- [ ] Add meaningful failing tests for compactness/13zones, stable growth/append/lower holes/refresh/ties, sparse bounds, mature crown/path clearance, continuous sampled pose/heading/FOV and semantic progress retention.
- [ ] Implement the minimal shared layout/tour mapping. Preserve existing per-plant IDs/seed/history/action dispatch. Ensure all actual/next targets have reachable views without sparse empty mileage.
- [ ] Run focused checks and produce actual source site map plus empty/mature representative camera views. Correct composition before broad verification.

## Task2 — clear rear views without changing the front look

Files src/lib/world/landing.ts or focused shared static near-forest helper, renderer caster selection, original authority/visual tests and source map.

- [ ] Save immutable original-front renders and source authority before thinning, all four sizes/day-dusk-night and entry frames.
- [ ] Define a small static near-forest subset and apply the same thinning to both views, preserving RNG/other landmarks and front-facing crowns/trunks. No private state or view-specific fake forest.
- [ ] Test allowed subset and unchanged house/terrain/lake/far geometry. Compare actual front images/shadows/silhouettes to original, quantify/manual-inspect differences; preserve the reference and document the intentional exception to0072.
- [ ] Show early actual front/rear and full-bloom scroll views to root. Fix concrete visibility/fit problems, without broad clearing or repeated speculative polish.

## Task3 — native smooth navigation and picture/name drawer

Files GardenV2/GardenWorld/renderer and CSS/tests; focused drawer component plus canonical static flower portrait assets/generation script if needed.

- [ ] Failing regressions: native wheel/trackpad/touch change shared tour distance; picker lands on same type anchor; reverse and interruption are smooth/clamped. Remove old stop-only controls and routes from the product.
- [ ] Implement native pinned-world scrollport and single progress authority. Page keys work only in intended focus; scrolling is blocked/discarded for covered/typing/arrival/return states; reduced motion is immediate.
- [ ] Create13 lightweight canonical mature-flower pictures; drawer options contain picture/name only. No emoji, private content, counts or13 runtime GPU canvases.
- [ ] Drawer trigger/selection/escape/outside/focus/own scrolling meet desktop/phone bounds and don't leak gestures into the world. Selecting navigates and closes; actual flower activity remains separate.
- [ ] Verify exact progress/heading on activity return, growth/plant updates, resize, blur/visibility, held-frame races and actual device loss/recovery. All picking/seed/care anchors consume the actual sampled pose/lens.

## Task4 — validate, publish candidate and hand off

- [ ] Actual synthetic GardenV2 browser tests at four sizes: real wheel/small deltas/large gestures, trusted phone touch inertia, keyboard,13 picker images/names/targets, panel scroll isolation, actual flower/seed priority, swipe/cancel rejection, overlay/scoped typing, normal/reduced motion, arrival/return/resize/recovery and sparse/repeated planting/history.
- [ ] Empty/mixed/full-bloom contact sheets and continuous traversal frames; actual original-front comparisons and rear/path/bed map. Inspect mature organization and access, not just sprouts. Keep current-source fingerprints and all failure evidence separate from earlier prototypes.
- [ ] Run lint/typecheck/full npm test/build/full WGSL/native paint/door probe and downstream Node suites as appropriate. Known six Mac audio failures remain honest; required complete Linux CI must pass. No DB reset/migration.
- [ ] Measure representative full-bloom and normal scene CPU/rebuild/render work with unchanged quality and retained raw/adverse samples. Check actual production server fixture404/no state.
- [ ] Inspect staged scope/private content; commit/push one PR with Closes actual issue, return exact base/head/branch/worktree/report/commands/artifacts/limitations/server status. Keep head fixed for fresh review; do not approve/merge.
- [ ] Root obtains fresh independent exact-head review in a separate checkout, records all verdicts, routes corrections to this builder, then verifies allCI/dependencies/protection before eligible merge and safe cleanup.

Builder base0575e83c96ec9c73a56d61fab8edda52df9bdd45; managed isolated worktree226-scroll-garden. Concrete choices: [decision0073](../../decisions/0073-compact-scrolling-garden.md). Read-only issue/spec/dependency sufficiency and vgpu0.6 scene/camera docs completed. Original source render capture precedes implementation; keep retained immutable authority and compare intentional static thinning separately.

Early actual review correction: retain three low/mid species terraces inside the C-room; native scroll begins at garden overlook with backward access to the surveyed actual rear-house/porch. Use documented monotonic per-leg scroll pacing to keep woodland brief and angular turns deliberate. Test exact pixel↔arc round trips, all13anchors, initial semantic position and actual native-scroll rear view before broad checks.

Actual lifecycle regressions require explicit renderer-ready normal close, cancellable picker-only rAF scrollTop writing (native input/inertia unchanged), queued-first-frame cancellation at all boundaries, and reduced-motion latest-position consumption. Actual occupied overflow appends into clear side meadow with a short first connection and semantic endpoint retention; negative-x ground tiles are included. These acceptance corrections are documented in0073; frozen base room/front composition stays unchanged.

Final authoritative choices are consolidated in0073. The occupied expansion is an inland spur after Daisy (first connection7.178964m), with a rounded far turn/parallel return, not the rejected westward line; no negative-x ground modification ships. Full serial16-case browser matrix and final source fingerprint supersede prototype/parallel runs. Genuine original references stay intact; missing original entry sizes are reconstructed in a separate detached immutable-base checkout and labelled honestly. Independent exact-head review/requiredCI and merge/cleanup remain orchestrator gates.
