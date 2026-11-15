# Private Sunset Home Implementation Plan

> Execution: dedicated issue builder; fresh independent reviewer of the pushed head, following AGENTS.md. No production release or merge.

**Goal:** Deliver the approved private sunset homepage as a localhost-reviewable candidate.

**Architecture:** A dynamic server page verifies membership and returns only access status. Responsive photographic/painterly layers and scoped CSS render the scene behind one user-initiated custom local-audio panel; the existing auth cookie adapter refreshes homepage sessions.

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


## Superseding animated scene and official player

- [x] Record the official-player choice and verified exact recording, preserving the generated artwork.
- [x] Remove homepage-only entry loading and carousels; retain independent member verification, no-store and cookie refresh.
- [x] Add one click-to-load privacy-enhanced player with accessible activation and no provider connection beforehand.
- [x] Mask cloud and separate water motion away from stationary terrain; fix the lily beside the player on wide screens and behind it on narrow screens, with reduced-motion and pause controls.
- [ ] Inspect desktop/phone stills and motion, verify Chromium/WebKit player activation and network privacy, and obtain actual in-app confirmation.
- [ ] Run and retain lint/typecheck/full test/build evidence, update the same PR and obtain fresh exact-head review.

Earlier carousel and stacked-flower tasks are historical and superseded by the
latest approval in decision 0066. No backend/provider/configuration change or
production data mutation belongs to this revision.


## Final superseding custom local-audio candidate

- [x] Remove the intermediate provider iframe and add custom native-audio play/pause, time, seeking and mute with no source/request before Play.
- [x] Add independently member-verified local-file GET/HEAD streaming, single ranges, private/no-store, refreshed cookies and path-safe generic failures.
- [x] Keep the previously verified cloud/water motion and responsive fixed lily; use no product fixture audio.
- [x] Verify controls with disposable synthetic audio in Chromium/WebKit, and actual in-app appearance, initial request privacy and motion controls.
- [x] Retain final web checks and inspect the complete diff for the candidate; publish it for fresh independent review.
- [x] Verify the user-supplied local recording's actual playback/seek/duration after private configuration. No binary or private source path is committed.

This supersedes the official-video implementation above. That earlier playback
observation does not establish local recording availability. Endpoint and UI
checks use temporary test fixtures only; actual recording verification is
tracked separately after private configuration. No production
upload, stream extraction, substitute track, merge or deployment is authorized.


Final custom-audio validation: lint, typecheck, production build and full tests
passed (828 Vitest, 27 content, 13 release; 2 opt-in integration skips). Protected
streaming checks cover authorization before file access, cookies/no-store,
GET/HEAD, bounded/suffix/open/malformed ranges, If-Range, public-path rejection
and cancellation cleanup. Synthetic Chromium/WebKit controls pass independently
of actual-song evidence. In the authenticated in-app browser the supplied local
recording reported 243.786 seconds, advanced beyond five seconds, paused, sought
to 24.4 seconds, muted and resumed beyond 30 seconds, then stopped/reset. No
iframe or provider request is used. Source bytes, paths and private metadata
remain outside the repository. Regional motion samples change cloud/water pixels
while sampled mountain and shoreline pixels remain identical. Reduced motion,
manual pause, fixed narrow-screen lily and control hit targets pass. Final
exact-source browser evidence is recorded separately for independent review.


## Superseding square glass player

- [x] Replace the rectangular title/time/mute presentation with one responsive square liquid-glass panel, a grooved playback-driven disk, play/pause and scrub controls.
- [x] Preserve accessible names/time announcements, screen-reader errors/retry, independent scenery pause and reduced motion without visible panel prose.
- [x] Recheck desktop/phone square geometry and disk playback/pause/wait/end/reduced-motion behavior in both browsers and actual in-app playback; final contrast is recorded with the refined controls.
- [x] Retain final web checks for the superseding refined controls; publish the final candidate for independent review.

Audio delivery, the private supplied file, authentication and regional scenery
motion remain unchanged. No private file/path or new media binary is committed.


