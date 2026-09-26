# Clearer flower entries

Status: conservative presentation choices for
[issue #105](https://github.com/C0derTang/shared-garden/issues/105), under the
approved discretion in [decision 0004](0004-finalized-launch-rules.md). They
follow the daily entries in
[decision 0009](0009-daily-entries-and-questions.md), Dandelion fulfillment in
[decision 0016](0016-dandelion-fulfillment.md), the fixed Hydrangea mood palette
in [decision 0022](0022-flower-sprites.md), the compact pixel flower panels in
[decision 0037](0037-compact-pixel-flower-panels.md), and the pixel design
tokens in [decision 0041](0041-pixel-design-tokens.md).

## Hydrangea mood picker

The six moods form a two-column grid of tiles at every width, in the existing
palette order. Each tile keeps its native radio input inside a label in the
fieldset whose legend is "How are you feeling?". A tile shows the radio, a
24-pixel square swatch and the full mood name with its colour in words, such as
"Energized · Orange". The swatch is decorative (`aria-hidden`), so each radio's
accessible name is that full label and colour is never the only cue.

Tiles have a `--border-pixel` `--control-border` edge, `--radius-pixel` corners
and a 52-pixel minimum height. At 320 pixels each tile is about 134 pixels wide,
and labels wrap between words rather than inside a word. The checked tile uses a
`--frame-border` edge, an inset line, the `--sage-light` fill and a heavier
label weight. It uses no outline, so the single app focus ring stays visible on
the focused radio. Swatches are square with a 2-pixel `--frame-border` edge, in
keeping with the pixel frames. These rules move from `garden.module.css` into
`flower-sheet.module.css`.

## Saved moods

A saved Hydrangea entry, in Today and in History, shows a 16-pixel square swatch
before the mood name and colour in words. The swatch is decorative. An entry
with an unrecognised mood still reads "Mood saved" and shows no swatch. The mood
blend and its accessible description are unchanged.

## Daisy history

History entries no longer show a raw "Question" identifier. Only the answer,
author and time remain. Showing the original prompt beside a past answer would
need a history-query change and its own issue, so it is out of scope here. No
backend or query changes.

## Dandelion actions

"Fulfill our wish" opens the confirmation and changes nothing, so it uses the
secondary button style. "Confirm and blow seeds" is the committing action, so it
uses the primary button style, with "Keep waiting" as its secondary partner.
The confirmation copy, the explicit two-step flow, the retry behaviour and the
repeated-click guard are unchanged.

## Unchanged

The Hydrangea palette values and labels, the mood blend, history ordering and
paging, entry editing, the Tulip song form and Spotify picker
([decision 0034](0034-tulip-spotify-catalog-search.md)), the media forms, the
backend and dependencies are unchanged.

## Verification boundary

Verification uses the actual flower sheet in a temporary preview with disposable
synthetic data at 320, 390 and 1280 pixels, plus lint, typecheck, tests and a
production build. It never reads or mutates production data.
