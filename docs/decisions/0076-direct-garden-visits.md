# 0076 — A little invitation, direct flower visits

Conservative presentation choices for [#230](https://github.com/C0derTang/shared-garden/issues/230), within [0004](0004-finalized-launch-rules.md), [0067](0067-garden-overhaul.md), [0074](0074-garden-ux-clarity.md), and the accepted [0075](0075-lakeside-bank-garden.md) layout. Dependencies #228 and #229 are merged. This record is drafted before core edits and will ship with the feature; it is not a separate pre-implementation commit.

The quiet handwritten place note can carry one invitation button beneath its existing place/progress ink. Its words identify the flower and the real activity: write a note, check in, share a song, leave an appreciation, answer a question, choose a mood color, share a photo, write an honest check-in, leave a late-night thought, record a voice memo, add to a wish, or share a memory. These describe the existing individual forms. No invitation submits anything. Peony retains its ordered milestones and is never daily care.

`gardenTodayPlan(state).next` alone selects the actual plant UUID: existing due-for-you eligibility, partner-already-cared priority, then persisted spot order under NO_DECAY. No type/latest-overflow anchor substitutes for that identity. The existing state/window rules decide Moonflower eligibility. No next item means no invitation, whether empty, all cared, partner still due, or Moonflower closed; omission deliberately makes no all-tended claim. A failed refresh or unresolved day rollover withholds a stale invitation; busy disables the button. Fresh shared state recomputes it.

The invitation and passive place cue share the existing actual-view placement and reservation, preserving its no-safe-slot suppression and target clearance. The invitation has a 44px action; the picker remains exactly thirteen image/name-only options. Before any world frame, a safe-area fallback makes the explicit action available without waiting for GPU readiness. Actual frames then choose a reserved safe margin slot. The note is hidden under a picker, sheet, full view, or deliberate arrival; no second navigation/camera authority is introduced.

Ordinary flower visits (physical flower, keyboard plot, overlay, next action and invitation) reuse the supported immediate visit path. The real form opens in the same intent, without the 950ms pre-panel glide. Scenic native scroll/picker exploration, planting glide, occasional arrival and bounded Dandelion seed hold remain. Immediate visits do not need a rendered frame. Closing restores the retained tour coordinate/lens/heading through the existing renderer; a newer explicit flower intent supersedes an ordinary camera return, while a seed hold retains its bounded ownership. Focus returns to the invitation if it remains available, otherwise the world, without stealing a newer target. No backend, geometry, model, rule, ID, history, media, service or privacy change is authorized.

Verification and measurements will be recorded with the final candidate. Phone browser emulation is not physical-device or assistive-technology validation; latency is a local action-to-interactive sample, not a universal device claim.

## Verification notes

The first desktop/phone direction was inspected before broad checks. Its first
form screenshot was taken during the retained CSS transition and is preserved as
an adverse witness; a second checkpoint uses a trusted field click and keyboard
input with the real form visible. No claim of visible interaction is based on
programmatic DOM fill alone.

A refused return focus during modal cleanup is retried by animation frame, with
a bounded retry count matching the existing plot-focus convention. A newer
flower/plant/overlay intent cancels that return; existing outside keyboard/pointer
focus also wins. This corrects an observed desktop body-focus outcome without a
timer sleep. During a seed hold the existing bounded ownership remains intact.

The [verification ledger](../evidence/0230-direct-visits.json) preserves separate
DOM, visible/hittable and trusted-typing distributions, the original before
capture and an explicitly labeled replay from the immutable prerequisite. The
normal panel animation remains; these are local synthetic-browser samples,
including automation scrolling/actionability, not a universal speed promise.
The four-size matrix covers every individual activity and all twelve daily
invitation labels/UUIDs, physical flower picking, exact actual camera return,
held-frame reopening, quiet/window/shared-refresh states and GPU recreation.
Original GPU/geometry/paint/house inputs remain byte-identical to the accepted
prerequisite; their evidence keeps its original provenance.

Test-only prerequisite #233 is merged at `1db0a7e9b2ef858501946077585a74353d5c69d3`.
Its ground-sampler helper changes the existing metadata tool's broad source scan,
which includes test support despite its runtime-hash field name. Original capture
hashes remain untouched. The [input bridge](../evidence/0230-production-inputs.json)
proves all 312 actual production source files still match the frozen issue 230 capture;
417 of the earlier 418 unchanged inputs remain identical, with the sole test-only
delta explicitly recorded.

Fresh expanded-note checks use 32 actual native views, both long Moonflower and
Snapdragon labels, and all four sizes. Twenty-six expose a clear 44px invitation;
six crowded 844×390 views with 78 plants use the approved no-safe-slot suppression (both
labels at overlook, own activity flower and inland Bluebell). The Rose departure
curve remains available there. Visible notes clear actual plant/seed envelopes,
hearts, global chrome and the picker tab. Forced suppression/recovery works in
all eight contexts; all eight correct-UUID physical flower forms remain reachable.
No overlap or aesthetic change is forced to keep a note visible.

Final lint, types, build, 55 Node checks and production-mode seven-fixture404 checks
pass. The full Mac web run passes 1,510 tests with the six known audio decoder
failures and three existing skips recorded explicitly; complete Linux Web and
all required current-head CI remain merge gates. Fresh independent exact-head
review and safe merge/cleanup belong to the orchestrator. No builder
self-approval or merge is implied.
