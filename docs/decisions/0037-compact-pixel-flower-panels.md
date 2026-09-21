# Compact pixel flower panels

Status: conservative presentation choices for
[issue #89](https://github.com/C0derTang/shared-garden/issues/89), under the
approved discretion in [decision 0004](0004-finalized-launch-rules.md) and the
sheet contract in [decision 0029](0029-immersive-garden.md).

Shared bottom sheets use a small corner × with a 44-pixel target, crisp border,
visible focus, and the accessible name Close. The title stays visible while the
description remains visible by default. Garden flower sheets alone opt their
redundant action summary into assistive-technology-only presentation. The existing modal,
Escape, focus-return, queue, private-notice, scrolling, and dimming behavior is
unchanged.

Flower sheets use a smaller sprite and tighter spacing. Spot, planted date,
growth rules, and permanent-bloom status live in a concise Details disclosure.
An ordinary permanent bloom does not repeat daily care markers, an empty Today
section, or a second permanence notice. Current entries, edit-window status,
errors, form labels, media, music, Dandelion, Peony, and Cactus behavior remain
available when relevant.

History begins as a compact pixel-style History control whose accessible name is
Read history. Loaded entries, empty and error states, pagination, chronology,
and read-only meaning retain their existing behavior; the secondary page action
uses the shorter visible label Older with the accessible name Older entries.
No backend, progression, media, identity, privacy, sprite, font, or dependency
change is part of this decision.
