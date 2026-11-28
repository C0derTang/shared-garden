# #233 — Reliable exact geometry verification

Issue [#233](https://github.com/C0derTang/shared-garden/issues/233) follows the
merged [#229 / PR #232](https://github.com/C0derTang/shared-garden/pull/232).
Base: `d55aec6b2c5074deedf8c91965ec08f6fbfda2ec`. This verification-only choice
uses [0004](../decisions/0004-finalized-launch-rules.md)'s conservative discretion;
[0069](../decisions/0069-measured-kuwahara-optimization.md),
[0073](../decisions/0073-compact-scrolling-garden.md),
[0074](../decisions/0074-garden-ux-clarity.md) and
[0075](../decisions/0075-lakeside-bank-garden.md) remain authoritative.

The identical reviewed/merged tree passed the original PR Web check at
29,455 ms bank / 4,835 ms walking, then failed main at 30,632 / 5,048 ms.
The existing limits remain **30,000 / 5,000 ms**. Production correctly stopped at
its exact-commit check gate; this change alone is not a deployment claim.

## Measured work and retained proof

The quiet initial operation profile used the complete 193-plant / 45-bed layout:
219,888 ground, 63,000 soil and 70,848 ribbon triangles. Ground creation took
47.82 ms, root indexing 32.01 ms, roots 3.98 ms, soil/ribbon creation 12.58/14.14 ms,
and the old exact clearances 2,713.71/3,068.43 ms. Repeated triangle decoding and
the 8m broad-phase buckets dominate. Merely using Node instead of jsdom did not
solve this: focused original tests took 7.89 / 7.27 seconds respectively.

The test helper now snapshots triangle coordinates/bounds and uses one grid
level per triangle, from 0.5m upward by factors of 16 until its box covers at most
64 cells. Every surface query searches **all** levels; a wide query scans a
level's triangle IDs instead of enumerating empty cells. Exact bounding-box
rejection, clipping, barycentric heights and strict minimum comparisons remain
unchanged. Candidate order reproduces the old wide-first/8m-cell traversal,
including equal-minimum witness selection. The bank test constructs its identical
ground once and reuses the explicit snapshot for soil and ribbon. No persistent
cache assumes mutable meshes stay unchanged.

The frozen old implementation in
[`ground-sampler-reference.ts`](../../scripts/profiling/fixtures/geometry-check/ground-sampler-reference.ts)
comes from the base file. Removing only its provenance/type import and optional
candidate counter/overlap observer yields a byte-identical source, SHA-256
`b9b3057a7aa9b1ec7e0e8983f179611311a7c8cb07bd767d1f7e34837e8b4146`.
Its geometric arithmetic and traversal are independent of the new implementation.

The new regression compares exact minima, complete six-component witnesses and
pair counts. Incremental SHA-256 records **every** clipped intersection polygon,
its vertex count/coordinates and both original triangle offsets in old order.
It compares the complete base and 193-plant proofs, including every rendered
layer, and all root queries. Adversarial checks cover the original narrow crease,
stacked/coincident layers, tied witnesses across fine/wide layers, reversed and
degenerate triangles, negative and grid-boundary coordinates, disjoint geometry
and large triangles. The original narrow-crease oracle remains intact. A deliberate test-only mutation
that searched just the first grid level failed the adversarial regression
(`pairs: 4` instead of `5`); restoring all levels passed. No mutation is retained.

For the 193-plant layout, soil retains 741,115 overlapping pairs and minimum
`0.002510386800211123` at
`[96.27502926054969, 0.14706089417395007, -21.43817611604876, 0.14455050737373895, 71157, 187896]`.
Ribbon retains 803,391 overlapping pairs and minimum `0.007006025282527695` at
`[78.49377659047751, 0.955306705632704, -15.12104170888624, 0.9483006803501763, 94248, 174732]`.
All values agree exactly with the old proof, without tolerance adjustments.

## Benchmark and scheduling

Reproduce the opt-in benchmark with:

```sh
npx vitest run --config scripts/profiling/geometry-check-benchmark.config.mts --reporter=verbose
```

All samples, operation timings, CPU times, full results and conditions are in
[the raw benchmark record](0233-geometry-benchmark.json). No sample was discarded.
Each pair uses the same actual meshes; sample 0 is cold and sample 1 reverses
order. Sample 2 includes a trailing inventory/lint overlap and is retained as an
adverse sample. These are observations, not machine-dependent test assertions.

| Sample | Old total ms | New total ms | Old CPU ms | New CPU ms |
| --- | ---: | ---: | ---: | ---: |
| 0 cold | 5777.82 | 1334.11 | 5898.57 | 1544.98 |
| 1 reverse order | 5699.36 | 1296.44 | 5733.09 | 1342.58 |
| 2 adverse retained | 5775.63 | 1355.05 | 5768.13 | 1407.51 |

Each pair reduces broad-phase visits from **233,849,064 to 24,093,407** (89.7%)
while retaining all 1,544,506 actual soil/ribbon overlaps. The original bank test
now took 1,481–1,525 ms locally.

The walking profile had 40 original approaches: movement 1,065.65 ms, projection
3.11 ms and picking 3.01 ms. Its production algorithm is not changed or claimed
to be faster. Its complete test file is byte-identical to the base, retaining all
starts, full movements, flowers, thirteen areas, viewports, expected values and
5,000 ms limit. The two affected files plus the new exhaustive equivalence file
run in a single-worker Vitest project after the ordinary parallel project.
jsdom, setup hooks, isolation and the remaining suite's concurrency are retained.
The scoped group avoids competing CPU-heavy workers; it does not weaken proof.

A baseline/current `vitest list --json` comparison preserved all 1,064 original
collected records across 159 collected files exactly, with no duplicates. The
new equivalence file adds two statically collected records (three executed
cases). The original skipped files remain included by the unchanged source glob.
No test is removed from the union of the two projects.

## Validation and production provenance

Final local commands:

- `npm run lint`: pass, zero warnings.
- `npm run typecheck`: pass.
- `npm test`: 41.64 seconds; 159 passing files / 1 failing / 2 skipped;
  1,492 passing tests / 6 failing / 3 skipped. All failures are the documented
  macOS `audio_unavailable` normalization cases in `src/lib/media/audio.test.ts`:
  `safari-300.webm`, `safari-5.webm`, `tone-5.webm`, `tone-300.webm`,
  `browser-5-0.webm`, `browser-300-0.webm`. The existing native-decoder,
  local-auth and local-media availability skips remain explicit. Both original
  affected tests and the complete new equivalence regression pass.
- `node --test content/daisy-questions.test.mjs scripts/release/production.test.mjs scripts/setup-home-media.test.mjs scripts/dev-signin.test.mjs`:
  55 passing, zero failed/skipped (67.40 ms). Run separately because `npm test`
  correctly stops at the six platform audio failures.
- `npm run build`: pass.
- `git diff --check`, original inventory union, frozen-oracle source restoration,
  unchanged walking file, local references and sensitive/unrelated-content
  inspection: pass.

Required Linux Web and the other three workflows must pass for the current
head; exact run links/results are recorded in the PR review trail. These local
platform limitations do not waive Linux Web or independent review.

All application sources, WGSL, production geometry/camera, assets, data, reference
baselines, dependencies and lockfile remain byte-identical to the base. Only test
helpers/files, the opt-in profiling harness, scoped test scheduling and this
sanitized evidence change. Therefore prior native/GPU evidence in decision 0075
is reused solely on unchanged production-input provenance; no GPU pass is claimed
for this test-only branch. No database action, service, cost, auth or privacy
change is included. Fresh independent exact-head review and the repository's
merge/cleanup gates remain required.
