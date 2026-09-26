# Compact seed picker

Status: conservative presentation choices for
[issue #103](https://github.com/C0derTang/shared-garden/issues/103), under the
approved discretion in [decision 0004](0004-finalized-launch-rules.md). They
build on the catalog and planting rules in
[decision 0007](0007-garden-catalog-and-planting.md), the Dandelion wish in
[decision 0016](0016-dandelion-fulfillment.md), the selected spots in
[decision 0023](0023-selected-planting-spots.md), the Details pattern in
[decision 0037](0037-compact-pixel-flower-panels.md), and the pixel tokens in
[decision 0041](0041-pixel-design-tokens.md).

## Seed tiles

Each seed is one compact tile with a 48-pixel sprite. The sprite keeps its
64-pixel intrinsic size and is scaled by CSS, so the shared sprite component is
unchanged. The first line holds the seed name and its action label. It wraps on a
narrow phone rather than truncating. One small line gives the growth needed to
bloom and the existing availability reason, joined by a middle dot. Tiles are at
least 44 pixels tall. On a 390-pixel phone a tile measures 76 pixels, compared
with 116 before.

Tiles use a `--border-pixel` `--control-border` edge and `--radius-pixel`
corners instead of the previous 1px `--line-strong` border. A selected tile keeps
its `aria-pressed` state and shows a `--forest-dark` border with an inset line
on a sage fill, so the shared focus ring stays visible on it. A tile that is
temporarily disabled while planting, or after someone takes the spot, quiets
only its sprite.

## Locked seeds

Available seeds come first, in catalog order. Seeds that cannot be planted now
sit in a native Details disclosure titled "Still to unlock (N)", which starts
collapsed. It uses the same summary treatment as decision 0037: a 44-pixel
summary row with a pixel plus or minus mark. The summary is in the keyboard
order and opens with Enter or Space.

A locked tile stays a disabled button with its exact availability reason. Its
text is not faded. The name uses `--ink` (8.95:1) and the action and reason use
`--muted` (4.77:1) on the `--paper-deep` tile fill. Only the sprite is greyed.
Which seeds are available, and why, is unchanged.

## Plant bar

The Plant button sits in a footer that sticks to the bottom of the scrolling
sheet, so it is always reachable. When Dandelion is selected, its wish field
appears inside that footer directly above the button. The spot-taken status and
planting errors appear there too, next to the action they affect. The footer
has an opaque paper background and a thin top rule. Seed tiles reserve scroll
margin so a keyboard-focused tile is not hidden behind it.

The seed picker styles live in `seed-picker.module.css`. The seed rules and the
seed-specific disabled rules are removed from `garden.module.css`.

## Unchanged

Selection, disabled logic, availability reasons, the wish label, 1 to 500
character validation and `aria-describedby`, focus behavior, planting, flower
sheets, the garden surface, backend, and dependencies are unchanged.

## Verification boundary

Verification uses the actual `SeedPicker` in the shared bottom sheet with
disposable synthetic early-garden data at 320, 390 and 1280 pixels, with the
disclosure closed and open and with Dandelion selected. It includes lint,
typecheck, tests and a production build. It never reads or mutates production
data.
