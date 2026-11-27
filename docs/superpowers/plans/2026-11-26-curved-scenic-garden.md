# Curved scenic garden Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Repository AGENTS.md controls: one dedicated builder for this atomic feature, no builder-spawned agents, orchestrator dispatches fresh review.

**Goal:** Replace fixed-heading free walking with fixed scenic stops around rounded planted islands and outer-edge pockets; show an actual rear door/covered porch/steps.

**Architecture:** A pure shared route/layout contract supplies stable type pockets, path geometry, scenic camera poses and route targets. A deterministic navigator interpolates curved segments and orientation, integrated with existing focus/arrival/reduced-motion and overlay lifecycle. Reuse procedural house/landscape/flower rendering and existing synthetic actual-UI harness; keep data/backend and landing front unchanged.

**Tech Stack:** Existing locked Next.js/React/TypeScript, procedural vgpu/WebGPU/WGSL, Vitest and externally installed Playwright/Chromium. No new service/dependency is needed.

**Spec:** Copy approved design to docs/decisions/0072-curved-scenic-garden.md and this refined implementation plan to docs/superpowers/plans/2026-11-26-curved-scenic-garden.md before product code. Source /tmp/ccapp-scenic-stops/design.md and issue https://github.com/C0derTang/shared-garden/issues/224.

## Global Constraints

- Set scenic stops, click/tap plus keyboard/screen-reader equivalents; no GardenV2 WASD/arrow locomotion, directional pad or arbitrary free-walk targets.
- Three rounded connected primary island loops, six island/seven outskirt type pockets, varying inward/outward camera directions, stable sparse satellite loops, actual back door/covered porch/steps on the same house, preserved lake/painterly world.
- Shared deterministic mapping; no persisted IDs/spots/seeds/growth/history/media/activity/privacy/schema/legacy changes.
- Preserve original landing front/door, arrival, close-up return, reduced motion, picking priority, care/seed cues, GPU cleanup/recovery and quality/optimized shader settings.
- Public fixtures/evidence synthetic only; no real private session/backend; four viewport sizes1280x800,390x844,844x390,800x600; development fixtures404 in actual production server.
- Isolated issue224 branch/worktree from fetched default tip; decision/plan first commit; one feature PR with Closes#224; fresh exact-head review and all CI before orchestrator merge/cleanup.

## Review Focus

- Camera turns can place onward/back targets behind it: every stop needs usable pointer/touch and accessible route access at narrow/landscape widths.
- Opposite headings/wrap-around and rapid stop requests can spin or cut across beds/house/lake: test curved continuity, safe corridors, shortest-angle orientation and deterministic retargeting.
- Sparse historical addresses and future planting can strand flowers or inflate geometry: test lower holes, repeated types, used distant sections and stable mapping/stop reach.
- Overlays, blur, resize, arrival and flower return can resume stale transitions: test real DOM/actual UI lifecycle with normal and reduced motion.
- Existing house is currently landing-only; verify the actual rear/occlusion/materials in garden views while landing front/door, shadows/reflection and cleanup remain correct.

---

### Task1: Deliver the approved scenic garden as one atomic feature

**Files and responsibilities:**
- Create pure route/navigation module(s) under src/lib/world/ for stable stops/curves/camera state, with colocated tests. Define concrete interfaces in the versioned plan after reading existing JourneyPose, Bed, TypeAreaLayout and renderer state; keep pure geometry/state independent of React/GPU.
- Modify src/lib/garden-v2/type-areas.ts and tests: type-pocket mapping consumes shared route frames; preserve immutable planted addressing and consistent target/bed IDs. Modify plots/GardenV2/PlantView only where new mapping/route selection requires it.
- Modify src/components/world/renderer.ts, garden-world.tsx and CSS: route-driven pose and stop targets replace GardenV2 walking; integrate existing focus/arrival/pause/recovery without a second competing position system.
- Modify src/lib/world/scenery.ts/landforms.ts and focused path geometry module: visible natural path, shared clearance from pockets/house/solids, deterministic meadow exclusion; reuse existing stroke/mesh patterns rather than adding engine infrastructure.
- Reuse src/lib/world/landing.ts/landing-frame.ts house mesh/material identity for the garden rear view with a documented garden transform if necessary; preserve default landing behavior and verify source-frame normals/visibility.
- Extend synthetic src/app/dev/garden-areas and scripts/profiling checks for actual scenic UI, route views/contact sheets, responsive layouts, history/planting and performance. Keep old baseline shader/fixtures and source performance evidence unchanged. Update guide/hints to match actual stop interaction.
- Version decision0072, this refined plan and concise synthetic evidence. Preserve unrelated user changes.

