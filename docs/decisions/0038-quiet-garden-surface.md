# Quiet garden surface

Status: conservative presentation choices for
[issue #93](https://github.com/C0derTang/shared-garden/issues/93), under the
approved discretion in [decision 0004](0004-finalized-launch-rules.md) and the
immersive direction in [decision 0029](0029-immersive-garden.md).

The resting garden surface shows each planted flower through its existing
artwork and, when relevant, its two care dots. Repeated visible flower names,
growth totals, bloom or fulfilled labels, and decorative bed numbers are
removed. Each flower trigger retains its complete accessible name with species,
spot, permanent state or progress, and applicable care count. Opening that
trigger continues to show the visible flower title and full details.

The two label boxes stay invisible and outside the accessibility tree while
retaining their exact existing dimensions. This keeps every sprite and flower target at its
existing coordinates and size across growth stages and breakpoints. Empty spots,
fixed spot and bed geometry, scenery, artwork, idle motion, reduced-motion and
member-motion behavior remain unchanged.

The clock uses the shorter labels `Pacific` and `New day in` while preserving
the live Pacific time and rollover countdown. The toolbar uses `Help`, and its
collapsed content keeps planting guidance, counts, bed expansion, the dated
garden day, the 4 a.m. Pacific boundary, Moonflower hours, care-dot meaning,
connection state, and refresh. Songs and the existing guide controls remain
available with their current targets and navigation. No background, gameplay,
data, privacy, route, font, icon, dependency, or sheet behavior changes.
