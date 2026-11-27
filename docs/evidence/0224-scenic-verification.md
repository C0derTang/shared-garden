# Issue 224: original-site scenic garden verification

[Approved decision 0072](../decisions/0072-curved-scenic-garden.md) implements [issue 224](https://github.com/C0derTang/shared-garden/issues/224). The final two-island garden conforms to the original landing site. Earlier three-island/shared-clearing prototypes were superseded and are not final acceptance evidence.

Runtime source SHA-256: `f36c137d10a786595f00dd6ffd4de22f52ad7885fb2c6fd4b79c73dc1a5961b8`. Synthetic fixture SHA-256: `82d04f945f136e6f632b2aff6b1bcedb656ed23eac93129a5986044407204931`. The capture metadata records the documentation-only HEAD before the feature commit and fingerprints the actual rendered source, including new files. `scenic-evidence.mjs` reproduces that fingerprint. No actual authenticated session or private backend content was used.

## Original front and physical site

`original-landing.test.ts` compares against a manifest generated from the original prerequisite Git objects at `6f23246`, not against another modified helper. Ordered outputs remain identical: 161,168 caster strokes, 108,737 field strokes, 37,791 ground vertices, 1,550 default house vertices and 52 rocks. The original 273 tree placements and their solid branches remain fixed. Actual landing retains the original default house/caster/field/ground branches. The rear view augments the same original footprint/yaw with the approved rear door, covered porch and steps; it does not alter the original front composition.

The source-derived site figure and close house figure show the real shoreline, original forest/rocks, front/rear anchors, landing camera, rear/lake views, two rounded primary islands and six inside/seven outskirts type pockets. Four-size rear framing fits the complete roof, door, porch and steps through the existing woodland gap. Current day/dusk/night front/rear pairs and front-door entry were inspected. Native exact house-core WGSL probing confirms that only the original front door moves: rear door position/normal and porch anchors stay static in the shared scene/shadow/reflection functions.

Independent barycentric sampling checks the unchanged rendered ground facets. Empty, populated, sparse and before/after planting-boundary cases verify all composed ground layers against roots, soil and path vertices plus representative triangle interiors. The final surface fix follows the original facets and uses bounded metre-scale long-link endpoint tessellation; no depth-always workaround ships. Full ribbon/camera footprint, organic bed rims, original trunk/upper branch and rock clearances are checked.

## Actual UI and verification matrix

The `check-scenic-*` scripts run actual GardenV2 against loopback synthetic fixtures with fail-closed action interception. The four sizes are 1280×800, 390×844, 844×390 and 800×600. All 42 stops at each size were captured (168 views), including 13 base type areas and used/next expansion areas. Regenerated contact sheets, rear views, site figures and sparse views were visually inspected. Full world-marker bounds and actual header/footer/initial-hint intersections are asserted; normal product navigation is visible, with only the development badge and fixture-only scope trigger omitted.

Eight empty/populated cases pass repeated rose planting, lower global holes and a twelve-address boundary, exact preservation of original UUID/state, same-UUID history, all 13 seed choices, actual canvas picking priority, trusted emulated phone touch, keyboard route selection, canvas/button out-and-back drag rejection, pointer cancellation, overlay/scoped typing, rapid retargeting, resize and real GPU device-loss recovery followed by the bounded second-loss stop. Four normal-motion cases pass arrival, exact rendered-pose/lens settling, flower return, rapid selection, blur/visibility, overlay interruption and resize. Reduced motion is also covered, including a deterministic held-rAF regression for selection arriving before focus reset. Four sparse cases reach and pick original address 12001 without missing-address geometry growth.

The initial hint overlap was reproduced in landscape, retained as failure evidence and fixed by reserving its actual rectangle. A subsequent no-walk observer mismatch was an invisible keyboard marker repositioning around that hint; no-walk now compares exact actual camera uniform eye/matrix. Planting can change the existing decorative caption bob phase with label insertion: exact camera/data remain equal, and per-ID pixel offsets are retained against the actual sine-formula bounds of 6/8 pixels plus rounding.

[Interaction evidence](0224-scenic-interactions.json) retains observations and limitations. Raw captures/logs are retained in the builder's `ccapp-224-original-final-*` artifact directories for exact-head review. Physical phone and assistive-technology hardware were not used; touch was trusted CDP emulation and accessibility checks used native DOM/keyboard/name semantics.

## Commands and results

- `npm run lint`, `npm run typecheck`, `npm run build`: pass.
- `npm test`: 1,449 passing, 3 skipped, six known Mac `audio_unavailable` failures only. No audio code changed. Full Linux CI remains required before merge.
- `node --test content/daisy-questions.test.mjs scripts/release/production.test.mjs scripts/setup-home-media.test.mjs scripts/dev-signin.test.mjs`: 55 passing.
- Focused final geometry/navigation/component selection: 13 files, 87 passing; full suite includes the other mapping/activity tests.
- `npm run check:wgsl`, `npm run test:paint`, `node scripts/profiling/check-house-door.mjs`: pass native validation/parity/probe.
- `check-scenic-garden.mjs`, `check-scenic-interactions.mjs`, `check-scenic-motion.mjs`, `check-scenic-sparse.mjs`, `check-scenic-house-views.mjs`, `check-scenic-return-race.mjs`: pass the current-source browser matrix above. Set `PLAYWRIGHT_MODULE` and `CHROMIUM_EXECUTABLE` to an installed compatible browser/runtime; no new dependency was added.
- `check-scenic-production.mjs` against an actual `npm run build` / `npm run start` loopback server: six development route variants return 404 without synthetic fixture content.

## Representative performance

[Performance evidence](0224-scenic-performance.json) retains all CPU runs, per-run/pooled GPU statistics and historical adverse before/after BVH component timings. Current pure scene component totals were 160–196 ms across empty/populated/sparse scenarios; planting geometry rebuilds 166–204 ms. Original static caster plus augmented house construction was measured separately at 52–76 ms. Actual UI planting elapsed was 55–324 ms with local fake action and observer overhead included.

On one Mac Apple Metal adapter with Chromium 156.0.8078.4, fixed dusk, reduced motion and identical scene/camera per paired shader run, 960 retained frames were measured after warm-up. Desktop overview pooled command-buffer median/p95: reference 8.210/8.890 ms, optimized 8.090/8.581 ms. Portrait DPR2: reference 9.789/10.380 ms, optimized 9.394/10.074 ms. Rose/rear stops are recorded separately; changed scene geometry is not attributed to shader optimization. Overlapping Metal span times are not summed. Timestamp feature/observer, OS noise and single-device limits apply; these are not universal FPS claims. Raw timestamps and adverse samples remain available by the recorded artifact hash.

No database reset/migration, backend/schema, service/cost, private-data or audio change was needed. Fresh independent exact-head review and all required CI remain merge gates; the builder does not self-approve or merge.
