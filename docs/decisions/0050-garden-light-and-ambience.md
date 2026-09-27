# Garden light and ambience

Status: conservative visual choices under the approved discretion in
[decision 0004](0004-finalized-launch-rules.md), for
[issue #118](https://github.com/C0derTang/shared-garden/issues/118). It builds
on the Harvest Handheld tokens and the reskin authorization in
[decision 0049](0049-harvest-handheld-reskin.md). It keeps the idle flower
motion and its suppression rules in
[decision 0036](0036-flower-idle-motion.md), the plots in
[decision 0040](0040-cozy-pixel-garden-beds.md), and the focus ring, care tag
and spot geometry in [decision 0042](0042-legible-garden-surface.md). No
product rule, data, route, sprite, plot or spot coordinate changes.

## Phases

The garden light follows the existing garden clock in Pacific time. The server's
`moonflower_open` flag alone decides night, so the light always agrees with the
clock's moon icon and the Moonflower window (10 p.m. to 4 a.m.) in decision
0004. The other phases come from the Pacific hour:

| Phase | Pacific time | Sky and light |
| --- | --- | --- |
| Dawn | 4:00–7:59 a.m. | Rose and peach sky, pale low sun, faint rose light |
| Day | 8:00 a.m.–4:59 p.m. | Clear blue sky, sun, the unchanged daytime grass |
| Golden | 5:00–7:59 p.m. | Amber sky, warm sun, warm light |
| Dusk | 8:00–9:59 p.m. | Violet sky over a sunset band, an early moon |
| Night | Moonflower hours | Navy sky, stars, moon, moonlit ground |

Around the night edges, before the next garden read confirms the flag change,
the light shows dusk after 10 p.m. or dawn before 4 a.m. The garden already
refreshes at those boundaries. The phase uses a fixed clock, not sunrise times,
so it stays predictable through the year.

## Layers

`GardenAmbience` is one decorative layer after the beds in `GardenClient`. It
sits under the spots, the header, the tools and the guide. It never covers the
plots, flowers, care tags or focus rings, and it has no dimming overlay over the
flowers. It holds:

- a banded pixel sky across the top of the meadow, in four hard-edged bands
  that fade into the grass;
- a pixel sun or moon that crosses the sky with the clock. The sun travels from
  4 a.m. to 10 p.m. and the moon through Moonflower hours. It stays in the band
  behind the Help and Songs signs, above the first plots;
- a colour tint on the ground. Dawn and golden hour use tints with the same
  luminance as the day grass, so contrast barely moves. Day has no tint;
- a viewport vignette at dusk and night only. At dawn, day and golden hour it
  would lower the ink focus ring's contrast on grass;
- ambient motes: six drifting petals at dawn, day and golden hour, four
  fireflies at dusk and ten at night, with stars at night.

A firefly is a 3px core in hard square glow rings, and a petal is a two-tone
pixel chip. There is no blur, backdrop filter or blurred shadow.

At dusk and night the garden itself adds three small changes. Each flower gets a
one-art-pixel moonlit rim: warm parchment `#eadbb4` at dusk and pale moon
`#d6def6` at night. Care tags gain a 1px `--paper-light` band outside their ink
border. Spot, Help, Songs and Guide focus rings gain a 2px `--paper-light` band
outside the ink outline. The flower art, tag, dots and the ring's ink and halo
are unchanged.

## Motion

Only `transform` and `opacity` animate, in stepped pixel timing. Petals fall
with a flip, fireflies wander and blink, stars twinkle, and a new phase fades
in over six steps. The layer adds no timer, and its markup changes only when
the garden clock's minute or phase changes.

All ambience motion stops under `prefers-reduced-motion: reduce` or when the
member's gentle-motion setting is off (decision 0033). Petals are then removed,
and fireflies and stars stay as static glows. The layer's own state and CSS stop
the motion. The member setting's global quiet-motion style also still applies.

## Rendering and accessibility

The server and hydration render a neutral layer with no phase. The phase appears
right after hydration, so the markup never mismatches and no warning is
suppressed. The layer is `aria-hidden`, has nothing focusable and ignores
pointer input. In forced-colors mode the layer is hidden and the flower rim is
removed, so the system palette applies.

## Measured contrast

WCAG ratios for the unchanged day values and the lit phases, with the ground
colours after tint (and after vignette where one is used). "Min" is the lowest
over the base grass, texture patches, specks and grass clumps.

| Pair | Day | Dawn | Golden | Dusk | Night |
| --- | --- | --- | --- | --- | --- |
| Spot and care-tag outer edge on base ground: ink (day phases) or the parchment band (dusk, night) | 5.00 | 5.03 | 5.00 | 5.46 | 8.05 |
| Same, min | 2.99 | 3.24 | 3.30 | 4.65 | 7.01 |
| Focus halo on soil (unchanged) | 4.47 | 4.47 | 4.47 | 4.47 | 4.47 |
| Flower silhouette on base ground: darkest sprite edge `#344a2d` (day phases) or the rim (dusk, night) | 3.33 | 3.35 | 3.33 | 4.36 | 6.58 |
| Lightest flower edge `#fff2ce` on base ground (day phases) | 2.62 | 2.60 | 2.61 | rim 4.36 | rim 6.58 |
| Rim against the darkest sprite edge | – | – | – | 7.07 | 7.23 |
| Help, Songs and Guide ring outer edge on the sky behind them | 10.64 | 9.33 | 7.67 | 7.94 | 15.54 |

The flower art, the care tag's fill, dots and border, the soil and the focus
ring's own colours are untouched, so contrast within them stays as in decision
0049. At night every pair is at or above its day value.

## Verification boundary

Verification uses the actual garden components with disposable synthetic data
and a stubbed garden clock for each phase, at 320, 390 and 1280 pixels. It
checks keyboard focus at night, reduced motion and the gentle-motion setting,
running animations, console hydration warnings and horizontal overflow. Lint,
typecheck, tests and a production build also run. It never reads or writes
production data.
