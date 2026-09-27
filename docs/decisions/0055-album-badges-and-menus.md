# Album, badges and menus

Status: conservative presentation and navigation choices for
[issue #123](https://github.com/C0derTang/shared-garden/issues/123), under the
approved discretion in [decision 0004](0004-finalized-launch-rules.md) and the
user's reskin authorization recorded in
[decision 0049](0049-harvest-handheld-reskin.md). They restyle the Memories,
Achievements, Settings and Songs route panels from
[decision 0029](0029-immersive-garden.md) with the Harvest Handheld tokens. They
keep memory behavior from [decision 0018](0018-memories.md),
[decision 0031](0031-compact-visual-memories.md) and
[decision 0047](0047-denser-memories.md), badge behavior from
[decision 0032](0032-achievement-badges.md) and
[decision 0046](0046-compact-achievement-badges.md), and the settings rows from
[decision 0033](0033-compact-settings.md). The guide is a separate issue.

## Memories album

Each memory is an album card in a `--frame-slot` frame on `--paper-light`, with
a hard 4px shadow under it. Its header keeps the flower's pale wash and has
three parts:

- **Sprite stamp:** the full-bloom sprite sits on a parchment postage stamp.
  Square 4px notches are masked out of the stamp's edge, and a thin line in the
  flower's accent colour frames the sprite. Below 360px the stamp is 54px with
  3px notches.
- **Date plaque:** a small `--wood-deep` plaque with `--paper-light` Pixelify
  text shows the memory's garden day as a short date, such as Sep 18, 2026.
  Assistive technology hears "Garden day" before it.
- **Heading:** the kind eyebrow and the h4 title, both in Pixelify.

The body holds only the memory's content. A footer signs it with the author
and posting time, then offers **Open in garden**. The garden day now lives on
the plaque, so the footer time drops the year and the separate "Garden day"
line is gone. Peony milestones still show each contribution's own garden day.
In the two-column layout, footers line up at the bottom of each row.

Filters, Refresh, the active-filter Clear and Open in garden are tactile
parchment buttons with the `--frame-border` outline, bevel and lip. The active
filter count is a small gold tag. Filter fields keep the body font with a 2px
`--control-border` edge.

### Open in garden

Each card links to `/garden?spot=N` for its flower. Its accessible name starts
with the visible words, for example "Open in garden: Rose, spot 2".

- **From the panel:** an ordinary click records the request in a small shared
  store and navigates to `/garden`. The route panel closes, and the persistent
  garden then opens that flower's sheet. The sheet takes focus, as any flower
  sheet does. Closing it returns focus to the flower on the garden.
- **From a direct URL:** when the garden first mounts, it reads `spot` or
  `flower=cactus` from the address, opens the sheet once the garden state is
  ready, and replaces the address with plain `/garden`. Reloading or closing the
  sheet does not reopen it.
- **Modified clicks** (Ctrl, Command, Shift or Alt) keep the browser's own
  behavior and record nothing in the current tab.
- **Unknown or removed spots** never open the seed picker. The garden shows a
  parchment note docked just above the hotbar instead, with an OK button:
  "Spot N has no flower right now." for an empty spot, or "That flower isn't
  in your garden." for a malformed spot or one beyond capacity. Docking it at
  the bottom keeps the first bed row, the header and the top private-notice
  area clear. The note's status region is always rendered, empty and without
  a box, so screen readers already track it when the text arrives. It does not
  move focus.
- A pending private moment or open draft keeps its existing priority. The
  flower sheet waits in the same sheet queue.

No query, route, server action, schema or product rule changes.

### Empty album

Without filters, an empty album is a blank keepsake page: "Your first memory
appears once one of you shares care. Start with the Cactus — it's one tap."
Its primary **Visit the Cactus** button links to `/garden?flower=cactus`. The
garden resolves that to the permanent Cactus (spot 1 under
[decision 0007](0007-garden-catalog-and-planting.md)) and opens it the same way.
A filtered empty result still says "No memories match those filters."

## Achievement badges

Every badge is a `--frame-slot` slot. A growing badge has a parchment face, a
dashed `--paper-deep` emblem with a `--muted` icon and a hollow ◇ tag. An earned
badge has a warm gold face (30% `--gold` in `--paper-light`) and two hard gold
rings outside the slot, standing in for a glow. Its emblem is solid `--gold`
with a `--forest-dark` icon, a bevel and a green ✓ tag, and two decorative
sparkle pixels. The sparkles twinkle in two steps only when motion is allowed:
the operating-system reduced-motion setting and the member's own gentle-motion
setting both stop them. No shadow is blurred.

The count sits on a wooden plaque, and the streak has a small berry heart. The
overall and per-badge progress bars are segmented pixel meters with a
`--wood-dark` edge. Refresh is a pixel button with a 44px target, and the live
state is a small square dot, filled green when live.

Badge toggling, the single open badge spanning the row, its scroll into view,
the server-owned titles and requirements, and the refresh behavior are
unchanged.

Empty states:

- With no badges earned yet, a note says "No badges yet. Each one glows gold
  the moment you earn it together. Tap any badge to see how it grows."
- If progress could not load at all, the existing alert and Refresh stay, and
  a parchment note says the badges will appear once progress loads. No
  progress is invented.

## Settings menu

Settings is three parchment groups in `--frame-slot` frames: **Garden** (the
guide and the garden-day detail), **Comfort** (gentle motion) and **Account**
(sign out). Each group has a small uppercase Pixelify header on `--paper-deep`.
Groups are h3 and row titles are h4, under the panel's h2. Rows keep the
side-by-side layout that stacks below 420px.

Gentle motion stays a native checkbox named "Allow gentle motion", drawn as a
pixel switch: a 48×26 `--frame-border` track, `--paper-deep` when off and
`--forest` when on, with a square parchment knob that moves across. In forced
colors it uses `Highlight` for on. Save, failure, retry, guide-reopen and
sign-out behavior are unchanged. The owner-only private controls keep their
own place below the groups.

## Songs jukebox

The song collection is a jukebox. A wooden marquee with a row of gold and berry
pixel bulbs carries a "Tulip jukebox" plaque and the short introduction. The
note that listening is optional moves below the list, beside the note about
posting times, so the first record is in view without scrolling. At 480px and
narrower the marquee is slimmer and the two check buttons share the width. The
duplicate "Our song collection" h1 is removed, because the route panel title
already names the page and each song title is an h3. Each song is a record
slot: a pixel vinyl disc and a gold track number sit beside the author, date
and the shared song player. The player's own frame is dropped inside the slot,
and its title uses Pixelify. The shared song player component itself is not
changed, so the flower sheet and memories keep their current player.

An empty jukebox says "No songs yet. The jukebox is waiting for its first
record: share a song from a Tulip in your garden to begin." The Back to our
garden link now has a 44px target.

## Pixel font ligatures

Pixelify Sans substitutes "fi" and "ff" ligatures that read as other letters,
so "first" can look like "Arst". Every `font` shorthand resets the ligature
setting, so these four panels force `font-variant-ligatures: none` on all of
their contents. A global fix belongs with the shared tokens.

## Measured contrast

WCAG ratios for pairs this change introduces. The rest come from
[decision 0049](0049-harvest-handheld-reskin.md).

| Pair | Ratio |
| --- | --- |
| `--ink` / `--forest-dark` / `--muted` on the earned face `#fae5b1` | 11.72 / 7.04 / 6.06 |
| `--forest-dark` icon on the `--gold` emblem | 5.21 |
| `--paper-light` ✓ on `--forest` | 4.73 |
| `--paper-light` plaque text on `--wood-deep` | 6.77 |
| `--ink` track number on `--gold` | 8.68 |
| `--forest-dark` eyebrow on the palest and darkest memory washes | 7.12 / 7.35 |
| `--muted` card text on the memory washes | 6.12 or more |
| `--ink` group header on `--paper-deep` | 10.21 |
| Switch track edge `--wood-dark` on `--paper-deep` | 9.03 |
| Switch on-state `--forest` against off-state `--paper-deep` | 3.64 |
| Switch knob `--paper-light` on `--forest` | 4.73 |
| Streak heart `--rust` on `--paper` | 4.73 |

The gold rings and the stamp and plaque decoration are not the only state
cue. Earned badges also say Earned in text and in their accessible names.

## Measurements

Measured with the actual components and disposable synthetic data inside the
route panel frame:

| View | 320 x 640 | 390 x 844 | 1280 x 800 |
| --- | --- | --- | --- |
| First memory card height, before → after | 192 → 272px | 205 → 235px | 181 → 211px |
| First badge height, before → after | 112 → 135px | 112 → 135px | 112 → 135px |
| First song top, before → after | 674 → 463px | 585 → 455px | 479 → 430px |

Memory cards grow by the Open in garden row. At 320px, the signature and the
button wrap onto two lines. No view scrolls sideways, and every new control
has a target at least 44px square.

## Verification boundary

Verification uses the actual Memories, Achievements, Settings and Songs
components inside the route panel frame, and the actual garden, with
disposable synthetic data at 320, 390 and 1280 pixels. It includes a direct
`/garden?spot=N` load, an unknown spot and the Cactus link. Component tests
cover in-app and direct-URL opening with focus in the sheet, the unknown and
empty spot notes, modified clicks and the empty album's Cactus route. Lint,
typecheck, tests and a production build also run. It never reads or mutates
production data.