**Concrete shared interfaces (before product code):**

`src/lib/world/scenic-route.ts` owns `ScenicIsland { id; center: Vec3; radiusX; radiusZ }` and fixed type pocket frames `{ islandIndex; side; row; placement; angle }`, plus `ScenicStop { id: string; label: string; pose: JourneyPose; typeIndex?: number; section?: number }`, `ScenicEdge { id: string; from: string; to: string; points: readonly [Vec3, Vec3, Vec3, Vec3] }` and `ScenicRoute { stops: readonly ScenicStop[]; edges: readonly ScenicEdge[] }`. `pocketCenter(typeIndex, section): Vec3` is the sole immutable address frame. `scenicRoute(beds: readonly Bed[]): ScenicRoute` derives three closed island loops joined by curved meadow gates, then only occupied/next-planting satellite-pocket loops and curved near-side access. `ScenicRoute.islands` drives consistent groundcover/background planting. Six of the13base pockets are inside primary loops and seven outside. Main loops use analytically matched endpoint tangents; additional hidden transit nodes allow rounded loop arcs and sparse graph access without extra UI stops. Geometry stays O(used sections+13). `curvePoint(edge,t): Vec3` supplies both path tessellation and traversal. `createScenicNavigator(route,initialId)` exposes `select(id,reducedMotion)`, `tick(seconds)`, `interrupt()`, `update(route)`, `pose` and `selectedId`; retargeting preserves the current edge coordinate and uses connected graph edges. `scenicPose(pose,aspect,fovY,focus,weight)` composes the existing flower focus/return without a competing camera authority. `buildScenicPath(route)` creates the natural ribbon mesh; `distanceToScenicPath(route,x,z)` controls deterministic meadow exclusion.

GardenV2 owns `selectedStop` and memoizes the route from `TypeAreaLayout.beds`. GardenWorld receives `scenicRoute`, `scenicStop`, `scenicBlocked`, `onSelectScenicStop`; these enter renderer state. DOM back/onward/select controls and projected route buttons call the same guarded selection callback. The renderer instantiates one navigator, updates route/selection, blocks direct wheel/key/drag/ground locomotion in scenic mode, and feeds its pose through existing arrival/focus/recovery. Default showcase/walking and landing behavior remain opt-in and unchanged.

`src/lib/world/site-geography.ts` extracts authoritative `landingShoreX`/`landingLakeDepth`/`landingTerrainHeight`/water constants without changing outputs (recorded golden points). `backyard-frame.ts` derives its origin from `houseToWorld([0,0,-HOUSE.depth])` and axes from the existing design/world cardinal basis. All new route/pocket/soil/path/scenery/ground/water consumers use this common geography. Island centres are offset inland in that frame so original/nearby expansion pockets are dry; sections3+ use fixed inland annex columns and sparse used levels, never extend arbitrarily into the lake.

`src/lib/world/garden-house.ts` supplies one `buildHouseMesh({ rearPorch: true })` complete mesh, unchanged in original world coordinates, to BOTH actual landing and scenic garden compositions. The default factory remains compatible, while actual scenes share rear additions. `garden-house-frame.ts` uses `worldToHouse` for caption occlusion; no independent model transform remains. Rear door uses a distinct static material so the front-door uniform only animates the original front door. Pure tests verify unchanged front geometry/anchors, identical full-house world vertices, actual rear door/porch/steps, rear half-plane and shoreline clearance; current front/rear renders and a top-down site artifact verify the physical relationship. A rounded route connection reaches the actual rear steps. Shared backyard clearing affects both actual views consistently; no new interior, entry action or persisted-position state.

