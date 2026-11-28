# 0078 — Lower garden views with the original opposite-bank trees

Current direction for [#237](https://github.com/C0derTang/shared-garden/issues/237):
lower the private garden camera and aim upward, keeping real flowers prominent
and the original trees across the lake visible on desktop and phone. The user
specifically suggested lowering the camera while tilting it up. Exact heights,
aim and conditional minimal desktop framing exceptions are measured choices
under [0004](0004-finalized-launch-rules.md), preserving
[0073](0073-compact-scrolling-garden.md), [0075](0075-lakeside-bank-garden.md) and
[0076](0076-direct-garden-visits.md); the numeric values below are not user quotes.
This record was first drafted before the initial production edit and updated
as the user's direction evolved. It ships with the feature without fictional
earlier commits.

## Camera and unchanged physical garden

The existing tour remains the only pose/navigation authority. Camera eyeY and
look elevation change; eyeXZ, heading, stop identity, physical controls, path
arc/native pixels and persisted plant identities remain fixed. Original front,
entry, porch, access, arrival and legacy cameras retain their original inputs.
Fully focused forms retain their lens authority. No lake, terrain, shore, tree,
house, rock, flower position/model/growth scale, lighting or shader changes.

The existing six-slot address calculation is extracted as one canonical
`terraceSlotPosition` function, consumed by both layout and camera framing.
Operation order remains identical. Executing the original Git-object layout
and comparing its real root/bed data and Float32 vertex/Uint32 index outputs
proves exact parity for base and occupied sparse expansions. Camera framing
uses those same six centres and the existing mature envelopes, independent of
current occupancy/growth/seed, so routine care does not move a view.

Camera height clears the unchanged bank/path toward a real seed as well as
mature flower heads. Native poses interpolate height offsets separately from
immutable physical edge/controlY; lowering the camera never lowers the walk or
soil. Interior camera height stays above the existing rendered-surface authority.
The original0.015rad/cm continuous-lens limit and all geometry/picking thresholds
remain unchanged.

## Original zoom and measured exceptions

Original zoom is retained wherever it fits, including **every phone view** and
nine base species' desktop views. At a terrain-clear lowered Cactus eye near
Y1.94 (about0.70m above the actual path), the lowest real seed tip is around
-32.03° while original far-shore crown median/90th-percentile angles are about
+3.78°/+7.72°. Original30° desktop framing cannot contain that35.8–39.8° interval.
Actual original-zoom captures confirm it: seed-inclusive aim shows plants plus
water/reflections, while tree-inclusive aim puts the bed below the desktop frame.

The orchestrator authorized measured minimal wide-screen exceptions up to44°
under0004 after inspecting that conflict. The current accepted preview uses
Cactus44°, Dandelion42°, Hydrangea44° and Moonflower44° vertical floors. Their
lowered eyes and raised aim remain the main solution. Wider existing portrait
framing is unchanged. Other nine original30°/38° wide lenses remain exact.
Metadata interpolates through the existing route rather than changing lenses
at heading thresholds. No widening above44°, eyeXZ move or world change is
approved by this record without concrete escalation.

All eight desktop/phone mature/early exception pairs were inspected and accepted
before broad final verification. Ninety-six trusted real UUID picks preserve
strict actual/source Float32 matrices and exact returns. An independent exact
triangle-clipping audit clears a conservative1mm sight corridor to every real
head/sprout body against actual terrain, path, soil, edging-rock and original-rock
output buffers:96audits, no through-ground/rock accepted UUID. Visual inspection
supplements that opaque-geometry proof; 2D picking alone is insufficient.

Bluebell, Forget-me-not and Daisy remain natural **inland-facing** turns toward
the woods. Their original direction and physical place remain; no claim is made
that water sits behind those flowers. The route retains its original house view
and natural turns.

## Integration and final verification

[#236](https://github.com/C0derTang/shared-garden/issues/236) reuses the existing
PlantView via shovel and removes empty glowing/hit affordances. It merges first.
This builder consumes only the confirmed merged default before final combined
checks. Real seed-stage flower UUIDs remain; removed empty planting markers are
checked absent rather than retained as targets. No UI redesign belongs to237.

Final broad proof requires all676near real mature/early/occupied UUID cases plus
56far193-Rose real cases at the four required sizes, mandatory exact sight corridors tied to actual eyes,
zero actual empty-marker draws, original planting UI/shovel/menu/label/heart
reservations and exact current-camera return/held/refresh/curve behavior.
Source-start/end per-file manifests and the final commit bind captures honestly.
Full local checks, actual production seven-fixture404, exact-head LinuxWeb/fourCI,
fresh independent review and orchestrator merge/closure/cleanup remain required.

## Preserved exploration history

- Genuine zero-degree desktop/phone baselines were captured before the first
  production edit. Starting+3° retained all six mature Daisy UUIDs but clipped
  its **empty next-planting marker**. It was never a real flower failure.
- The initial+2° checkpoint passed and was inspected. Its784target picks contain
  676real flower UUIDs and108retiring empty markers. All raw captures, source
  manifests, commands and failures remain unchanged, explicitly superseded.
- After the user asked for more tilt, +3° short/tall mature/early previews passed
  54real UUID picks and were inspected. A later explicit opposite-bank-tree
  outcome superseded the fixed-lens/2–3°-only assumptions: desktop still showed
  water without trees.
- Lens-only probes revealed actual trees, but96.6° desktop Cactus made the bed
  too small. A0.01697rad/cm short-turn lens change exceeded the unchanged0.015
  limit. That candidate was rejected. The subsequent60°-floor source-only
  prototype never became a final design or native verification claim.
- The first near-ground lower-camera probe hid Cactus behind the unchanged
  bank/path; phone also failed a real UUID. Desktop2D through-ground clicks were
  explicitly rejected as visibility proof. Moderate-eye original-zoom witnesses
  then established the concrete framing interval above before any small fallback.

Earlier superseded two-degree calibration pairs remain public and accurately
labeled: [desktop Daisy](../evidence/0237-desktop-daisy.webp),
[desktop Sunflower](../evidence/0237-desktop-sunflower.webp),
[phone Daisy](../evidence/0237-phone-daisy.webp),
[phone Sunflower](../evidence/0237-phone-sunflower.webp). Same synthetic state,
clock/aspect/DPR and reduced-motion worldtime0 apply within each matched pair;
only the synthetic fixture debug button is hidden. Product UI stays visible.
These are not the final lowered-camera candidate. Final evidence/input bridges
must identify intended camera deltas without relabeling old metadata or images.

All content is sanitized synthetic loopback verification. No private backend,
source brief, account details, credentials, service/cost, rule, auth or schema
change is included. Emulated mouse/wheel/phone viewport checks are not physical
phone or assistive-technology validation, nor universal performance claims.

## Finite original forest and the coupled heart reservation correction

The original forest has a finite horizontal extent. A source-only probe of the
existing193-Rose scenario finds no original far-crown origins in the preserved
facing at terrace403 on either size; terrace416's natural bend reveals3153
desktop/992phone crown origins. These are source projections, not native
visibility claims. Under0004, the orchestrator retains original geography and
facing: actual opposite-bank-tree proof applies base water-facing and near
occupied views where that original forest lies in view. Remote views keep
terrain-clear flowers, original routes/identities and supported193-Rose
continuity/geometry coverage. No universal trees-at-infinite-expansion claim,
new forest, extra widening or silent eyeXZ/heading change is made.

After confirmed integration of merged236 at3a73e57, a real844×390 early Moonflower
frame exposed a neighboring decorative Cactus heart over the lower picker tab.
The renderer's existing reserved-bounds visibility gate covered interactive
captions only, so passive care spans bypassed it. The orchestrator authorized
a one-condition coupled correction under0004/0075 before implementation: care
marks use that same scenic reservation gate. Actual eligibility, actions,
models, geometry, timing and default non-scenic behavior stay unchanged.
A meaningful regression fails before the fix and passes suppression/recovery
and default-world controls afterward; the actual failed case passes six real
UUID/sight-corridor/Float32-return checks after the correction.

The pre-correction467real picks/opaque-geometry audits remain honest history
at runtime7250396b. The heart correction uses runtimeb9dc4b5f; its subsequent
partial497real passes and actual expansion-crop failure remain historical. Earlier combined screenshot
names collided between mature and early states; overwritten mature pixels are
not claimed retained originals. Final stage-specific filenames keep every
current mature/early/occupied capture distinct. Final runtime checks are rerun
for the actual corrected candidate; old metadata is never relabeled.

## True projection-plane seed bounds

The merged landscape occupied Rose view exposed a second real framing issue:
UUID12004's terrain-clear seed tip projected below the390px viewport. Spherical
elevation used horizontal radial distance and understated the downward angle of
lateral slots. At that actual pose, the radial angle was−34.79° but the true
camera-plane angle was−36.42°. The retained failure is not a hidden-form or
picking-oracle success. A regression on the original candidate also fails at
desktop bed13 slot3 (y823.92 in an800px viewport).

Under the same calibration discretion, framing now computes the lowest seed
angle using depth projected onto the existing camera heading. It adjusts aim
only as far downward as needed to retain the existing two-degree seed margin,
within the existing lens budget. Lowered eyeY, eyeXZ, yaw, world, phone lenses
and the<=44° cap remain unchanged. The earlier+8° upper-frame target was a
calibration aid, not an approved universal requirement. The unit regression
passes with the original continuity threshold; actual corrected desktop and
landscape expansion captures each pass13real UUID/sightline/source-return cases
while recognizable original far-bank crowns/trunks remain visible. The
orchestrator inspected and accepted both before the final broad run.

Current runtime source fingerprint is
`7903598e3549cb78171f6d41247defb5f59c942c725020297f92a0465e366550`.
Fresh final per-file manifests bind each capture; the older b9dc4b5f failure,
RED/GREEN logs and captured fixture states retain their original provenance.

Current merged-source native strips (mature left, representative early right):
[desktop Cactus](../evidence/0237-current-desktop-cactus.webp),
[desktop Sunflower](../evidence/0237-current-desktop-sunflower.webp),
[phone Cactus](../evidence/0237-current-portrait-cactus.webp),
[phone Sunflower](../evidence/0237-current-portrait-sunflower.webp).
These are current-state growth comparisons, not before/after identity claims.
The orchestrator inspected all four. Raw stage-specific images, actual fixture
states and per-file source manifests remain separate; the sanitized ledger
records their hashes and the intended camera/source deltas.
