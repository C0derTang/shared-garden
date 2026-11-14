# Private Sunset Home Implementation Plan

> Execution: dedicated issue builder; fresh independent reviewer of the pushed head, following AGENTS.md. No production release or merge.

**Goal:** Deliver the approved private sunset homepage as a localhost-reviewable candidate.

**Architecture:** A dynamic server page verifies membership before loading three bounded memory lists. A scoped SVG/CSS presentation renders the scene and client carousels; the existing auth cookie adapter refreshes homepage sessions.

**Tech stack:** Existing Next.js, React, TypeScript, SVG and CSS modules; no new dependencies.

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
`src/components/sunset-home/` owns scene, rose, carousel and scoped styling;
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
