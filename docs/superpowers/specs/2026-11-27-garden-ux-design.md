# Garden UX clarity, lakeside composition and quicker daily visits

User approval 2026-11-27: fix all three assessed UX harms—flowers lack visual priority, navigation lacks orientation, routine meaningful actions require too much travel/ceremony. Keep the experience feeling like a garden; the picker must contain only flower names and pictures. Bring the lake closer to the back garden like the original.

The user's0004/0067 conservative exact layout/wording/implementation discretion applies. Do not ask again about routine details. No activity, timing eligibility, growth, identity, privacy, capacity, backend/schema/auth/service/cost or legacy rule change. Genuine conflicts with original-front geography/appearance or other approved rules still escalate with concrete evidence.

## Three atomic changes

1. Orientation: a quiet handwritten current-place cue and subtle passive route-position marker outside the picker; clear existing tap/seed/scroll guidance; current actual type selection expressed with style/ARIA, not extra row content; fix obsolete guide instructions. Navigation remains native continuous scroll plus picture/name picker, not new stop buttons or free walking. Derive all cues from actual accepted route/camera progress; they never own a second selected stop.
2. Lakeside visibility: reposition/recompose the rear garden near the original real shore where physically feasible, with an actually curved walk and adjoining irregular mature-size beds among original landmarks. Some planted pockets may be inland; foreground/nearby lake views should be real and legible. Improve mobile/desktop camera framing and plant contrast, reduce empty sky/lawn dominance and crowded care marks. Preserve original house frame/yaw/front architecture/shoreline/sun and front appearance. Prefer fitting garden to shore over moving the authoritative lake or adding a fake second lake. Exact fit follows measured site survey and early actual render, not a blind translation of current C-room. Material conflict outside discretion is an explicit blocker, not silently approved terraforming.
3. Routine interactions: a small garden invitation outside the picker surfaces an existing next-due action using current care rules, plain task wording and an explicit visit action. Open the existing flower activity directly, without first navigating to a bed and requiring another flower tap/camera wait. Preserve scenic exploration, the underlying per-flower rules/content/history and deliberate arrival/seed rituals; no auto-submission or batch care, no task dashboard. Faster ordinary/repeat activity entry uses existing immediate/deep-link behavior where safe. Empty/all-tended/late-window/loading/refresh/busy states remain accurate and quiet.

## Picker invariant

Exactly 13 options; each option displays its canonical flower picture and flower name ONLY. No progress/counts/stages/descriptions/care badges/action icons or task text in options. Current styling/ARIA may identify the actual current type. Any onboarding, location/progress, daily invitation or activity description belongs outside the picker. Keep static portraits, no13live GPU contexts, proper focus/dismiss/own scroll and no world movement behind panel.

## Execution

One issue and dedicated isolated builder per atomic change. Orientation can proceed while read-only shore feasibility completes. Later spatial/readability work consumes the settled orientation bounds/actual-progress contract; daily-action work consumes both. Dependent builders start only after prerequisite merges. Versioned decision 0074 and the 2026-11-27 design/plan record current user approval and conservative choices; issue-specific refinements clearly separate choices from user statements. Exact-head fresh independent reviews, required CI/protections/dependencies, qualifying merge and safe cleanup apply to each PR.

## Verification

Four sizes 1280×800,390×844,844×390,800×600; empty/mixed/full 78/sparse 12001/occupied expansion and lower-hole states. Actual native wheel/touch/keyboard, camera-uniform/picking parity, priority/drag/cancel, exact surviving stop/curve retention, canonical removed-leg fallback, held-frame return, focus, overlays/typing, resize/recovery and production fixtures404. Use loopback synthetic state/fail-closed interception only. Preserve fixed quality/optimized paint and original source references; report actual limitations honestly. Meaningful regressions and lint/type/fulltest/build/WGSL/paint/house/Node 55 as affected; all 4requiredcurrentCI. Known six Mac audio_unavailable failures never hide other failures; complete Linux Web must pass. Early actual visual checkpoint before broad rendering matrices; do not repeatedly broaden checks after relevant proof passes.

## Orientation implementation choices (#228)

Conservative choices under 0004, not additional user quotations: actual directed
tour stops carry semantic places independent of their coordinates and the number
of woodland stops. A passive handwritten place cue and small ink-path position
mark read accepted cumulative arc distance. Place text is ordinary accessible
text, never a per-frame live announcement. Nearest semantic stop regions use
actual leg distances with earlier-stop ties, so every exact surviving stop and
occupied type terrace keeps its own place through remaps; return corridors are
explicitly meadow return, not an alias for a base flower anchor.

The cue takes no pointer input. Actual submitted projection and conservatively
frustum-tested flower/seed envelopes choose among a small set of safe margin
slots. A safe previous slot stays put with clearance hysteresis. No safe slot
means temporary suppression; the picker also makes the cue step aside. A cache
returns before DOM/layout reads on unchanged camera/React/resize inputs. Its measured bounds join existing world reserved
rectangles for projected captions; placement must clear global chrome and actual
flowers/seeds. The picker uses style and aria-current for the current actual type,
focuses that option when opened and scrolls it inside the panel. Outside a type
area its first canonical option is the focus fallback. No option gains any extra
content. Help explains actual native scrolling, the flower picture/name picker,
tapping flowers and seed marks, and the existing waiting-care heart.

Later spatial and daily-visit implementation remains dependent work, not an
approved final lakeside layout in this issue.
