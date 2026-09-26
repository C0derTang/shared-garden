# Pixel design tokens

Status: conservative presentation choices for
[issue #101](https://github.com/C0derTang/shared-garden/issues/101), under the
approved discretion in [decision 0004](0004-finalized-launch-rules.md). They
follow the intent of the immersive garden and panel contract in
[decision 0029](0029-immersive-garden.md), the branding in
[decision 0035](0035-ccs-garden-branding.md), the compact pixel flower panels in
[decision 0037](0037-compact-pixel-flower-panels.md), and the high-contrast
pixel outline in [decision 0040](0040-cozy-pixel-garden-beds.md). This is the
shared foundation for the UI polish issues #102 to #108.

## Tokens

`src/app/tokens.css` defines these names. Later UI work uses them instead of
restating literals.

| Token | Value | Use |
| --- | --- | --- |
| `--radius-pixel` | `2px` | Corners of all UI chrome |
| `--border-pixel` | `2px` | Frame, pixel-button and shared button border width |
| `--frame-border` | `--forest-dark` | Dialog frames and pixel buttons |
| `--control-border` | `#7a7862` | Inputs, selects and secondary buttons |
| `--shadow-pixel` / `--shadow-pixel-pressed` | `3px 3px 0` / `1px 1px 0` in `--line-strong` | Raised pixel controls and their pressed state |
| `--shadow-frame` | `4px 4px 0 rgb(0 0 0 / 28%)` | Route panel, guide and desktop sheet |
| `--shadow-frame-edge` | `0 -4px 0 rgb(0 0 0 / 28%)` | Top edge of a bottom-anchored phone sheet |
| `--focus-ring-color`, `--focus-ring-halo`, `--focus-ring-width`, `--focus-ring-offset`, `--focus-ring` | `--ink` outline, 3px, 2px offset, `--paper-light` halo | The single focus ring |
| `--danger` / `--danger-wash` | `#862e23` / `#f7e4d8` | Error text and error backgrounds |
| `--font-pixel` | System monospace stack | Pixel titles and pixel buttons |
| `--text-xs`, `--text-sm`, `--text-md`, `--text-title`, `--text-lg` | `0.75`, `0.875`, `1`, `1.1`, `1.35rem` | Type scale |

Shadows are hard offsets only. UI chrome does not use a blurred `box-shadow` or
a `backdrop-filter`. `--font-pixel` is a local system stack, so no remote font is
loaded ([decision 0005](0005-web-foundation.md)). Visible text is at
least `--text-xs` (0.75rem) in every rule this decision migrates.

## Focus ring

Every focusable element uses one two-tone ring: a 3px `--ink` outline, offset by
2px, with a 2px `--paper-light` halo filling the gap. The halo is drawn as a
`box-shadow`, so it temporarily replaces a control's own pixel shadow while that
control has keyboard focus. The previous rust, ochre and restated component
rings are removed. A selected seed shows its state with a border and inset
shadow rather than an outline, so the focus ring stays visible on it.

Measured contrast (WCAG relative luminance):

| Pair | Ratio |
| --- | --- |
| Ink outline on paper `#faf5e9` | 10.21:1 |
| Ink outline on meadow `#789756` | 3.36:1 |
| Halo on meadow `#789756` | 3.17:1 |
| Halo on soil `#8f6948` | 4.71:1 |
| Halo on the forest primary button `#4e6841` | 5.97:1 |
| Ink outline against its halo | 10.67:1 |
| `--control-border` on paper | 4.12:1 |
| `--control-border` on paper-light `#fffaf0` | 4.30:1 |
| `--control-border` on paper-deep `#eee6d5` | 3.61:1 |
| `--danger` on `--danger-wash` | 7.02:1 |

For comparison, the previous rust ring was 1.68:1 on meadow and the previous
`--line-strong` control border was 1.96:1 on paper.

The garden-surface spot ring, care dots and Help/Songs chips still keep their own
styles. [Issue #102](https://github.com/C0derTang/shared-garden/issues/102) owns
those styles.

## Frames and panel header

The route panel, guide dialog and flower sheet share one frame: a 2px
`--frame-border` border, `--radius-pixel` corners, a hard frame shadow, and a
`--font-pixel` title at `--text-title`. A phone sheet is bottom-anchored, so its
frame omits the bottom border and shows its hard shadow on the top edge.

The route-panel Close control is a `pixel-button`. It uses the same border,
corner, paper fill and pixel shadow as the sheet's × control, and it has a
44-pixel minimum target. It keeps the visible word Close and the accessible name
Close panel, as decision 0029 requires. The panel keeps its fixed header,
independent body scroll, 88dvh bound, 900px desktop cap, safe-area handling,
z-index order, and outside-click behavior.

The bottom navigation uses an opaque paper background instead of a translucent
blur, and its labels use `--text-xs`. Memory cards, the song player, the Spotify
picker container and input, settings, the photo frame, achievement cards and
private-moment controls use `--radius-pixel`. The songs heading uses
`--font-display` instead of a literal `Georgia, serif` stack.

## Exceptions

- Spotify album art keeps 4px corners on small and medium viewports and 8px
  corners at 1,024px and wider
  ([decision 0034](0034-tulip-spotify-catalog-search.md)).
- The Spotify embed frame keeps 12px corners to match Spotify's own rounded
  player.
- The circular memory flower frame and the round mood swatches stay circular.
- Scenery, soil and flower art colors, the Hydrangea mood palette, the
  per-species memory hues, the landing hero serif and the wordmark are
  unchanged.

## Verification boundary

Verification uses the actual components with disposable synthetic data at 320,
390 and 1280 pixels. It includes the garden, a flower sheet, each route panel
and the guide, plus lint, typecheck, tests and a production build. It never
reads or mutates production data. No behavior, copy, backend, dependency,
layout geometry or private content changes.
