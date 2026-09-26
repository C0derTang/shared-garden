# Legible garden surface

Status: conservative accessibility and presentation choices for
[issue #102](https://github.com/C0derTang/shared-garden/issues/102), under the
approved discretion in [decision 0004](0004-finalized-launch-rules.md). They
follow the immersive garden in [decision 0029](0029-immersive-garden.md), the
flower idle motion in [decision 0036](0036-flower-idle-motion.md), the quiet
surface in [decision 0038](0038-quiet-garden-surface.md), the high-contrast
pixel outline in [decision 0040](0040-cozy-pixel-garden-beds.md), and the
tokens in [decision 0041](0041-pixel-design-tokens.md). This record completes
the garden-surface styles that decision 0041 left to issue #102.

## Care dots

The two care dots sit on a small square paper tag: a `--paper-light` fill, a
1px `--ink` border and a hard 2px offset shadow. Each dot is 8px with an `--ink`
border. An empty dot shows the paper fill. A filled dot is `--forest` for you
on the left and `--rust` for your partner on the right. This changes appearance
only. The dots keep their meaning, their `aria-hidden` markup, their place under
the plot, and the Help legend. Peony and permanent blooms still show no dots,
except the permanent Cactus. The tag keeps the old 12px block height, so
flower sprites and targets do not move. The dots sit about 3px higher within
that block.

## Flower and empty-spot focus

Flower and empty-spot buttons use `--radius-pixel` corners and the shared
two-tone ring. The ring is drawn inside the target so target size and bed
geometry stay fixed. It is a 3px `--focus-ring-color` outline inset by its own
width, with a 2px `--focus-ring-halo` band inside it. Spot buttons no longer
opt out of the shared ring, and the pale yellow ring and translucent focus
background are removed. In forced-colors mode the system keeps the outline and
drops the halo shadow, so focus stays visible. Hover still lifts the soil
color. The hidden label boxes keep their existing text sizes because they are
invisible placeholders that hold sprite positions (decision 0038).

## Toolbar chips

Help, Songs and the collapsed Guide control share one pixel chip. It has a
`--paper-light` fill, a `--border-pixel` `--frame-border` border,
`--radius-pixel` corners, the `--shadow-pixel` hard shadow, a 44px minimum
height, and `--font-pixel` text at `--text-sm` in `--forest-dark`. Hover uses
`--sage-light`, and a press uses the pressed pixel shadow. The toolbar sits 3px
lower, at 54px, so chips clear the header edge. The Songs link has no separate
`aria-label`, so its accessible name is its visible label, Songs. Its target
and the route panel's focus return are unchanged.

## Help dismissal

Help stays a non-modal disclosure outside the sheet queue. It keeps all
decision 0038 contents: guidance, counts, bed growth, the dated garden day, the
4 a.m. Pacific rollover, Moonflower hours, the dot legend, sync state, Refresh
and its errors. Escape closes it and returns focus to its summary when focus is
inside Help or on the page body. Escape does nothing to Help while another
control holds focus, so a focused sheet or dialog keeps its own Escape
behavior. A pointer down outside Help closes it without moving focus. Help does
not trap focus. Its panel uses the shared frame border, corners and hard frame
shadow.

## Unavailable and loading garden

When no garden state is available, the fallback renders on the textured grass
stage. A centred paper card has the shared frame border, corners and hard
shadow, a 28rem maximum width and 16px gutters that respect safe-area insets.
While loading, the message has `role="status"` and no retry control. Only an
error uses `role="alert"` and shows Try again. This fallback shows no private
content.

No `(member)/loading.tsx` is added. The member layout itself awaits
authorization and the garden read, and a segment `loading.tsx` renders inside
that layout. It would appear only in the route-panel body, not as the garden
stage, so it would not meet this intent.

## Desktop grass

The fixed-scale 48px grass texture and its base color move from each bed to
the whole `.garden` stage. The grass then reaches the full width beside the
1200px bed cap, with no flat bands. Bed boundaries, coordinates and scenery
are unchanged.

## Measured contrast

WCAG relative-luminance ratios:

| Pair | Ratio |
| --- | --- |
| Care tag `--ink` border on base grass `#82a15d` | 3.81:1 |
| Care tag border on the darkest texture `#739250` | 3.15:1 |
| Filled `--forest` dot on the paper tag | 5.97:1 |
| Filled `--rust` dot on the paper tag | 5.32:1 |
| Empty dot `--ink` border on the paper tag | 10.67:1 |
| Spot ring `--ink` outline on base grass | 3.81:1 |
| Spot ring outline on the darkest texture | 3.15:1 |
| Spot ring halo on soil `#8f6948` | 4.71:1 |
| Spot ring halo on the darkest grass clump `#587b3e` | 4.67:1 |
| Spot ring outline against its halo | 10.67:1 |
| Chip text `--forest-dark` on `--paper-light` | 9.33:1 |
| Chip border `--frame-border` on base grass | 3.33:1 |

For comparison, the previous care-dot border `#66734a` was 1.75:1 on base
grass, and the previous spot ring `#f7e3a3` was 2.29:1 on base grass.

## Verification boundary

Verification uses the actual `GardenClient` with disposable synthetic full,
mixed, partly empty, empty, three-bed, loading and error states at 320, 390 and
1280 pixels, plus a tall 390 by 1400 view. It covers target and sprite
geometry, focus rings, chips, Help dismissal, the guide chip and overflow. It
also runs lint, typecheck, tests and a production build. It never reads or
mutates production data. No gameplay, data, route, backend, dependency, artwork
or spot coordinate changes.
