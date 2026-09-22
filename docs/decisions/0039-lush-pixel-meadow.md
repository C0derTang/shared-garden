# Lush pixel meadow scenery

Status: user-selected visual direction for
[issue #90](https://github.com/C0derTang/shared-garden/issues/90), under the
approved discretion in [decision 0004](0004-finalized-launch-rules.md) and the
immersive garden composition in [decision 0029](0029-immersive-garden.md).

## Selected direction

The user selected a lush pixel meadow with textured grass, a narrow winding
path, and scattered stones. The existing flower artwork, fixed spot identities
and coordinates, care dots, quiet labels, empty-spot controls, compact panels,
and motion preferences remain unchanged.

The meadow uses a deeper green base with a fixed-scale 48-pixel grass texture,
small irregular color clusters, crisp grass clumps, and pixel-edged stones. A narrow stepped path crosses
each bed through six overlapping pieces. Alternating bed geometry changes its
middle turns with fixed pixel offsets while preserving matching entry and exit
points, so additional
beds form one continuous landscape instead of repeating a broad polygon.

All scenery is decorative, hidden from assistive technology, and ignores pointer
events. It contains no controls and sits behind the existing plant targets. The
implementation uses CSS pixel shapes with flat colors, hard edges, and no image,
gradient, animation, gameplay, data, dependency, or private-content change.

## Verification boundary

Verification covers the actual `GardenClient` with disposable synthetic full,
mixed, empty, and two-bed state at phone and desktop widths. It includes flower
and seed opening, keyboard focus, target geometry, care-dot readability,
overflow, tall-view continuity, existing automated checks, and the four required
CI jobs. It never reads or mutates production data.
