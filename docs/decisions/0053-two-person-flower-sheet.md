# Two-person flower sheet

Status: conservative presentation choices for
[issue #121](https://github.com/C0derTang/shared-garden/issues/121), under the
approved discretion in [decision 0004](0004-finalized-launch-rules.md) and the
user's reskin authorization recorded in
[decision 0049](0049-harvest-handheld-reskin.md). It builds in the Harvest
Handheld tokens, frames, font and press styles from decision 0049. It updates
the flower-sheet body in
[decision 0037](0037-compact-pixel-flower-panels.md). The daily entries in
[decision 0009](0009-daily-entries-and-questions.md), the media, music, Peony
and Dandelion interfaces in decisions
[0012](0012-sunflower-photo-interface.md)–[0016](0016-dandelion-fulfillment.md),
and the growth and 4 a.m. rollover rules in
[decision 0010](0010-garden-rollover.md) are unchanged. The one-line state cue
in the sheet heading belongs to the Today card and flower cue work
([issue #119](https://github.com/C0derTang/shared-garden/issues/119)) and is
not part of this decision.

## Growth at a glance

The sprite sits in a parchment inventory slot (`--frame-slot`). Beside it, one
line states the growth rule outside Details, for example "3 of 5 · +1 at 4 a.m.
when you both care". The count is in Pixelify Sans and the rule in muted body
text. Cactus reads "when you both check in". A Peony shows "0 of 4
milestones", and its own panel explains the rest. A permanent bloom shows "In
bloom · permanent", a bloomed Cactus "In bloom · check-ins continue", and a
fulfilled Dandelion "Wish fulfilled · a keepsake".

Below the line is a segmented growth bar with one cell per growth unit, inside a
2px `--frame-border` well. Filled cells are `--forest` with the bevel. Empty
cells are `--paper-deep` (3.64:1 against filled cells). A bloom fills every
cell with `--gold`. The bar is a `progressbar` named "<Flower> progress", with
the value and a text value such as "3 of 5 growth units" or "In bloom". Details
keeps the spot, planted date, bloom status and the full growth-and-loss rule,
behind a 44px summary between 2px dashed `--line-strong` dividers.

## You and Partner cards

Today's entries become two cards in a region still named "Today's entries",
under a Pixelify "Today" title. Each card is an `article` named by its heading,
"You" or "Partner", on a parchment slot. The card header has a 12px square care
dot with the same meaning as the surface care dots: filled `--forest` for you,
filled `--rust` for your partner, and an empty `--ink` outline before care. It
also has a status tag:

| Card | Cared today | Not yet |
| --- | --- | --- |
| Partner | "Cared today" (`--forest-dark` on `--sage-light`, 7.09:1) | "Not yet today" (`--muted` on `--paper-deep`, 5.27:1) |
| You | "Cared today" | "Your turn" (`--ink` on `--gold`, 8.68:1) |

The status comes from the authoritative day markers, the same source as the
care dots. The partner card comes first once your partner has cared or has an
entry. Otherwise your card comes first, because it holds the form. An empty
partner card says "Their care shows up here as soon as they share." Your empty
card holds the unchanged per-flower form, including the closed-Moonflower
draft notice.

Each entry shows its Pacific posting time and its content. Your own entry keeps
its edit window line and the "Edit your entry" button, and the edit form opens
inside your card. After the window it says "Edit window ended". The redundant
"Read-only · Your partner's entry" label is removed, because the Partner card
already says whose entry it is, and partner entries never offered editing. The
separate "Your care for this garden day is already here" line and the
"You · cared today" marker row are removed. The card status and the growth line
replace them.

The cards sit side by side when both are short read-only notes and the sheet is
wide enough for two 12.5rem columns (the 1280 desktop sheet). They stack
whenever a form is open, for photo, voice and song flowers, and at phone widths.
A flower that needs no daily care (an ordinary permanent bloom, including a
fulfilled Dandelion) shows only cards that have entries, without dots or status
tags, and no empty Today section, as decision 0037 requires. Peony keeps its
separate panel.

## Next step after sharing

After a new share succeeds, a status notice says "Saved · your partner can see
it now." Below it, a full-width primary button "Next: <Flower> →" opens the next
flower that still wants your care. The arrow is decorative, so the accessible
name is "Next: <Flower>". The next flower is the first due flower after this
spot in spot order, wrapping around. A flower is due for you when you have not
cared today, and it is not a Peony, an ordinary permanent bloom (a bloomed
Cactus still counts) or a Moonflower outside its hours. This matches the care
dots.

When nothing else is due, the line "That's everything for today ✿" appears with
a secondary Close button. Its accessible name is "Close and return to the
garden", so it stays distinct from the sheet's × Close. Focus moves to the Next
or Close button after the share, because the form it came from is gone.
Opening the next flower uses the garden's existing open-spot state. The first
sheet closes, the next opens with the usual focus handling, and closing it
returns focus to that flower on the garden. A saved edit shows the same notice
without a next step.

The due check is a small local helper in `flower-cards.ts`. Issue #119 adds a
shared pure due-rule module. Once both land, this helper should be replaced by
that module, which applies the same rule.

## History and controls

History keeps its behavior, labels, pagination and reconciliation. Earlier
entries are parchment slots with the author and day. The History and Older
buttons gain the bevel, a `--paper-deep` hover and the pressed bevel. When a
permanent bloom goes straight from Details to History, only one divider shows.

In forced colors, the sprite slot, cards and history slots drop their painted
frames (`border-image-source: none`) for a 2px system border. Filled growth
cells and care dots use `CanvasText`.

## Verification boundary

Verification covers every non-Peony flower type in the partner-only, you-only,
both and neither states, and next-flower navigation and focus in the real
garden. It uses actual components with disposable synthetic data at 320, 390 and
1280 pixels. No product rule, growth rule, backend, schema, route, dependency or
sprite changes.
