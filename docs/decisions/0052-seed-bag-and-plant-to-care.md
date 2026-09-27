# Seed bag and plant-to-care

Status: conservative presentation and flow choices for
[issue #120](https://github.com/C0derTang/shared-garden/issues/120), under the
approved discretion in [decision 0004](0004-finalized-launch-rules.md) and the
user's reskin and UX authorization of 2026-09-26 recorded in
[decision 0049](0049-harvest-handheld-reskin.md). It supersedes the tile layout
in [decision 0043](0043-compact-seed-picker.md). It keeps the catalog, unlocks
and limits in [decision 0007](0007-garden-catalog-and-planting.md), the
Dandelion wish in [decision 0016](0016-dandelion-fulfillment.md) and the
selected spots in [decision 0023](0023-selected-planting-spots.md).

## Seed bag

Available seeds sit in a "Seed bag" inventory grid. The bag is a sunken
`--paper-deep` well with a 2px `--wood-deep` edge and a pressed inner shade.
Its label shows the number of available seeds on a small `--wood-deep` tag.
Seeds keep catalog order.

The grid has four columns from 380px up and three below that. 380px is the
hotbar's compact breakpoint in decision 0049. Four slots fit the longest names,
such as Snapdragon, on one line only from 380px. On a 390px phone a slot is
about 77×73px.

Each slot is a parchment `--frame-slot` 9-slice with the bloomed flower sprite
and the seed name in Pixelify at `--text-xs`. The sprite is 48px on phones and
64px from 640px. On phones the slot frame is drawn at 1px per art pixel (3px),
like the compact hotbar, so the name has room. From 640px it uses 2px (6px).
Slots have the tactile `--shadow-pixel` lip and press down by `--press-depth`.
With reduced motion they don't press, hop or lift.

The chosen slot matches the current hotbar slot. It has a `--gold` face, a 2px
`--wood-dark` border and a 2px inset `--rust` rim. Extra padding balances the
thinner border, so the slot keeps its size. Its sprite hops once in three steps
when it is chosen. The shared focus ring stays outside the slot. On the chosen
slot the ring's halo replaces the lip and the rim stays. Rows leave 0.6rem for
the lip. Columns are 4px apart because outlines paint above neighbouring
slots.

A slot shows only its sprite and name, so its accessible name carries the rest:
"Rose, Note about today. 5 growth units to bloom. 3 of 3 available to grow."
The visible name starts the label (WCAG 2.5.3). Every seed button keeps
`aria-pressed`. Slots are disabled while planting or after someone takes the
spot, and then only their sprite is quieted.

## Item card

An item card below the bag describes the chosen seed. It shows the sprite in a
small sunken frame, the name in Pixelify, the ritual (action label), one
`--forest` pip per growth unit (decorative, at most 14), the growth needed to
bloom and the exact availability reason. The card uses the `--frame-slot`
frame and keeps a 6rem minimum height. Before any seed is chosen it reads
"Pick a seed from your bag to see its ritual." The card is plain text. Screen
readers already hear the same facts in the slot's name.

## Locked seeds and the empty bag

Locked seeds stay in the native "Still to unlock (N)" disclosure. It starts
collapsed and has the decision 0043 summary with a Pixelify label. Each seed is
a row with a dimmed slot and readable text. The slot is a dashed
`--line-strong` square on `--paper-deep` with a greyed 32px sprite. The name is
in `--ink` and the exact reason is in `--muted`. Rows form two columns from
640px. Locked seeds remain disabled buttons with `aria-pressed="false"`.

When nothing can be planted, the picker leads with the next unlock in a
`--sage-light` card with a `--forest-dark` edge and lip, before the
disclosure. An example is "Bloom 1 more flower to unlock Daisy." The next
unlock is the locked seed, other than Cactus, with the lowest bloom threshold.
The count is that threshold minus the flowers that have bloomed, and never
less than 1. When every seed is unlocked but all are in use, the lead is
"Every seed is growing right now." A line below explains that growing flowers
free up seeds as they bloom. This only rewords the existing availability
facts. Unlock and limit logic is unchanged.

## Plant bar

The Plant button stays alone in the sticky bar, and the bar keeps one height.
Its top rule is the shared 2px dashed `--line-strong` divider. Its negative
bottom offset now matches the sheet's current bottom padding (1rem on phones,
1.25rem from 640px). The older offset left a 4px overscroll. The 7rem scroll
margin on slots, the summary and the wish field is unchanged. So is the wish
field's scroll to the nearest clear position on focus. The spot-taken status
and planting errors still appear directly above the bar.

## Plant into first care

After a successful plant the sheet doesn't close. The same sheet becomes the
new flower's sheet with its care form, titled "<Flower> planted ✿" (for
example "Rose planted ✿"). Focus moves to that title, which becomes
programmatically focusable (`tabindex="-1"`). Screen readers then announce
the new sheet, and the next Tab reaches the flower's controls. Closing the
sheet clears the planted title. Reopening the flower shows its usual sheet
titled with its name.

A rejected plant keeps the picker open with the chosen seed, the wish draft
and the error, as before. If the save succeeds but the refreshed garden does
not include the flower yet, the picker stays until it arrives. If another
member plants the spot first, the existing "Someone planted here" status is
unchanged. The selected spot comes from decision 0023 and is still the spot
that opened the sheet. The garden guide stays hidden while the sheet is open,
as before. After the care sheet closes it can still offer its next step, such
as "Visit Rose".

## Measured contrast

| Pair | Ratio |
| --- | --- |
| Slot name `--ink` on `--paper-light` / `--gold` | 13.28 / 8.68 |
| Chosen-slot `--wood-dark` border on `--paper-deep` | 9.03 |
| Chosen-slot `--rust` rim on `--gold` | 3.40 |
| Slot edge `#6e3f19` on the `--paper-deep` bag | 6.16 |
| Bag edge `--wood-deep` on `--paper` | 6.16 |
| Bag count `--paper-light` on `--wood-deep` | 6.77 |
| Focus outline `--ink` on the `--paper-deep` bag | 10.21 |
| Card and locked text `--muted` on `--paper-light` / `--paper` | 6.86 / 6.24 |
| Next-unlock lead `--forest-dark` / body `--ink` on `--sage-light` | 7.09 / 11.81 |

In forced colors the slot and card frames set `border-image-source: none`.
The chosen slot uses `Highlight` and `HighlightText`. Its focus outline is
`CanvasText`, because the ring sits outside the slot on the canvas.

## Unchanged

Seed availability and reasons, catalog order, unlocks, per-type limits and the
permanent Cactus stay the same. So do the Dandelion wish label, its 1–500
character validation and `aria-describedby`, the planting command and
duplicate-submit lock, the flower-sheet body, the garden surface, the backend
and dependencies.

## Verification boundary

Verification uses the actual `SeedPicker` in the shared bottom sheet, and the
actual `GardenClient` for plant-to-care, with disposable synthetic data. It
covers 320×568, 375×667, 390×844 and 1280×800 with a starter, a typical and an
empty bag. It also covers Dandelion selected with an error, and the
disclosure closed and open. Checks include keyboard focus against the sticky
bar and forced colors, plus lint, typecheck, tests and a production build. It
never reads or mutates production data.
