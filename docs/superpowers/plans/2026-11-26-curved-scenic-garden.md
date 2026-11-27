# Curved scenic garden Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Repository AGENTS.md controls: one dedicated builder for this atomic feature, no builder-spawned agents, orchestrator dispatches fresh review.

**Goal:** Replace fixed-heading free walking with click-selected scenic stops around a curved garden path.

**Architecture:** A pure shared route/layout contract supplies stable type pockets, path geometry, scenic camera poses and route targets. A deterministic navigator interpolates curved segments and orientation, integrated with existing focus/arrival/reduced-motion and overlay lifecycle. Reuse procedural house/landscape/flower rendering and existing synthetic actual-UI harness; keep data/backend and landing front unchanged.

**Tech Stack:** Existing locked Next.js/React/TypeScript, procedural vgpu/WebGPU/WGSL, Vitest and externally installed Playwright/Chromium. No new service/dependency is needed.

**Spec:** Copy approved design to docs/decisions/0072-curved-scenic-garden.md and this refined implementation plan to docs/superpowers/plans/2026-11-26-curved-scenic-garden.md before product code. Source /tmp/ccapp-scenic-stops/design.md and issue https://github.com/C0derTang/shared-garden/issues/224.

## Global Constraints

- Set scenic stops, click/tap plus keyboard/screen-reader equivalents; no GardenV2 WASD/arrow locomotion, directional pad or arbitrary free-walk targets.
- Visible curved looping primary path, changing camera directions, thirteen distinct expanding type pockets, actual rear of same house, preserved lake/painterly world.
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

`src/lib/world/scenic-route.ts` owns `ScenicStop { id: string; label: string; pose: JourneyPose; typeIndex?: number; section?: number }`, `ScenicEdge { id: string; from: string; to: string; points: readonly [Vec3, Vec3, Vec3, Vec3] }` and `ScenicRoute { stops: readonly ScenicStop[]; edges: readonly ScenicEdge[] }`. `pocketCenter(typeIndex, section): Vec3` is the sole immutable address frame. `scenicRoute(beds: readonly Bed[]): ScenicRoute` derives primary stops plus only occupied/next-planting section spurs. `curvePoint(edge,t): Vec3` supplies both path tessellation and traversal. `createScenicNavigator(route,initialId)` exposes `select(id,reducedMotion)`, `tick(seconds)`, `interrupt()`, `update(route)`, `pose` and `selectedId`; retargeting preserves the current edge coordinate and uses connected graph edges. `scenicPose(pose,aspect,fovY,focus,weight)` composes the existing flower focus/return without a competing camera authority. `buildScenicPath(route)` creates the natural ribbon mesh; `distanceToScenicPath(route,x,z)` controls deterministic meadow exclusion.

GardenV2 owns `selectedStop` and memoizes the route from `TypeAreaLayout.beds`. GardenWorld receives `scenicRoute`, `scenicStop`, `scenicBlocked`, `onSelectScenicStop`; these enter renderer state. DOM back/onward/select controls and projected route buttons call the same guarded selection callback. The renderer instantiates one navigator, updates route/selection, blocks direct wheel/key/drag/ground locomotion in scenic mode, and feeds its pose through existing arrival/focus/recovery. Default showcase/walking and landing behavior remain opt-in and unchanged.

`src/lib/world/garden-house.ts` transforms the existing landing mesh by converting its original world coordinates back to house-local coordinates and mapping local +z to garden +x, local +x to garden -z around garden centre [-14,0,27]. Normals receive rotation only; vertex UV/material/indices stay identical. No house shader changes are required with door angle held at zero in the garden.

**Existing interfaces:** Existing JourneyPose/FocusTarget, TypeAreaLayout/Bed/PlantingSpot and WorldSceneState/WorldRenderer are the integration boundaries. Before product code, name and type the shared scenic stop (stable id,label,pose), curve segment (endpoints/control points), route (stops+segments) and navigator (select/update/tick/pose/interruption) interfaces in the versioned plan. Both rendered path and camera traversal must consume the same route segment contract; flower mapping must consume its stable pocket frames. Exact identifiers are builder-owned conservative choices recorded before use; do not introduce backend or persisted-position state.

- [ ] Fetch default branch, prepare isolated codex/224-* worktree and record base; read issue/guidance/relevant vgpu skill/local package docs. Commit decision0072 and refined plan first, link exact commit in issue before product implementation.
- [ ] Write meaningful failing pure tests for route loop/curvature/heading continuity, reverse/wrap/rapid selection/interruption, pocket stability/nonoverlap/sparse geometry, all-type/flower approach picking, and house rear view. Observe expected failures, implement minimal shared contracts and make them pass. Existing data must deep-equal before/after mapping and repeated planting.
- [ ] Integrate visible path, pocket scenery and actual house rear, then route camera/stop interaction in GardenV2. Add component tests for no free movement/pad, target priority/drag, offscreen onward/back targets, overlay/field/arrival blocking, resize, reduced motion and coherent return. Keep original landing/default showcase path and lifecycle intact where not superseded.
- [ ] Extend and run actual-UI synthetic browser checks at all four sizes: every scenic stop, empty/populated, repeated planting/history by original UUID, onward/back discoverability, actual clicks/trusted touch, rapid retargeting/drag/typing/interruption, normal/reduced arrival/return, expanded/sparse cases and actual device-loss recovery. Save contact sheets/screenshot views showing changing compositions, paths and unmistakable house rear. Inspect them, not only numeric assertions.
- [ ] Run lint,typecheck,full tests,build,full WGSL and native paint where supported; separate downstream Node suites for known Mac native audio failure. Verify actual production404/no fixture state. Profile representative synthetic scenes on same device/browser/viewport/motion, retain raw timings/limits/adverse results and distinguish scene changes from shader performance.
- [ ] Inspect diff/sensitive content, update decision/plan/issue/evidence, commit/push and open one PR Closes#224. Return issue/PR/worktree/branch/base/head/checks/artifacts/limits in /tmp/ccapp-224-builder-report.md. Keep worktree for corrections; never self-approve/merge/spawn reviewers.

**Orchestrator gates:** Fresh fork-none reviewer independently checks actual full diff/SHAs/criteria/checks, records verdict on GitHub; original builder corrections use same branch and fresh reviewer for new head. Merge only all gates pass, verify merge/issue closure/history and safe branch/worktree cleanup; preserve original checkout's user changes.
