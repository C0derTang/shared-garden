# Pixel media forms

Status: conservative presentation choices for
[issue #104](https://github.com/C0derTang/shared-garden/issues/104), under the
approved discretion in [decision 0004](0004-finalized-launch-rules.md). They
follow the Sunflower interface in
[decision 0012](0012-sunflower-photo-interface.md), the Bluebell interface in
[decision 0013](0013-bluebell-voice-interface.md), the media limits in
[decision 0025](0025-private-media-and-photo-processing.md) and
[decision 0027](0027-private-bluebell-audio.md), the compact flower panels in
[decision 0037](0037-compact-pixel-flower-panels.md), and the tokens in
[decision 0041](0041-pixel-design-tokens.md).

## Photo pickers

Choose photo and Take photo stay two separate native file inputs with the same
explicit JPEG, PNG and WebP `accept` list. Take photo keeps
`capture="environment"`. Each input sits inside its own label, which is styled
as the app's secondary button (`button button-secondary`). The input is visually
hidden with a clip rather than `display: none`, so it stays in the tab order,
keeps the label text as its accessible name and still opens the system picker by
keyboard, pointer and screen reader.

A focused input draws the shared decision 0041 focus ring on its label. Both
labels are at least 44 pixels tall. They sit side by side from about 390 pixels
and stack at full width on the narrowest phones, so their text never wraps.
While the garden or an upload is busy, both inputs are disabled and the labels
lose their pointer cursor and hover fill.

After a photo is chosen, a hint line reads `Selected:` and the file name. It
wraps anywhere, so a long name cannot widen the sheet. Preview-before-share,
removal, replacement and every status and alert message are unchanged.

## Hints

The Sunflower limits become one hint line: format, 12 MiB, 25 million pixels,
12,000 pixels a side, no cropping, location removal, and the HEIC fallback
"HEIC? Export or choose a supported photo." The fallback stays visible at all
times, as decision 0012 requires.

The Bluebell introduction becomes one hint line: five minutes, WebM/Opus up to
12 MiB, the microphone turning on only after Record, review before sharing, and
that listening never changes growth. The microphone status keeps
`role="status"` and all of its wording, and uses the same hint style.

The hint style is the small muted text the other flower forms use under their
fields: `--muted` at `--text-xs` (0.75rem).

## Headings

The other flower forms show no heading while sharing; the sheet title already
names the flower. The Sunflower and Bluebell share forms drop their extra
heading ("A photo from your day", "A voice from your day") and keep their
accessible form names. Replacing still shows "Replace your photo" or "Replace
your voice memo" as an h3, with the same treatment as the other forms' "Edit
your entry" heading and the sheet's "Today" heading.

The focusable "Review your voice memo" heading is an h3 while sharing and an h4
under the replacement heading, so heading levels never skip. It uses one compact
bold body-font style at `--text-md` in both cases.

## Measurements

Synthetic preview of the actual flower sheet, before and after, with the form
from its top edge to the bottom of its Share button:

| Form | 320px | 390px | 1280px |
| --- | --- | --- | --- |
| Sunflower | 416 → 271px | 416 → 188px | 389 → 188px |
| Bluebell | 406 → 236px | 380 → 218px | 327 → 200px |

Before, the raw file inputs pushed the Sunflower text past the right
edge of the sheet at 320 pixels. After, nothing overflows at any width.

## Unchanged

The upload and processing pipeline, the limits themselves, recording and
validation behavior, focus movement, Tulip and Spotify, the other flower forms,
the backend and dependencies do not change.