The first/arrival stop is a raised island overlook on the connected primary route. Three overview poses interleave with direct type approaches. Overview height and aspect-aware lens interpolate as camera state along the same shared x/z curves; ordinary type/house views keep their normal lens. Final values are recorded after four-size visual verification.

**Geographic clarification:** [same-site approval](https://github.com/C0derTang/shared-garden/issues/224#issuecomment-7206664458) supersedes the unshipped independent house transform/shoreline. Commit this revised plan/decision before geographic core.

**User amendment:** [2026-11-26 approval](https://github.com/C0derTang/shared-garden/issues/224#issuecomment-7206460284) supersedes the initial unshipped straight-spur/blank-rear layout. Before revised core, amend decision0072 and this plan in a documentation-only commit linked on the issue. Prototype/contact sheets must show rounded loops around green islands, both inside/outside flowers, and full modeled back door/porch/steps before broad final checks.

**Existing interfaces:** Existing JourneyPose/FocusTarget, TypeAreaLayout/Bed/PlantingSpot and WorldSceneState/WorldRenderer are the integration boundaries. Before product code, name and type the shared scenic stop (stable id,label,pose), curve segment (endpoints/control points), route (stops+segments) and navigator (select/update/tick/pose/interruption) interfaces in the versioned plan. Both rendered path and camera traversal must consume the same route segment contract; flower mapping must consume its stable pocket frames. Exact identifiers are builder-owned conservative choices recorded before use; do not introduce backend or persisted-position state.

- [ ] Fetch default branch, prepare isolated codex/224-* worktree and record base; read issue/guidance/relevant vgpu skill/local package docs. Commit decision0072 and refined plan first, link exact commit in issue before product implementation.
- [ ] Before revised core: document approved island/porch amendment, share concrete layout with orchestrator, then add failing island-containment/rounded-join/inside-outside/rear-door-porch regressions and replace obsolete layout assumptions.
- [ ] Write meaningful failing pure tests for route loop/curvature/heading continuity, reverse/wrap/rapid selection/interruption, pocket stability/nonoverlap/sparse geometry, all-type/flower approach picking, and house rear view. Observe expected failures, implement minimal shared contracts and make them pass. Existing data must deep-equal before/after mapping and repeated planting.
- [ ] Integrate visible path, pocket scenery and actual house rear, then route camera/stop interaction in GardenV2. Add component tests for no free movement/pad, target priority/drag, offscreen onward/back targets, overlay/field/arrival blocking, resize, reduced motion and coherent return. Keep original landing/default showcase path and lifecycle intact where not superseded.
- [ ] Extend and run actual-UI synthetic browser checks at all four sizes: every scenic stop, empty/populated, repeated planting/history by original UUID, onward/back discoverability, actual clicks/trusted touch, rapid retargeting/drag/typing/interruption, normal/reduced arrival/return, expanded/sparse cases and actual device-loss recovery. Save contact sheets/screenshot views showing changing compositions, paths and unmistakable house rear. Inspect them, not only numeric assertions.
- [ ] Run lint,typecheck,full tests,build,full WGSL and native paint where supported; separate downstream Node suites for known Mac native audio failure. Verify actual production404/no fixture state. Profile representative synthetic scenes on same device/browser/viewport/motion, retain raw timings/limits/adverse results and distinguish scene changes from shader performance.
- [ ] Inspect diff/sensitive content, update decision/plan/issue/evidence, commit/push and open one PR Closes#224. Return issue/PR/worktree/branch/base/head/checks/artifacts/limits in /tmp/ccapp-224-builder-report.md. Keep worktree for corrections; never self-approve/merge/spawn reviewers.

**Orchestrator gates:** Fresh fork-none reviewer independently checks actual full diff/SHAs/criteria/checks, records verdict on GitHub; original builder corrections use same branch and fresh reviewer for new head. Merge only all gates pass, verify merge/issue closure/history and safe branch/worktree cleanup; preserve original checkout's user changes.
