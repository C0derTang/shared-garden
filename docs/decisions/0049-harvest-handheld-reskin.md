# Harvest Handheld reskin

Status: user-authorized reskin direction and foundation for
[issue #117](https://github.com/C0derTang/shared-garden/issues/117). Exact
values are conservative choices under the approved discretion in
[decision 0004](0004-finalized-launch-rules.md). It keeps the immersive garden
and panel contract in [decision 0029](0029-immersive-garden.md), the garden
surface and plots in [decision 0038](0038-quiet-garden-surface.md) and
[decision 0040](0040-cozy-pixel-garden-beds.md), and recognizable flower
sprites under [decision 0022](0022-flower-sprites.md). It replaces the visual
values in [decision 0041](0041-pixel-design-tokens.md) and
[decision 0042](0042-legible-garden-surface.md) but keeps their accessibility
guarantees. This is the foundation for the follow-up reskin and UX issues.

## Authorization and direction

On 2026-09-26 the user authorized a full reskin: "you're allowed to reskin it
if you think it looks bad. your goal is to make the best ux possible for the
two users. in terms of spacing and visuals, just keep the garden theme. go
wild." Three competing concepts were built on the real components. The
orchestrator chose **Harvest Handheld**, a cozy handheld farming-game look. It
suits the existing pixel flower sprites best. Other directions pulled the
chrome away from the art.

The design language has wooden pixel frames, parchment panels, a wooden sign
for the name and clock, and a hotbar at the bottom. Buttons press down like
game buttons. Corners are square, and every shadow is a hard edge with no blur.

## Tokens

`src/app/tokens.css` defines these names. Follow-up work uses them instead of
restating literals. Token names from decision 0041 are kept where the role is
the same, so existing components pick up the new values.

### Palette

| Token | Value | Role |
| --- | --- | --- |
| `--paper` | `#f7e9c6` | Parchment panel and sheet surface |
| `--paper-light` | `#fdf4dc` | Raised parchment: buttons, slots, cards, fields |
| `--paper-deep` | `#ecd6a4` | Pressed or hover parchment, hotbar well |
| `--ink` | `#3a2414` | Walnut ink: body text and the focus outline |
| `--muted` | `#6b4f33` | Secondary text |
| `--forest` | `#3f7a34` | You-green: primary button fill and your care dot |
| `--forest-dark` | `#2c5424` | Primary hover and green text on parchment |
| `--sage-light` | `#e2ecc4` | Pale green wash for notices |
| `--rust` | `#b0432a` | Partner-berry: partner care dot and selected-slot rim |
| `--ochre` | `#c98a1c` | Decorative accent only, never text |
| `--line` / `--line-strong` | `#dcc394` / `#b08d58` | Decorative dividers only, never a control's only edge |
| `--wood-dark` | `#4a2a12` | Darkest wood: outlines, lips and text shadows |
| `--wood-deep` | `#7a4a20` | Title plaques and icons on parchment |
| `--wood` | `#9a5f2a` | Header sign plank and frame fallback colour |
| `--wood-light` | `#c98a45` | Plank highlight and plaque bevel |
| `--wood-hi` | `#e5b36a` | Brightest wood highlight, reserved for follow-ups |
| `--gold` | `#f2c14e` | Selection gold (current hotbar slot) |
| `--stamp` | `#c9533a` | Red × close stamp |
| `--danger` / `--danger-wash` | `#862e23` / `#f7e4d8` | Error text and backgrounds (unchanged) |

### Frames

Frames are CSS `border-image` 9-slices from inline SVG. They are drawn at 2px
per art pixel with `crispEdges`, so edges stay sharp.

| Token | Art | Use |
| --- | --- | --- |
| `--frame-wood` | 18×18, 6-unit slice | `border: 12px solid var(--wood); border-image: var(--frame-wood) 6 fill / 12px stretch; background-clip: padding-box` for sheets, route panels, the Help card and the hotbar |
| `--frame-slot` | 9×9, 3-unit slice | `border: 6–8px solid var(--paper-light); border-image: var(--frame-slot) 3 fill / 6px stretch` for inventory slots and the clock plate |

Each framed element also sets a solid `border-color`. That is the fallback
wherever `border-image` is unavailable. In forced-colors mode the frames set
`border-image-source: none`, so the system draws a plain border. Write the
longhand `border-image-source: none`. The build's CSS minifier empties the
shorthand `border-image: none` into an invalid declaration.

### Shape, depth and focus

| Token | Value | Use |
| --- | --- | --- |
| `--radius-pixel` | `0` | Square corners on all UI chrome |
| `--border-pixel` | `2px` | Button, chip, field and plaque border width |
| `--frame-border` | `--wood-dark` | Outline of buttons, chips, pixel buttons and the stamp |
| `--control-border` | `#8a6a44` | Text inputs and selects |
| `--bevel` | 2px light inset top-left, 2px dark inset bottom-right | Raised face of a tactile control |
| `--bevel-pressed` | 2px dark inset top-left | Pressed face |
| `--press-depth` | `3px` | Lip height and press travel |
| `--shadow-pixel` / `--shadow-pixel-pressed` | `0 3px 0 --wood-dark` / `0 0 0` | The lip under a raised control, and the pressed state |
| `--shadow-frame` | `0 6px 0 rgb(30 16 6 / 38%)` | Route panel, Help card and desktop sheet |
| `--shadow-frame-edge` | `0 -4px 0 rgb(30 16 6 / 30%)` | Top edge of a bottom-anchored phone sheet |
| Focus ring tokens | unchanged names, 3px `--ink` outline, 2px offset, `--paper-light` halo | The single focus ring (decision 0041) |

A tactile control uses `box-shadow: var(--bevel), var(--shadow-pixel)`. On
`:active` it moves `translate: 0 var(--press-depth)` and uses
`var(--bevel-pressed), var(--shadow-pixel-pressed)`, so it lands on its lip.
Keyboard focus replaces the bevel and lip with the focus halo, as before.

### Type

`--font-pixel` is Pixelify Sans, then the previous monospace stack. The font
is licensed under the SIL Open Font License 1.1. The latin subset in weights
400, 600 and 700 is self-hosted in `public/fonts/pixelify-sans/`, with
`OFL.txt` beside it. The files are from Fontsource 5.3.0 and total about 24
KB. `tokens.css` loads them with local `@font-face` rules that set
`font-display: swap` and the latin `unicode-range`. No request goes to another
origin, so this follows [decision 0005](0005-web-foundation.md). The font files
are assets, not a package dependency.

Pixelify Sans is used for titles, the header, buttons, chips, nav labels and
badge names. Body text, descriptions, entries and fields stay in the system
sans (`--font-body`). The type scale is unchanged except `--text-title`, which
grows from 1.1rem to 1.25rem. 0.75rem remains the floor for visible text.

## Shared chrome

- **Header:** a wooden sign plank (`--wood` with darker grain lines and a
  `--wood-light` top highlight) with a 4px `--wood-dark` bottom edge. The
  wordmark is `--paper-light` Pixelify text with a hard `--wood-dark` shadow.
  The clock is a parchment plate in a `--frame-slot` frame. It shows the
  weekday and date of the garden day, a sun or moon icon, Pacific time and the
  new-day countdown. The moon shows while the Moonflower is open (10 p.m.–4
  a.m. Pacific, from `moonflower_open`), and the sun shows otherwise. This is
  a static icon choice. Time-of-day lighting is a follow-up. The toolbar
  moves to 66px and the stage padding to 60px at the top and 104px at the
  bottom to clear the taller header and hotbar.
- **Help and Songs:** parchment sign buttons with a `--wood-dark` border,
  bevel and lip, `--ink` Pixelify text at `--text-md`, and a decorative pixel
  "?" or note glyph. The collapsed Guide button shares the style without a
  glyph. Targets stay at least 44px. The Help card uses the wood frame.
- **Hotbar navigation:** a floating wood-framed bar, `min(30rem, 100vw −
  16px)` wide and 8px above the safe-area bottom. It holds parchment
  `--frame-slot` slots with a 22px `--wood-deep` icon and a `--text-xs` label.
  The current slot is `--gold` with a 2px `--wood-dark` border, a 2px inset
  `--rust` rim and a `--forest-dark` icon. Below 360px the bar becomes a
  full-width shelf with only its top wood edge, so "Achievements" fits at
  320px. In forced colors the current slot also gets a `Highlight` outline.
- **Sheets and route panels:** the wood frame on a parchment body, with a
  darker overlay tint. The title sits on a `--wood-deep` plaque with
  `--paper-light` text. The flower and seed sheet close is a 30px red ×
  stamp inside the unchanged 44px target, and its accessible name is still
  Close. The route-panel close keeps the visible word Close and the
  accessible name Close panel (decision 0029). The red × stamp sits in front
  of the word on a parchment pixel button. Header and notice dividers are 2px
  dashed `--line-strong`. The phone sheet omits its bottom frame edge.
- **Buttons and fields:** primary is `--forest` with `--paper-light` text and
  a `--forest-dark` hover. Secondary is `--paper-light` with `--ink` text and
  a `--paper-deep` hover. Both use the `--frame-border` outline, the bevel,
  the lip and Pixelify at `--text-md`. The Help Refresh button matches the
  secondary style. Text fields use a 2px `--control-border` edge on
  `--paper-light` with a faint inset shade, and keep the body font.
- **Care tag and spot focus:** the care-dot tag keeps its paper fill, 1px
  `--ink` border, 8px dots and 12px block. Its shadow becomes a hard 2px
  `--wood-dark` lip. Spot buttons keep the inset two-tone ring from decision
  0042 with square corners.
- **Other token effects:** green text on parchment (the landing wordmark and
  eyebrow, the song and memory eyebrows, and the memory completion line) uses
  `--forest-dark`, because `--forest` is 4.31:1 on `--paper`. The flower-sheet
  compact buttons press straight down by `--press-depth`. The browser theme
  colour is `--wood` (`#9a5f2a`), to match the header sign.

## What this supersedes

- [Decision 0041](0041-pixel-design-tokens.md): every token value in its table, the 2px corner radius, the
  diagonal 3px/1px offset shadow and 2px diagonal press, the forest-dark frame
  outline, the system-monospace pixel font and the plain 2px frame. Its focus
  ring, the rule against blurred shadows and backdrop filters, the 0.75rem
  text floor, the route-panel contract and its listed exceptions all stay.
- [Decision 0042](0042-legible-garden-surface.md): the chip colours, `--text-sm` chip text, sage hover and
  diagonal press. The 54px toolbar offset becomes 66px, and the care tag's
  diagonal black shadow becomes the wood lip. Care-dot meaning and geometry,
  the inset spot ring, Help dismissal, the fallback card and the desktop grass
  stay.
- [Decision 0048](0048-finished-entry-and-moment-controls.md): the shared secondary button now has the `--frame-border`
  outline and the tactile lip instead of the `--control-border` edge and no
  shadow. It remains a secondary button, and the landing still has a single
  primary action.

## Measured contrast

WCAG relative-luminance ratios. Text needs 4.5:1, or 3:1 for large text.
Controls, the focus ring and state indicators need 3:1.

| Pair | Ratio |
| --- | --- |
| `--ink` on `--paper` / `--paper-light` / `--paper-deep` | 12.08 / 13.28 / 10.21 |
| `--ink` on `--gold` (current slot label) | 8.68 |
| `--muted` on `--paper` / `--paper-light` / `--paper-deep` | 6.24 / 6.86 / 5.27 |
| `--paper-light` on `--forest` (primary text) | 4.73 |
| `--paper-light` on `--forest-dark` (primary hover) | 7.98 |
| `--forest-dark` on `--paper-light` / `--sage-light` | 7.98 / 7.09 |
| `--paper-light` on `--wood-deep` (plaque title) | 6.77 |
| `--paper-light` on `--wood` (header wordmark, 19px+ bold) | 4.74 |
| `--paper-light` × on `--stamp` (20–22px bold glyph) | 4.00 |
| `--stamp` on `--paper` (stamp against the sheet) | 3.64 |
| `--danger` on `--danger-wash` | 7.02 |
| `--frame-border` on `--paper` (button, chip, field outline) | 10.68 |
| `--frame-border` on base grass `#82a15d` / darkest texture `#739250` (chips) | 4.42 / 3.65 |
| `--control-border` on `--paper` / `--paper-light` / `--paper-deep` | 4.12 / 4.53 / 3.48 |
| Slot edge `#6e3f19` on hotbar parchment `#f7e9c6` | 7.30 |
| Current slot `--wood-dark` border on hotbar parchment | 10.68 |
| Current slot `--rust` rim on `--gold` | 3.40 |
| Nav icon `--wood-deep` on `--paper-light` | 6.77 |
| Current nav icon `--forest-dark` on `--gold` | 5.21 |
| Focus outline `--ink` on `--paper` / base grass / darkest texture | 12.08 / 5.00 / 4.13 |
| Focus halo on soil `#8f6948` / darkest clump `#587b3e` | 4.47 / 4.44 |
| Focus halo on `--forest` / `--wood` | 4.73 / 4.74 |
| Focus outline against its halo | 13.28 |
| Care tag `--ink` border on base grass / darkest texture | 5.00 / 4.13 |
| Filled `--forest` / `--rust` dot on the tag | 4.73 / 5.20 |
| Empty dot `--ink` border on the tag | 13.28 |

## Follow-up issues

Each of these depends on this foundation and builds on its tokens:

- Time-of-day lighting and ambience tied to the garden clock.
- The Today card and flower-state cues.
- The seed-bag inventory grid and the plant-to-care flow.
- The flower-sheet layout.
- The since-last-visit celebration.
- Memories, Achievements, Settings, Songs and guide contents.
- Landing, auth and not-found pages.
- Media forms, Peony and private moments.

## Verification boundary

Verification uses the actual components with disposable synthetic data at 320,
390 and 1280 pixels. It covers the garden, Help, a flower sheet, the existing
seed sheet, the Memories, Achievements and Settings panels, the hotbar,
keyboard focus and the Moonflower night clock, in Chromium and in Playwright
WebKit. It also checks forced colors with reduced motion, and that no request
goes to another origin. Lint, typecheck, tests and a production build also
run. It never reads or mutates production data. No product rule, behavior,
route, backend, schema, dependency, sprite or spot coordinate changes.
