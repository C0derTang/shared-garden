# Today card and flower cues

Status: conservative presentation choices for
[issue #119](https://github.com/C0derTang/shared-garden/issues/119). They are
made under the user's reskin and UX authorization of 2026-09-26, recorded in
[issue #117](https://github.com/C0derTang/shared-garden/issues/117) and
[decision 0049](0049-harvest-handheld-reskin.md), and under the approved
discretion in [decision 0004](0004-finalized-launch-rules.md). The UI uses the
Harvest Handheld tokens from decision 0049. This decision updates the quiet
surface in [decision 0038](0038-quiet-garden-surface.md). No product rule
changes. Growth, the 4 a.m. rollover, Moonflower hours, limits and privacy stay
as decisions 0004 and 0007–0020 set them. Idle motion stays as
[decision 0036](0036-flower-idle-motion.md) sets it.

## Due rule

One pure module, `src/components/garden/due-today.ts`, decides what is due.
The Today card and the flower sheet's Next step in
[decision 0053](0053-two-person-flower-sheet.md) both use it.
It uses only existing `GardenState` fields. A flower takes daily care when its
care dots show. That excludes Peony, every bloomed flower except the Cactus,
and fulfilled Dandelion wishes, which are always bloomed.

- A flower is **due for you** when you have not cared for it this garden day.
  The same test with the other member's marker decides **due for your
  partner**.
- A Moonflower outside 10 p.m.–4 a.m. Pacific (`moonflower_open` false) is due
  for neither of you. It is listed as "Opens 10 p.m." instead.
- **Tend next** picks a flower due for you in this order:
  1. Flowers your partner already cared for, because your care completes the
     pair.
  2. Flowers that would lose a growth unit, with the most growth first.
  3. The rest.

  Spot order breaks ties.
- **Plant a seed** targets the first empty spot, and only when a seed can be
  planted there under `seedAvailability`.

Each flower also gets at most one cue:

| Cue | Condition |
| --- | --- |
| Partner cared | Your partner cared and you have not. |
| Blooms tonight | You both cared, the flower is unbloomed, and this unit reaches its growth target. |
| At risk | Neither of you cared, the flower is unbloomed, it has more than zero units, and it is not the Cactus, which never loses growth. |

## Today card

`today-card.tsx` is a parchment plaque mounted from `GardenClient`. It floats
10px above the hotbar and is as wide as the hotbar (`min(30rem, 100vw −
16px)`). It has a 2px `--frame-border` edge, a parchment bevel, a hard shadow
and two brass nail pixels. A carved `--wood-deep` "Today" tab overlaps its top
edge. The tab is the section's heading.

- **Counts:** a toggle button shows "You N to tend" and "Partner N to tend".
  Each line has a green or berry square that matches the care dots. A count of
  zero reads "all tended". The button has `aria-expanded`, and it opens a list
  of the flowers still waiting on either of you. The list scrolls inside the
  plaque and never grows past the header. Each row is a 44px button with the
  32px sprite, the name, a note and both care dots. The notes are "Partner
  cared · add yours", "Not cared yet · may lose growth", "Not cared yet today",
  "Waiting on your partner" and "Opens 10 p.m.". Rows due for you come first.
  Escape closes the list and returns focus to the toggle.
- **Primary action:** "Tend Rose →" opens the next flower's sheet through the
  existing open-spot state. With nothing due for you, "Plant a seed →" opens
  the seed picker on the first empty spot. There is no primary action when no
  seed can be planted. The accessible name adds the spot ("Tend Rose in spot
  3"), and the arrow is hidden from assistive technology.
- **Rest states:** when both of you have cared for everything and nothing
  opens later, the plaque turns `--sage-light` and reads "All tended today ✿".
  When only a closed Moonflower remains, the toggle reads "All tended for now ·
  Moonflower opens 10 p.m.".
- **Focus:** a sheet opened from the card returns focus to the control that
  opened it when it closes. The fallback is the primary action, then the
  toggle, then the heading. Other sheets keep Radix's default return to their
  flower.
- **Never covering plots:** an in-flow spacer after the beds matches the
  collapsed plaque's height plus 32px. That lets the last plots scroll clear of
  the plaque and the hotbar. An open list can overlap the garden, because the
  person asked for it, and closing it restores the view.
- **Hotbar clearance:** `globals.css` defines `--hotbar-height` and
  `--hotbar-bottom` where the hotbar is styled. The slot height is
  `max(54px, 45px + 1.1 × the label size)`, and the label size follows the
  root text size. The hotbar and the card both use these properties. At 16px
  and 24px root text, the card stays 10px above the hotbar at 320, 390 and
  1280 pixels. The spot-request notice from decision 0055 docks 12px above
  the hotbar on the same properties. Its z-index is 20, so while it shows it
  sits in front of the card.
- Below 380px the primary button uses `--text-sm`. When the counts and the
  button don't fit on one row, the button wraps to its own row. Below 360px
  the plaque sits above the full-width hotbar shelf.

## Surface and sheet cues

This decision adds cues to decision 0038's quiet surface. The label boxes,
coordinates and targets are unchanged.

- **Partner cared:** your care dot gets a 2px `--forest` outline that gently
  pulses. Under reduced motion or with gentle motion off, the outline is
  steady.
- **Blooms tonight:** a gold pixel sparkle with a smaller star sits beside the
  care tag and twinkles in two steps. It is static under reduced motion.
- **At risk:** a small empty water drop with a `--wood-dark` outline sits on
  the other side of the tag.
- Each flower button's accessible name adds the cue: ", your partner cared,
  add yours", ", blooms at 4 a.m." or ", may lose growth at 4 a.m.".
- The Help card gains one line that explains the three marks: "An outlined dot
  · your partner cared. Sparkle · blooms at 4 a.m. Empty drop · may lose
  growth." It says "outlined" because the outline stays when motion is off.
- The flower sheet's heading area adds one line under the progress bar.
  Nothing else in the sheet changes. The lines are:
  - "Your partner cared today. Add yours before 4 a.m. to grow." A bloomed
    Cactus says "to check in together" instead.
  - "You both cared today. It blooms at 4 a.m. ✿"
  - "No care yet today. It needs you both by 4 a.m., or it loses a growth
    unit." A closed Moonflower adds that it opens at 10 p.m.

In forced colors, the count squares and card dots use `CanvasText` and
`Canvas`, the chevron uses `ButtonText`, and the pulse becomes a steady
`Highlight` outline.

## Measured contrast

WCAG relative-luminance ratios. Text needs 4.5:1. Controls and state marks
need 3:1.

| Pair | Ratio |
| --- | --- |
| `--ink` counts on `--paper-light` / `--paper-deep` (hover) | 13.28 / 10.21 |
| `--muted` row notes on `--paper-light` / `--paper` | 6.86 / 6.24 |
| `--paper-light` on `--forest` (primary) / `--forest-dark` (hover) | 4.73 / 7.98 |
| `--paper-light` "Today" on `--wood-deep` | 6.77 |
| `--forest-dark` rest text on `--sage-light` | 7.09 |
| `--forest-dark` partner-cared sheet cue on `--paper` | 7.26 |
| `--frame-border` plaque and button edge on `--paper` / `--sage-light` | 10.68 / 10.44 |
| Nudge outline `--forest` on the care tag's `--paper-light` | 4.73 |
| Sparkle and drop `--wood-dark` outline on base grass / darkest texture | 4.42 / 3.65 |
| Sparkle `--gold` against its `--wood-dark` outline | 7.67 |

## Verification boundary

Unit tests cover the due rule for every flower state and both members. Behavior
tests cover the counts, Tend next, the list, the planting fallback, the rest
state, the cue names and focus return. A temporary synthetic preview of the
actual components was checked at 320, 390 and 1280 pixels, including forced
colors with reduced motion. It was not committed and used no production data.
No backend, schema, route, dependency, growth rule, sheet body or seed picker
changes.