## Final centered, borderless glass refinements

- [x] Center the panel in both viewport axes and remove its rim/border and corner scenery button.
- [x] Put the icon-only play/pause target below a translucent seek bar; remove the garden-link box and keep underlined text.
- [x] Fix the independently reproduced WebKit seek/resume disk state with a guarded native seek-completion check; confirm the regression fails before the correction and passes afterward.
- [x] Apply the latest spacing approval: replace the square constraint with content-driven height, comfortable responsive record size and balanced padding; darken the seek handle against the glass.
- [x] Verify final centering, contrast, control order, native playback/disk states and reduced motion; retain current checks and publish the new candidate for fresh review.
- [ ] Obtain fresh independent approval for the exact final head; keep merge and deployment held.

The operating-system reduced-motion preference remains the decorative motion
control. Earlier visible scenery/mute controls, rectangular layout, borders and
boxed backlink are superseded by the user's latest approvals in decision0066.
The latest approval also supersedes the square aspect constraint; the natural
height keeps the record comfortably sized on narrow screens without extra blank
space around the controls.

Final refinement verification: lint, typecheck, build and the full test command
pass (828 Vitest, 27 content, 13 release; 2 opt-in integration skips). Both
Chromium and WebKit confirm native playback, pause, seeking, loading/error/end
states, retry and reduced motion. The reproduced WebKit buffered-seek case now
keeps the record turning while audio progresses; a paused seek keeps it still.
The actual in-app browser independently played and sought the privately supplied
recording, observed the disk continuing afterward, then paused/reset it.

Native screenshots confirm the centered, text-free, borderless panel and the
natural record/control spacing. Across 320/390/768/1440px widths the final seek
handle measures at least 3.36:1, the play icon at least 4.60:1 and the shadowed
garden-link glyphs at least 6.16:1 against their rendered surroundings. Short
windows down to 320×320 retain reachable, unobstructed 44px seek and 56×48px play
targets without horizontal overflow. The flower stays fixed during scrolling.
These browser measurements and screenshots use synthetic fixtures outside the
product; supplied-recording checks are separate. Remote CI remains unavailable
before jobs start, and local evidence does not waive repository gates.


## Lower player and private synchronized lyrics

- [x] Read the latest issue approval; retain the same isolated issue branch and protected recording.
- [x] Lower the player and tighten record/seek/play spacing while retaining short-screen reachability and the unboxed backlink.
- [x] Add bounded, member-verified private cue JSON loading with refreshed cookies, no-store, safe failure and no path/metadata disclosure.
- [x] Fetch cues only after Play; select by native time through delay, seeking, pause, instrumental gaps and end. Keep missing cues independent of audio.
- [x] Add original synthetic parser/auth/file-boundary and playback synchronization regression tests, first observed failing then passing.
- [x] Inspect browser layout/contrast and synchronized synthetic cues in Chromium/WebKit, including short screens and reduced motion.
- [ ] Validate privately derived actual-song cues once supplied; no invented lyrics or timing and no private transcript in Git.
- [x] Retain full checks and publish the candidate for independent review.
- [ ] Obtain fresh exact-head review. Keep merge and deployment held.

Lyric implementation verification: lint, typecheck, build and full tests pass
(853 Vitest, 27 content and 13 release; 2 opt-in integration skips). Both browser
engines verify lazy requests, delayed cues after seeking, pause retention, 16
boundary/gap samples, blank ending, reduced motion and continued audio when cues
are unavailable. The lower player does not move as lyrics appear; long synthetic
lines wrap without clipping across eight normal/short viewport sizes. The final
glyph halo measures at least 15.23:1; play, seek-thumb and backlink contrast remain
at least 4.43:1, 4.11:1 and 6.16:1 respectively. Anonymous localhost still renders
only Log in, and its lyric endpoint returns empty 401/private-no-store without a
redirect. Actual transcript/timing validation remains pending after an inaccurate
first local transcription was withheld. No real lyrics or private cues are
included in this candidate or its public evidence.
