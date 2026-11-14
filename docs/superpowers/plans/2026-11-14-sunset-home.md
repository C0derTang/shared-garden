# Private Sunset Home Implementation Plan

> Execution: dedicated issue builder; fresh independent reviewer of the pushed head, following AGENTS.md. No production release or merge.

**Goal:** Deliver the approved private sunset homepage as a localhost-reviewable candidate.

**Architecture:** A dynamic server page verifies membership before loading three bounded memory lists. Responsive photographic/painterly raster layers and scoped CSS render the scene behind client carousels; the existing auth cookie adapter refreshes homepage sessions.

**Tech stack:** Existing Next.js image optimization, React, TypeScript and CSS modules; no new dependencies.

**Spec:** [Decision 0066](../../decisions/0066-private-sunset-home.md), [issue #165](https://github.com/C0derTang/shared-garden/issues/165).

## Constraints and review focus

- Signed-out `/` shows only `Log in`; no private data or scenery.
- Preserve old garden behavior, one `old garden` link to `/garden`.
- Verify membership before memory RPCs; no-store and refreshed cookies on every home response.
- Plain-text long/empty/error entries; immediate content, manual controls and motion pauses.
- Phone stacking, keyboard focus, reduced motion and no horizontal overflow.
- No production bypass, demo route, release or merge; preserve original draft.

## Atomic deliverable

Files: `src/lib/landing/{types,entries}.ts` and tests handle private reads;
`src/components/sunset-home/` owns the landscape, spider lily, carousel and scoped styling;
`src/app/page.tsx`, its test, `src/proxy.ts`, callback route and auth flow tests
wire entry and session behavior. Decision 0066 records approved details.

- [x] Add regressions for login-only page, fixed callback destination, refresh propagation, unauthorized reads and carousel behavior; confirm missing behavior fails.
- [x] Reuse suitable draft loader logic, implement the SVG scene and accessible immediate-content carousel, and wire the home route without changing legacy features.
- [x] Run focused checks, then lint, typecheck, complete tests and production build.
- [x] Inspect synthetic browser member/visitor views at desktop and phone widths, motion and overflow; record OAuth limitations.
- [x] Inspect diff/private-content boundaries.
- [x] Commit, push and open the issue PR for fresh independent review. Keep the checkout and branch available; no merge.

## Verification outcome

Lint, typecheck, production build and the full test command passed. Vitest: 812 passed, 2 opt-in integration tests skipped; Daisy content: 27 passed; release orchestration: 13 passed. A first test run lacked local macOS audio executables; building the pinned minimal source into the ignored development directory resolved all six failures. A first build rejected an external dependency symlink; a local dependency copy resolved it without dependency changes.

Synthetic browser checks covered desktop 1440px, phone 390px, narrow 320px and 200% text, keyboard/manual navigation, auto-advance, hover/focus/stop pauses and reduced motion. Hidden-tab pause is covered by automated tests. Real localhost rendered login only; its POST reached the existing Google provider with the exact localhost callback and PKCE. A local production build verified private/no-store and same-origin headers. The authenticated localhost homepage subsequently rendered authorized existing Rose, Marigold and Tulip entries. Real content is excluded from public evidence and fixtures; no content mutation was performed.

Candidate: [PR #166](https://github.com/C0derTang/shared-garden/pull/166), intentionally unmerged pending independent review and explicit localhost approval.

## Approved localhost visual refinement

- [x] Replace the separate scenery band and plain lower section with continuous full-viewport sunset, lake and etched foreground behind translucent reading panels.
- [x] Reshape the single rose into a tilted up-left/front three-quarter cup with nested spiral, red petals, golden rims and elongated leaves; bend its stem diagonally down-right to its anchored base.
- [x] Separate upper-stem flex, bloom nod and leaf flutter; stop all of them for reduced motion.
- [x] Recheck revised desktop/phone composition and run focused tests, full tests, lint, types and build.
- [x] Update the same PR candidate for fresh independent review.

Revised screenshots confirmed the continuous backdrop and explicit rose orientation. All local checks passed again with the same totals above. Final browser rechecks of 44px control targets, foreground-link contrast and layered motion are being recorded on the PR separately; no further code changes are planned.

Remote CI for the initial candidate was unavailable before jobs could start. Local validation is supplied; release and merge remain held. Local optional Spotify search credentials are unavailable, so no real end-to-end song-search claim is made. Existing provider behavior is unchanged.

## Natural shape and depth refinement

- [x] Rebuild the rose cup with an oblique recessed center, asymmetric overlapping petal surfaces, local light and occlusion, narrow folded rims, and varied curled leaves.
- [x] Replace terrain meshes with irregular silhouettes, eroded faces and sparse ravines, atmospheric distance, softened reflections and uneven shore detail.
- [x] Inspect synthetic desktop and phone screenshots; run applicable web checks and update PR #166.

Natural shape/depth screenshots were reviewed at desktop and phone sizes before the final commit. Focused home tests, lint, typecheck, the full test command (812 Vitest, 27 content, 13 release; 2 integration skips), and build passed. The live local homepage still returned 200 with only the login control for an anonymous request. Browser measurements confirmed foreground-link contrast above 4.5:1 at 320/390/768/1440px; final motion and screenshot evidence is recorded separately on the PR. No database checks, private configuration changes or hosted mutations were performed for this artwork revision.

This refinement changes only SVG presentation and its documentation. The existing database/Auth/concurrency/Realtime validation from candidate `9d150541462ef7561f3ed3d7ec4d5b552800f056` remains evidence for unchanged backend code; database suites are not repeated for these artwork changes. Hosted check execution remains an external blocker.

## Superseding photographic spider-lily presentation

- [x] Copy the original generated landscape and transparent red spider-lily PNGs into public assets; record sanitized exact prompts, dimensions and hashes.
- [x] Replace decorative SVG modules with responsive raster image components, preserving entry categories and every auth/carousel behavior.
- [x] Keep a complete photographic sunset behind the panels, responsive crops, a single base-anchored windblown stalk and reduced-motion support.
- [x] Inspect synthetic desktop/phone composites, transparency, image loading, readable contrast, motion and controls; retain applicable web-check logs for the same PR candidate.

The explicit user request supersedes all earlier fine-line/rose visual tasks above. Red species, crop, layer separation, motion and contrast treatments are implementation details under decision 0004. No backend or private runtime configuration changes belong to this presentation revision.

The portrait background source size accounts for its 3:2 cover footprint against viewport height, keeping the lake sharp on phones. The phone flower overlaps the footer's layout space so its stalk reaches the photographic shoreline; the backdrop stays fixed behind the full scrolling page. The first composite was checked for true transparency and intact stamen tips before these responsive adjustments.

Final raster validation: lint, typecheck, full tests (812 Vitest, 27 content, 13 release; 2 opt-in integration skips), build and diff checks passed. Retained logs and source hashes accompany independent review. Synthetic browser checks passed for optimized image loading, normal wind and reduced motion, immediate entry content, automatic/manual navigation, pause/hover/focus/keyboard behavior, 44px controls and no overflow at 320/390/768/1440px. The single old-garden link's measured contrast was at least 9.78:1 across those widths. The visitor view had only Log in with no images, SVG or links; neither browser page errors nor external requests were observed. An anonymous request to the live localhost app after the build returned 200 with login only and no artwork references. No backend suites were repeated for the raster revision; release and hosted-check gates remain unchanged.
