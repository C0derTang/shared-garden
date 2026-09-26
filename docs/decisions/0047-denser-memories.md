# Denser Memories

Status: conservative presentation choices for
[issue #107](https://github.com/C0derTang/shared-garden/issues/107), under the
approved discretion in [decision 0004](0004-finalized-launch-rules.md). They
refine the compact collection in
[decision 0031](0031-compact-visual-memories.md) inside the route panel from
[decision 0029](0029-immersive-garden.md), and use the tokens in
[decision 0041](0041-pixel-design-tokens.md). Memory behavior follows
[decision 0018](0018-memories.md) and private media follows
[decision 0025](0025-private-media-and-photo-processing.md).

## Collection header and controls row

Memories keeps its short heading, Our memories, and the one-line introduction
that decision 0031 requires. The decorative Saved together eyebrow above the
heading is removed. The heading uses `--text-lg` and the introduction uses
`--text-sm`, with tighter margins.

Filters, a compact Refresh control and the update state share one row. The
Filters toggle fills the remaining width. Refresh shows the word Refresh and
keeps the accessible name Refresh memories. When loading failed or has not
finished, it still shows Try again. The update state shows Live or Manual, with
the complete Live updates or Manual refresh wording available to assistive
technology. The active-filter badge on the toggle shows only the count, such as
1, so the row fits at 320 pixels. The toggle's accessible name still reads, for
example, Filters, 1 active, and the named, clearable active-filter summary stays
in view below the row. The row may wrap only if a narrower view cannot hold it.

The filter form, filter error and active-filter summary appear directly below
the row. The empty feed status line takes no space until it has a message.

## Heading order

The route panel title is the page's h2. The collection heading is therefore an
h3, each memory card title is an h4, and Peony milestone headings are h5. No h1
or second h2 appears inside the panel.

## Touch targets

The active-filter Clear button, the Refresh control, the Read full memory, Read
full wish and Read full question toggles, and the About saved memories summary
each have a target at least 44 pixels high. The Clear button is also at least 44
pixels wide.

## Private photo placeholder

An unloaded Sunflower photo is a centred square no wider than
`min(100%, 12rem)`, and its Load private photo button has the same width. Once
loaded, the existing viewer uses the full card width again and keeps the
original aspect ratio without cropping. Loading still happens only after the
explicit Load action.

## Measurements

Measured with the actual components and disposable synthetic data, the first
memory card's top edge moved:

| Viewport | Before | After |
| --- | --- | --- |
| 320 x 640 | 306px | 225px |
| 390 x 844 | 318px | 237px |
| 1280 x 800 | 337px | 246px |

At 390 pixels, the placeholder dropped from 316 to 192 pixels square.

## Retained behavior

Filter open, apply, summary and clear behavior, Show N newer staging, error and
retry states, explicit tap-to-load private photos, media cleanup when filtering
or leaving, card content and density, and the one- and two-column layouts are
unchanged. No query, data, backend, dependency or other panel changes.

## Verification boundary

Verification uses the actual Memories components inside the route panel frame
with disposable synthetic data at 320, 390 and 1280 pixels, plus lint,
typecheck, tests and a production build. It never reads or mutates production
data.
