# Cozy pixel garden beds

Status: user-selected visual direction for
[issue #96](https://github.com/C0derTang/shared-garden/issues/96), under the
approved discretion in [decision 0004](0004-finalized-launch-rules.md) and the
immersive garden composition in [decision 0029](0029-immersive-garden.md). This
supersedes the scenery direction in
[decision 0039](0039-lush-pixel-meadow.md).

## Selected direction

The garden uses small warm-soil plots with pixel-cut wooden borders around each
fixed planting position. Textured grass and quiet grass clumps remain visible
between plots. The path and stones are removed so nothing runs beneath the
central flowers and the planting surface reads as a cozy garden rather than a
meadow trail.

Every plot stays compact around its flower rather than stretching into a row or
large planter. Existing flower art, fixed spot coordinates and identities, care
dots, motion preferences, panels, guide, clock, navigation, and data behavior
remain unchanged.

An unplanted position appears as an irregular bare-soil patch within its plot,
without a plus glyph, dashed border, label, or card treatment. Its full existing
button keeps the same horizontal anchor and 88-pixel mobile width while its
height expands from 64 to 130 pixels to cover the soil at the same stem height as
a flower. It keeps the accessible `Plant in spot N` name and opens the same seed
picker. Hover subtly lifts the soil color, while keyboard focus adds a
high-contrast pixel outline around the full target. Planted target dimensions,
all spot coordinates, and all spot identities remain unchanged.

All grass and plot construction is decorative, hidden from assistive technology,
and ignores pointer events. The implementation uses CSS pixel shapes with flat
colors and hard edges. It adds no image, animation, gameplay, backend,
dependency, or private-content change.

## Verification boundary

Verification covers the actual `GardenClient` with disposable synthetic full,
mixed, partial, empty, and two-bed state at phone and desktop widths. It includes
flower and seed opening, keyboard focus and focus return, target geometry, care
dots, overflow, tall-view continuity, motion and guide behavior, relevant
automated checks, and the four required hosted checks. It never reads or mutates
production data.
