# Compact visual Memories collection

Status: approved conservative implementation choice for
[issue #76](https://github.com/C0derTang/shared-garden/issues/76), under the
direction in [decision 0029](0029-immersive-garden.md) and the discretion in
[decision 0004](0004-finalized-launch-rules.md).

## Collection layout

Memories opens with a short heading, one-line introduction, and a compact
Filters disclosure. Filters are closed initially. Applying a filter closes the
disclosure and leaves a named, clearable summary in view. The full garden-day
filter explanation stays inside the disclosure. Empty results use one small
book cue and one sentence.

Memory cards use the existing flower artwork as a decorative species cue,
alongside the flower name, spot, author, original Pacific posting time, garden
day, and permanent-bloom context. Cards form one column on phones and two
columns when the panel has room; Peony history spans the wider layout. This is
only presentation. The artwork does not infer or change retained growth state.

Long text shows a brief word-boundary preview with an explicit control that
replaces it with the complete original text. Peony keeps a compact milestone
count and mounts its complete current retained history only when opened. The
Dandelion wish, fulfillment fact, Daisy prompt, all ordinary contribution
types, and both relative author labels remain available.

## Private media and lifecycle

Sunflower cards lead with a contained square private-photo placeholder. The
existing explicit Load private photo action is still the first signed-media
request, and the existing contained viewer keeps the original aspect ratio
without cropping. Voice and song controls remain compact and width-bounded.
They are not placed inside a collapsible text/history region, so a closed
disclosure cannot conceal playing media. Filtering or leaving Memories unmounts
the card and retains the existing player cleanup and request cancellation.
Spotify frames and private photo or voice requests still mount only after the
user activates their existing load controls.

## Retained behavior

This change does not alter the Memories query, field allowlist, chronology,
deduplication, pagination, refresh staging, Realtime invalidation, media token
lifetime, preview fallback, edit visibility, or error preservation. Failures
keep loaded cards and expose the existing retry path. The collection remains
read-only and includes both members' retained content across all 13 flower
types, including Dandelion and Peony history.
