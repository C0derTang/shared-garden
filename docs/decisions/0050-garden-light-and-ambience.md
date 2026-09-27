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
[Issue #139](https://github.com/C0derTang/shared-garden/issues/139) replaced the
phase rule with the real Pacific sun (see Phases); the Moonflower window is
unchanged.

## Phases

The garden light follows the real sun in Pacific time
([issue #139](https://github.com/C0derTang/shared-garden/issues/139),
superseding the first version below). It uses the garden's live clock (the
server time plus the time elapsed since the last read) and a small,
dependency-free NOAA-style solar position function (`src/lib/garden/solar.ts`)
for a fixed Pacific reference point, Los Angeles (34.05°N, 118.24°W). Sunrise
and sunset are when the sun's upper limb meets the horizon (−0.833° with
refraction), so the light follows the seasons and daylight saving time:

| Phase | When | Sky and light |
| --- | --- | --- |
| Night | Sun more than 6° below the horizon (civil dusk to civil dawn) | Navy sky, stars, moon, moonlit ground |
| Dawn | Civil dawn to 1 hour after sunrise | Rose and peach sky, pale low sun, faint rose light |
| Day | 1 hour after sunrise to 1 hour before sunset | Clear blue sky, sun, the unchanged daytime grass |
| Golden | The last hour before sunset | Amber sky, warm sun, warm light |
| Dusk | Sunset to civil dusk | Violet sky over a sunset band, a low red sun |

In Los Angeles, for example, night begins about 5:15 p.m. PST at the winter
solstice and 8:37 p.m. PDT at the summer solstice, and dawn begins about 6:27
a.m. PST and 5:13 a.m. PDT. At 12:20 a.m. the garden is always a moonlit night.
The phase is worked out again every clock minute, so a page left open changes
light at the right moments. The solar function is checked against published Los
Angeles sunrise and sunset times at both solstices and either side of both DST
changes, within 3 minutes.

**Superseded (issue #139).** The first version let the server's
`moonflower_open` flag alone decide night and used fixed Pacific hours for the
rest (dawn 4:00–7:59 a.m., day 8:00 a.m.–4:59 p.m., golden 5:00–7:59 p.m., dusk
8:00–9:59 p.m.). When the flag was false or stale, the middle of the night
showed a dawn sky with a sun. The light no longer reads the flag. The
Moonflower's 10 p.m.–4 a.m. window in decision 0004 is unchanged and still comes
from `moonflower_open`, so the Moonflower's availability and the night sky are
now independent: on a summer evening the sky can be dark before the Moonflower
opens, and on a winter morning the sky can still be dark after it closes.

## Layers

`GardenAmbience` is one decorative layer after the beds in `GardenClient`. It
sits under the spots, the header, the tools and the guide. It never covers the
plots, flowers, care tags or focus rings, and it has no dimming overlay over the
flowers. It holds:

- a banded pixel sky across the top of the meadow, in four hard-edged bands
  that fade into the grass;
- a pixel sun or moon that crosses the sky with the clock (see Sun and moon);
- a colour tint on the ground. Dawn and golden hour use tints with the same
  luminance as the day grass, so contrast barely moves. Day has no tint;
- a viewport vignette at dusk and night only. At dawn, day and golden hour it
  would lower the ink focus ring's contrast on grass;
- ambient motes: six drifting petals at dawn, day and golden hour, four
  fireflies at dusk and ten at night, with stars at night.

A firefly is a 3px core in hard square glow rings, and a petal is a two-tone
pixel chip. There is no blur, backdrop filter or blurred shadow.

At dusk and night (the phases above, from the real sun, not the Moonflower
window) the garden itself adds three small changes. Each flower gets a
one-art-pixel moonlit rim: warm parchment `#eadbb4` at dusk and pale moon
`#d6def6` at night. Care tags gain a 1px `--paper-light` band outside their ink
border. Spot, Help, Songs and Guide focus rings gain a 2px `--paper-light` band
outside the ink outline. The flower art, tag, dots and the ring's ink and halo
are unchanged.

## Sun and moon

The disc and the clock's sun or moon icon come from the same phase (issue
#139): the sun from dawn through dusk (at dusk, a low red sun) and the moon at
night. The icon therefore always agrees with the sky, instead of following the
Moonflower flag as in decision 0049. The icon's first render uses the server
time on both the server and the client, so it hydrates without a mismatch.

The disc moves left to right along its track. The sun follows its real
azimuth, from where it rises (the left end) to where it sets (the right end),
so it is halfway across at solar noon. Through the dawn twilight before sunrise
it waits low at the left end, and through dusk after sunset at the right end.
The track is one horizontal band chosen for clearance (below), so the sun's
height is shown by the phase colours rather than by moving the disc up or down.
The moon crosses the track at an even pace from civil dusk to the next civil
dawn. It is a 16-unit pixel disc at 2px per art pixel, with a 20px core inside
a 32px halo.

The disc stays in open sky. Its core keeps at least 8px from the Help, Songs
and Guide controls and from the flowers, and it never goes under the header.
The layer measures the real positions of those controls and of the flowers
whenever the garden or a control resizes, including when the Guide collapses
or expands:

1. The first choice is the row of the signs, with the track running through
   the free spans between the controls. The disc skips over a control, such as
   the centred Guide button, rather than passing under it.
2. If that row leaves under 96px of travel, the track drops to a band just
   below the signs (8px under their lips) and above the flowers. This happens
   on a narrow phone, or with the Guide button between the signs. It skips any
   flower that reaches into the band.
3. If neither band reaches 96px, the disc uses the longer of the two clear
   tracks. If neither has any clear room, it is left out until room returns.
   On a 320px phone with the collapsed Guide button and the While you were
   away card, for example, the disc yields to the card.

Every card and notice in the garden (the While you were away card, the Today
card and the spot notice) counts as an obstacle while it is shown. The disc is
placed again as they appear, change or close. Visually hidden live regions are
ignored. The cards and the notice sit above the ambience layer, so it never
covers them. Their parchment faces keep their own text contrast: ink on
parchment stays 12.08. Against the night ground the parchment reads 7.33,
compared with 2.42 by day.


Only `transform` and `opacity` animate, in stepped pixel timing. Petals fall
with a flip, fireflies wander and blink, stars twinkle, and a new phase fades
in over six steps. The layer adds no timer, and its markup changes only when
the garden clock's minute changes the phase or the disc's position.

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
and a stubbed garden clock for each phase, at 320, 390 and 1280 pixels. A
24-hour sweep every 30 minutes at 320, 390, 768, 1280 and 1440 pixels, with and
without the collapsed Guide button, checks the disc's clearance from the
controls, the flowers and the header. It also checks keyboard focus at night, reduced motion and the gentle-motion setting,
running animations, console hydration warnings and horizontal overflow. Lint,
typecheck, tests and a production build also run. It never reads or writes
production data.
