# 0069 — Measured Kuwahara optimization

Status: conservative implementation choice under [decision 0067](0067-garden-overhaul.md)
and [0004](0004-finalized-launch-rules.md), for
[issue #218](https://github.com/C0derTang/shared-garden/issues/218). No new product
or visual rule is selected. The user requested faster graphics on 2026-11-26.

The anisotropic Kuwahara pass is a substantial GPU cost in the existing painted
world. Preserve its eight sectors, near/far and flower-detail radii, sampling
stride, elliptical support, variance weighting, depth/detail alpha and the
renderer’s resolution budget. Do not change flowers, scenery, shadows, reflection,
bloom, lighting, motion, picking, navigation, recovery or backend state.

Evaluate only half the symmetric integer sample lattice. At the opposite point,
the Gaussian factor is equal and the eight polynomial sector weights rotate by
four sectors; use these weights to accumulate the opposite source color. Count
the origin once. This removes approximately half the repeated kernel-transform,
sector-polynomial and Gaussian calculations without dropping samples. Named
sector moments also remove dynamic indexing from the inner sample loop. The
floating-point accumulation order changes slightly; the image comparison and
native GPU regression below bound that difference. This is an arithmetic
optimization, with no chosen visual-quality tradeoff.

## Reproducible measurements

[Machine-readable summary](../evidence/0218-renderer-performance.json) records the
results, including medians, p95, separate run medians and pixel comparisons.

- Device: Apple M5 Pro, macOS 27.2.1, Apple Metal 3 adapter; headless Chromium
  156.0.8078.4 with `--enable-unsafe-webgpu`, same physical device/browser for both.
- Scenes: development-only member landing and garden with 26 deterministic,
  fully bloomed synthetic flowers, fixed dusk. No production content or sessions.
- Desktop: 1280 × 800 CSS pixels, DPR 1. Phone-sized viewport: 390 × 844, DPR 2
  (780 × 1688 canvas). The phone case is browser emulation on the same Mac.
- Reduced motion for repeatable stationary measurements. Normal motion is checked
  separately. Each scene uses baseline/candidate/candidate/baseline order,
  four-second warmup, then 90 GPU readbacks with the first 10 discarded: 160
  retained samples per variant and scene.
- A measurement-only browser hook substitutes either the immutable shader from
  base `49906e43e80c7138f3b34874a2c0ffc47f9f5cab` or the current production shader
  at shader-module creation in the same renderer. Their binding layouts match.
  No performance diagnostics or optional feature request enters the application.
- GPU timestamp queries measure the first-pass start to final-pass end envelope.
  Individual pass spans overlap on this Metal implementation, so adding their
  durations would misrepresent total frame cost. Encoding time and submission
  intervals are recorded separately. Timestamp/readback overhead applies equally
  to both variants; these are development measurements, not production FPS.

| Scene | GPU envelope median, baseline → candidate (ms) | Kuwahara timestamp span median, baseline → candidate (ms) |
| --- | --- | --- |
| Desktop landing | 8.210 → 7.884 | 3.791 → 3.481 |
| Desktop populated garden | 7.929 → 7.301 | 5.485 → 4.683 |
| Phone-sized landing | 11.664 → 11.015 | 7.258 → 6.738 |
| Phone-sized populated garden | 8.162 → 8.152 | 6.429 → 6.310 |

These timings show reduced shader work and lower median frame-envelope time in
three scenes. The phone-sized populated garden envelope is effectively unchanged;
run-to-run variation and some worse candidate p95 results preclude a universal
speedup claim. Median submission intervals remain approximately 16.7 ms for both
variants in all scenes. There is no demonstrated FPS increase on this machine.
Other GPUs and actual phones require their own measurements.

To reproduce, install locked application dependencies and start `npm run dev --
--port 3218`. Provide an independently installed Playwright module and Chromium
executable if they are not available through normal resolution:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
CHROMIUM_EXECUTABLE=/absolute/path/to/chromium \
node scripts/profiling/profile-world.mjs
node scripts/profiling/summarize-world.mjs
```

`BASE_URL` overrides the local origin; `PROFILE_OUTPUT` overrides the default
`/tmp/ccapp-218-profile` directory for both scripts. The harness retains raw
nanosecond timestamps, durations, errors and screenshots, and saves after every
case. A missing timestamp-query adapter is a measurement limitation; production
still has no such feature requirement. Do not compare concurrent workloads.

## Preservation checks

`npm run test:paint` renders the shipped WGSL and an immutable baseline fixture
on native WebGPU using deterministic 64 × 64 synthetic source/tensor textures.
It covers edges/noise, image boundaries, negative flower-detail alpha, near/far
pixels, zero and rotated tensors, DPR 1/2 radii and the stride threshold. Float
readback has a maximum absolute linear-color error of 0.00001115, below the fixed
0.00002 tolerance; alpha matches exactly. The fixture stays unchanged when the
production shader changes.

For each of the four full browser scenes, baseline/candidate fixed-motion
screenshots differ by at most one displayed RGB byte (1/255), with fewer than
0.01% of RGB channels changed. Visual inspection retains brush direction, grain,
painted edges, light, reflection, bloom and botanical flower shapes.

`node scripts/profiling/check-world.mjs` uses the same optional browser environment
variables, saving results under `/tmp/ccapp-218-interactions` by default. It checks
normal-motion desktop/phone views, a known synthetic flower pick, seed planting,
keyboard and drag journeys, a synthetic phone touch-pointer swipe, all four growth
stages, night/still fireworks and the member landing camera walk. Destroying the
actual GPU device recovers the world once; the second loss shows the stopped
notice with Reload and the legacy link. The landing screenshot stops before the
authenticated garden route boundary; authentication/backend behavior is outside
this shader change. Existing component tests cover care-heart visibility,
projection, reduced motion, pause/unmount cleanup and the landing handoff.

Required validation: lint, typecheck, build, complete WGSL validation and the
focused GPU regression pass locally. `npm test` reports 133 passing files, two
skipped files, 1,379 passing tests and three skipped tests, with six native-audio
normalization failures (`audio_unavailable`) because this macOS checkout has only
the tracked Linux audio executables. The separately run downstream Node suites
all pass (55 tests). Linux CI must run the complete suite successfully before
merge; this record does not waive that gate or independent exact-head review.
