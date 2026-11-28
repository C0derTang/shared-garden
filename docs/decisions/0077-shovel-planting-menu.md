# 0077 — The shovel opens the existing planting screen

Approved direct user requests for [issue #236](https://github.com/C0derTang/shared-garden/issues/236): one right-side shovel entry replaces empty-plot planting. The subsequent user correction explicitly requires reuse of the already existing planting UI and removal of the glowing dot in front of each planter. This correction supersedes the proposed dedicated drawer and portrait grid; those preview images are discarded design exploration, not the approved final product. The separate navigation picker remains exactly thirteen pictures and names.

These conservative details use [0004](0004-finalized-launch-rules.md), [0067](0067-garden-overhaul.md), [0075](0075-lakeside-bank-garden.md), [0076](0076-direct-garden-visits.md) and the [revised implementation plan](../superpowers/plans/2026-11-28-shovel-planting-menu.md). The first record and short plan were written before core edits and ship with the feature; this version records the user's later correction without claiming an earlier documentation commit.

One recognizable inline spade tab sits above the existing lower-right flower-navigation tab with the same safe-area margins and at least 44px targets. It opens the original planting SplitView immediately: the original procedural flower preview, thirteen radio choices, activity and growth descriptions, conditional shared Dandelion wish, errors, and one explicit confirmation. Original visual markup and styles are preserved. Opening, selecting and closing never mutate or require a camera trip to an empty plot.

At explicit submit the reused transaction reads the latest positive safe integer `state.garden.next_spot`. This is the existing global persisted slot; unchanged type layout maps the selected flower into its matching bed. Shared refresh and conflict errors preserve type/wish; retries require another explicit submit and current state. Existing duplicate-submit lock and wish validation remain. No cached opening address or negative view ID is submitted.

The two menus are mutually exclusive. Opening the navigation picker is a newer explicit intent, so a refused close-focus retry from planting cannot steal its focus. Planting retains the original sheet scope, modal focus trap, Escape and close controls. Close returns focus to the shovel or safe world fallback unless newer intent/focus owns it. Typing and form scroll cannot move the tour. Menu access is independent of rendered plots and GPU readiness after normal arrival. Opening and closing retain actual tour coordinate, lens and heading.

Only GardenV2 opts out of empty planting targets through an optional shared-renderer flag whose default preserves existing consumers. Empty marker drawing, picking, keyboard targets, clickable area captions and cue seed reservations disappear. Passive area names, actual flowers and real Dandelion drifting seeds remain. Immutable beds, routes, layout addresses and ground coverage remain unchanged. Hint and guide point to the shovel. The short initial hint reads “scroll to wander · shovel to plant” so its original floating line clears both right-side tabs on phones; planting-screen markup/styles are unchanged.

Decision0076's initiating and queued-visit guards remain: real late save data still applies and announces, while close/newer menu/flower intent preserves its draft, href, focus and tour. Uninterrupted active success opens the actual new flower UUID; close-only late completion stays in the garden. There is no cancellation, automatic submit or retry. No backend, schema, rules, auth, privacy, dependency, geography, house/lake, model, shader or legacy change is included.

Integration order was revised after the user's correction: #236 ships first from the merged #230/#233 baseline; independent camera #237 then integrates this merged menu and verifies combined upward framing and controls. This issue does not consume an unmerged camera candidate. Fresh exact-head independent review and repository gates remain required.

## Verification record

The orchestrator inspected the restored original desktop/phone planting screen,
including its hero, original radio descriptions, a trusted typed Dandelion wish
and existing explicit button, and accepted reuse of that presentation. A dim
first world screenshot was taken during the inherited readiness fade; settled
close captures show actual canvas opacity 1, no inert/modal blocker, native scroll
and a physical Rose opening its original UUID. No lighting or animation was
changed to improve a screenshot.

The [verification ledger](../evidence/0236-shovel-planting.json) and
[explicit input qualification](../evidence/0236-production-inputs.json) retain
fresh four-size actual planting/GPU placement, absent-target, state, focus,
refresh/conflict and lifecycle proof, raw adverse witnesses and platform limits.
The earlier custom drawer/grid proposal is explicitly superseded history.
Original immutable camera, geography, models, shaders, house, lake and paint
inputs stay unchanged; changed marker control has fresh actual draw/pick proof
and a positive shared-default control. No all-GPU-input equality claim is made.
Six unchanged Mac audio decoder failures remain explicit; complete Linux Web,
all four current-head checks and fresh exact-head independent review gate merge.

Final source `e3b7e4ea…` passes 52 actual type submissions and matching-bed GPU
checks at four sizes, 24 delayed-save controls, 16 state/size transactions,
normal/reduced pre-device/held/recovery cases, 32 invitation reservation views,
and retained arrival/Dandelion seed lifecycle checks. The short hint has an
actual phone-overlap RED witness and four-size clearance GREEN proof. Local
lint, types, build, 55 Node tests and seven actual production fixture404 checks
pass. Full Mac tests pass 1,535, with the six known audio failures and three
existing skips recorded explicitly; Linux CI and independent review remain gates.
