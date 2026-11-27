# Compact scrolling garden verification

[Issue226](https://github.com/C0derTang/shared-garden/issues/226) · [decision0073](../decisions/0073-compact-scrolling-garden.md) · [design](../superpowers/specs/2026-11-26-compact-scrolling-garden-design.md).

The garden has one continuous native scroll tour and a right-side flower picture/name drawer, compact mature-size adjoining beds inside/outside a curved room, and a scrollable actual rear porch view. Persisted identity, seed, growth, history, activities and backend/privacy rules are unchanged.

Final application source fingerprint is `c7a00e3332c53a295b688d80cce00eac8d6e356f92abe44dbc117666b6aa8a29`, based on all tracked/untracked non-test source files before the feature commit. Capture metadata honestly records preceding docs HEAD `c3b5fa5`; committing does not change these bytes. Base is `0575e83c96ec9c73a56d61fab8edda52df9bdd45`. Earlier prototypes/parallel runs are historical and do not count as final acceptance evidence.

## Automated and native checks

| Check | Result |
| --- | --- |
| `npm run lint`, `npm run typecheck`, `npm run build` | Pass on final application source |
| `npm test` | 1,466 passing, three skipped; only six known native Mac `audio_unavailable` failures |
| Separate downstream Node suites | 55 passing |
| Full WGSL validation | Pass; no shader changes after validation |
| Native immutable-reference paint regression | Pass; maximum linear-color error0.0000111461 at tolerance0.00002; shader/quality inputs unchanged |
| Native shared-house door probe | Pass: front door/normal move; rear door/normal and porch remain static |
| Actual built production server | Seven dev URL variants404, no synthetic state, including `many=1&bloom=1` |
| Diff/source/privacy checks | Only feature scope and sanitized synthetic evidence; no DB reset/migration |

Complete Linux Web CI remains mandatory; the six Mac audio failures are neither hidden nor waived. Native Node version/dependency pins are unchanged. The other required CI workflows and exact-head independent review remain merge gates.

## Actual browser matrix

`/tmp/ccapp-226-serial-final` contains16 serial actual GardenV2 cases: all four required sizes1280×800,390×844,844×390,800×600, each with full bloom(78 plants, six/type), mixed normal motion, empty and sparse address12001. `/tmp/ccapp-226-boundary-final` adds four actual lower-hole cases with two repeated Rose plantings, preserved old data/positions and original-UUID history. All20 cases pass at the final source fingerprint. Only the fixture's extra scoped-sheet button is hidden for presentation screenshots.

The tests use actual native small/large/reverse wheel, Home/End, trusted CDP touch swipe/inertia/cancel on emulated touch views, all13 drawer portraits/names/anchors and independent panel scrolling. They check all13 planting activities, actual canvas flower/seed picking and drag rejection, exact activity return, overlay/scoped typing, resize and actual GPU loss/recovery. Observed actual GPU eye/matrix must match the shared sampled path and lens; no injected camera API substitutes for native movement. Every mature crown/seed target also has an independently verified on-screen point that wins the actual picking algorithm, including occupied overflow.

`/tmp/ccapp-226-lifecycle-final` passes normal/reduced held-frame return, reduced latest accepted distance rendered after resume, trusted reverse wheel/touch/navigation-key picker interruption, queued first-frame cancellation, picker reopening, blur/visibility, focus trapping, pointer-captured drawer drag rejection, outside dismissal, no extra picker GPU contexts, recovery with picker open and bounded stop after the second loss. A newer intentional plot/control focus survives delayed activity-close autofocus.

`/tmp/ccapp-226-occupied-final` adds an actual79th plant at desktop/phone. All old plants stay put, the actual GPU endpoint pose remains exact after insertion, native wheel reaches the occupied overflow and its flower/next target open correctly. The first connection is7.178964m; only14 beds exist. Strict source tests include complete path width/camera margin against every bed rim and retained trunk/branch capsule, including multiple occupied modules. The final source-derived map and raw geometry are `/tmp/ccapp-226-site-final/site-map.{svg,png}` and `site-geometry.json`.

See [sanitized interaction results](0226-compact-interactions.json). Unknown actions/requests fail closed. No authenticated session, real private backend read or mutation was used.

## Original front and entry provenance

The genuine before-edit directory `/tmp/ccapp-226-original-front` remains untouched:12 fronts(all four sizes × day/dusk/night) and desktop entry. Its original runtime fingerprint is `f36c137d10a786595f00dd6ffd4de22f52ad7885fb2c6fd4b79c73dc1a5961b8`.

Missing original entry sizes were reconstructed **after implementation** in a separate managed detached checkout of immutable base0575, with pristine runtime source and the same browser/device/sky/entry timing. Before reconstructing those sizes, the original source reproduced the genuine desktop dusk static front byte-for-byte and reproduced the saved desktop entry's house/door/landmarks. Moving entry wall-time captures can differ by actual animation frame: the reproduced desktop entry has mean absolute RGB-byte difference0.5084,23.18% changed channels and maximum108. This is explicitly not a claim of moving-image pixel identity. Original source, genuine references and native hinge proof remain authority. Reconstructed entry frames/provenance live under `/tmp/ccapp-226-reconstructed-original`; current final-source entry at all four sizes is `/tmp/ccapp-226-current-entry`.

The intentionally thinned site removes2,784 low foliage strokes from the original161,168, leaving158,384. An independent literal-subset test retains every original trunk/branch and all ordered attributes elsewhere; original factory/packedGPU authority remains untouched. Both views use the same static site. No private GardenState enters public landing.

Actual matched static front comparisons in `/tmp/ccapp-226-front` retain all12 pairs. Portrait is byte-identical at all three skies. Other sizes change0.3075–2.1824% of RGB channels, with maximum mean absolute byte difference0.08218, localized to the allowed low foliage/shadows. Manual comparison retains architecture, dominant forest silhouette, lake/shore/ground/rocks, sun and entry. Later lifecycle/focus/occupied-spur changes do not alter these front inputs. They do not justify replacing the frozen originals or claiming unchanged actual caster output.

## Performance and limits

Other task-owned browser/build/test work was stopped before separate quiet CPU and GPU runs. [Sanitized raw CPU samples and GPU summaries](0226-compact-performance.json) retain all runs/maxima; complete raw GPU timestamps remain `/tmp/ccapp-226-render-final/measurements.json`.

CPU layout/tour/path/ground/meadow plus separately generated canonical models, three runs/scenario: empty157.52–179.35ms, mixed141.75–148.45ms, full140.23–167.62ms, sparse133.02–143.94ms. These are scene/rebuild components, not per-frame work or complete page startup; static caster construction, GPU upload and shader compilation are excluded.1,000 actual camera samples take0.459–1.679ms. Native scrolling reuses the geometry. All24 actual UI planting spans are retained:52–3,535ms; normal spans include waiting for the seed view and both existing camera glides, plus fake local action/observer/rebuild time, so they are not isolated renderer/backend timing.

The unchanged optimized paint is compared with its frozen reference on the same new scene in reference/optimized/optimized/reference order, mixed26/full78 plants, desktopDPR1/phone-sizedDPR2.16 cases retain80 GPU timestamp frames each after ten discarded warm frames(1,280 retained). Browser156.0.8078.4, Apple Metal3 on the same Mac; normal OS/observer noise remains. GPU command-buffer envelopes do not sum overlapping Metal pass spans.

| Scene | GPU envelope median, reference → optimized(ms) | Optimized p95/max(ms) |
| --- | --- | --- |
| Mixed desktop | 7.482 →7.170 | 7.320 /8.060 |
| Mixed portrait | 9.323 →8.820 | 8.919 /9.146 |
| Full desktop | 8.390 →8.040 | 9.786 /10.213 |
| Full portrait | 9.997 →9.497 | 9.587 /9.738 |

The adverse reference maximum10.887ms and all run medians are retained. These are representative measurements under unchanged quality/pixel budgets, not a universal FPS or cross-device claim. Touch and phone sizes are trusted browser emulation, not physical phone/trackpad or screen-reader hardware tests.

## Reproduction

Use the repository's locked dependencies and a loopback dev server on3226. Set `PLAYWRIGHT_MODULE` and `CHROMIUM_EXECUTABLE` to existing local Playwright/Chromium paths; no dependency/service upgrade is needed. Set `BASE_URL=http://localhost:3226` and a fresh `PROFILE_OUTPUT` directory for browser scripts.

- `node scripts/profiling/check-compact-garden.mjs`; repeat with `KINDS=boundary`.
- `node scripts/profiling/check-compact-interruptions.mjs` and `check-compact-expansion.mjs`.
- `node scripts/profiling/check-compact-entry.mjs`; original-source reconstruction uses a separate immutable-base checkout/server and must be labelled accordingly.
- `node scripts/profiling/compact-site-map.mjs`; `check-compact-front.mjs` compares retained original references.
- After all correctness/build/test work stops: `profile-compact-cpu.mjs`, then `profile-compact-render.mjs`, then `summarize-compact.mjs`.
- `BASE_URL=http://localhost:3227 node scripts/profiling/check-scenic-production.mjs` against an actual final production build/server.

Earlier red artifacts are retained separately: native smooth-glide interruption/consumed-wheel probes, paused readiness and delayed-focus regressions, rejected occupied-spur clearance, and parallel fixed-wait/SSR socket failures. Final serial observable-state checks and source tests replace those failed candidates; no check/quality limit was loosened to bless them.
