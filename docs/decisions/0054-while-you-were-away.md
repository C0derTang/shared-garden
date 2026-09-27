# While you were away

Status: conservative choices for
[issue #122](https://github.com/C0derTang/shared-garden/issues/122), under the
approved discretion in [decision 0004](0004-finalized-launch-rules.md) and the
user's reskin and UX authorization recorded in
[decision 0049](0049-harvest-handheld-reskin.md). It uses the Harvest Handheld
tokens and frames from decision 0049. Growth, rollover, unlock and achievement
rules from decisions 0004, 0007–0010 and
[0017](0017-permanent-achievements.md) are unchanged, and so is the private
scope in [decision 0020](0020-private-interaction.md). Motion follows
[decision 0019](0019-tutorial-and-settings.md) and
[decision 0036](0036-flower-idle-motion.md).

## What it shows

When a member opens the garden after something happened, a small
"While you were away" card celebrates it. It covers four kinds of news:

- **Blooms:** a flower got its first bloom ("Your Rose bloomed").
- **Unlocks:** a flower type was unlocked ("Daisy unlocked").
- **Partner care:** your partner cared for flowers on the current garden day
  ("Your partner cared for Rose and Tulip"). Your own care is never news.
- **Badges:** a permanent achievement was earned ("New badge: Three-day
  streak"), using the server's achievement title.

Each kind is one line. Names are grouped: "Rose and Tulip", "Rose ×2" for two
flowers of one type, and "Rose, Tulip and 2 more" past three. Each line goes
straight to its target:

- A single flower line is one button that opens that flower's sheet.
- A line with several flowers shows the sentence and one sprite button per
  flower, named "Visit Rose, spot 2".
- The unlock line opens the seed picker on the lowest empty spot. With no
  empty spot, it is shown without a button.
- The badge line is a link to the Achievements panel.

The same check runs when the garden state changes while the page is open, so a
bloom at the 4 a.m. rollover or live partner care also shows the card. New
lines merge into an open card without repeating a line. After it's dismissed,
the card comes back only with news that arrived later.

## Your own actions are never news

The card is for what happened while you weren't looking, so the viewer's own
actions never show it or its confetti. In the database, blooms and unlocks
come from settlement, and badges are awarded during settlement and during care,
planting and wish actions. Settlement runs lazily at the start of any garden
operation after 4 a.m., including a read or your own save. A final Peony
milestone also records a bloom, and its unlocks, during a member's action. So
blooms, unlocks and badges can all arrive in the state that answers your own
action.

- **Your action's result:** `GardenClient` wraps the garden's `mutate`
  (`useOwnActions`) and records the state each save returns, in the same batch
  that renders it. Blooms, unlocks and badges in that state only move the
  snapshot.
- **While a flower or seed sheet is open:** every garden action starts from one
  of these sheets, however it was opened: a tap on the spot, the Today card's
  Tend or Plant action ([decision 0051](0051-today-card-and-flower-cues.md)),
  a spot request from Memories or a link
  ([decision 0055](0055-album-badges-and-menus.md)), the guide, or this card.
  All of them go through `openSpot`, and every save goes through the wrapped
  `mutate`. While a sheet is open, blooms, unlocks and badges that appear only
  move the snapshot. Nothing appears behind the sheet.
- **Badge reads:** badges come from a separate, delayed read, so the guard
  outlives the read timer. When a state from your own action, or a change
  while a sheet is open, alters the garden facts badges depend on, badges
  become pending. The pending flag is kept in memory and in the stored
  snapshot (`badgesPending`). Every read records when it started. The first
  successful read that started after your action only moves the badge
  baseline, and only that read clears the flag. So leaving within the 1.5s
  delay, a failed read, or another change that restarts the timer never turns
  your own badge into news. A pending flag stored by an earlier visit makes
  the next visit's first successful read silent. Until then no badge is
  celebrated. The hotbar dot still marks the badge as unviewed, because it
  belongs to both of you.
- **Partner care** is never the viewer's own. Care that arrives while a sheet
  is open is held, and the card shows it once the sheet closes.

This errs toward silence. A partner-caused bloom, such as a Peony milestone,
that lands while your sheet is open is absorbed instead of celebrated. So is a
partner-earned badge that arrives in the same silent read as your own.

**Known edge: two open tabs.** The own-action record lives in the tab that
acted. Another tab of the same member sees that result as a live change. It
may celebrate your own bloom or unlock if it reads first, and it can show a
badge line if its badge read lands before the acting tab writes the pending
flag. Stored snapshots still stop any repeat after that. Fixing it would need
shared cross-tab or server state, which this browser-only design leaves out.

## Snapshot

The comparison uses a snapshot in this browser's `localStorage`, keyed
`ccsgarden:since-last-visit:v1:<garden id>:<member id>`. It holds:

- the ids of flowers with a first bloom;
- the unlocked type keys;
- the garden day and the ids of flowers your partner cared for on that day;
- earned achievement ids, and the earned ids already seen in the Achievements
  panel;
- whether a badge read is still pending after your own action.

It never stores entry text, wishes, answers, media, songs or any other private
content, only ids, type keys and the garden day. It is not an account
preference and is not shared across devices. A cross-device version would need
server state and is a separate issue.

The garden state only carries the current day's entries. So after a rollover,
every partner care on the new day counts as new. Care from an earlier day that
was never seen is not reconstructed.

The snapshot moves forward as soon as news is found, before the card is
dismissed. A reload or a second tab then never celebrates the same news
twice. The card closes on reload, which is the conservative choice.

- **First visit:** with no readable snapshot, nothing is shown. The current
  state becomes the snapshot.
- **Unavailable storage:** if storage is missing, blocked or unreadable, or the
  snapshot cannot be saved, nothing is shown for the rest of the visit. It
  never throws, and it never falsely celebrates.
- **Bad data:** a malformed or other-version value counts as no snapshot.

## Badges and the hotbar dot

Achievements are not part of the garden state, so the card reads them with
the existing `readAchievements` action. It reads once on load, and again 1.5
seconds after a change to the garden facts badges depend on: the garden day,
plants, blooms, fulfilled wishes, today's entries, the streak and qualifying
days. Ordinary polls do not trigger a read. The action is loaded on demand, so
the hotbar and garden modules do not import it up front. If a read fails, the
previous badge baseline stays. The first successful read becomes the baseline
and is never news.

Newly earned badges also put a small unread dot on the Achievements hotbar
slot. The dot is a 10px `--rust` square with a 2px `--wood-dark` edge in the
slot's top-right corner. The link's accessible name gains ", 1 new badge".
Opening the Achievements panel marks every earned badge as seen and clears
the dot. The dot is gone while that panel is current. In forced colors the
dot uses `Highlight` with a `CanvasText` edge.

## Look

The card is a `--frame-wood` 9-slice on a `--paper` body. It is centered
below the Help and Songs signs, `min(25rem, 100% − 24px)` wide, 124px from the
top on phones and 128px from 640px up. It uses the shared title plaque
(`sheet-title`) at `--text-md` (`--text-sm` below 360px, so it stays on one
line), with a small gold pixel sparkle, and the
shared red × stamp close in its 44px target (`sheet-close`).

- **Lines:** tactile `--paper-light` rows with the `--frame-border` outline,
  bevel and lip, at least 56px tall. They press down by `--press-depth`.
- **Row contents:** a 44px `--frame-slot` slot with a 32px sprite or pixel
  icon, then a Pixelify `--text-xs` kicker and the sentence in the body font
  at `--text-sm`. A button row ends with a Pixelify "Visit", "Plant" or
  "View" and a pixel arrow.
- **Kicker colours:** bloom `--forest-dark` (7.98:1 on `--paper-light`,
  6.13:1 on the `--paper-deep` hover face), partner care `--rust` (5.20:1),
  unlock and badge `--wood-deep` (6.77:1). `--rust` is only 4.00:1 on the
  hover face, so a hovered partner-care row uses the darker `--danger` berry.
- **Badge slot:** a plain `--gold` tile with a 2px `--wood-dark` edge and the
  bevel, in place of the slot frame, whose fill would hide the gold. Its
  decorative icon is `--wood-deep` (4.43:1).
- **Flower chips:** pressable parchment buttons at least 44px tall, with a
  32px sprite and the flower name in Pixelify `--text-xs`.
- **Forced colors:** the frames set `border-image-source: none`.

The card sits under the tools layer (`z-index` 2 against 3), so the Help card
and the guide always open over it. Sheets and route panels make it inert with
the rest of the garden.

The card stays clear of the collapsed Today card (fixed, `z-index` 19) above
the hotbar. Its height is capped at `100dvh` minus its top offset, the shared
`--hotbar-bottom` and `--hotbar-height`, and a Today-card clearance: 108px, or
160px below 360px, where the Today card wraps to 125px. The clearance covers
the Today card's height, its 14px title tab, its 10px gap and a 10px margin.
The cap never goes below 200px. When the lines don't fit, they scroll inside
the card, with padding that keeps row lips and focus rings in view. The spot
notice (`z-index` 20) and the Today card sit above the card. An expanded Today
list can cover it, because the member opened that list.

## Motion

The card drops in over 280ms in four steps. On each new batch of news, 20
square pixel confetti bits in gold, berry, green and parchment pop out of the
plaque and fall away in ten stepped frames over one second. The confetti is
rendered only when the gentle-motion setting is confirmed on. It stays off
while that setting is loading or unavailable. Both effects are hidden under
`prefers-reduced-motion`. The member's motion-off style from decision 0019
also stops them.

## Accessibility and focus

The card is non-modal. It never moves focus when it appears or updates, and it
takes no part in the sheet queue or the guide coordinator. A visually hidden
polite status region, always mounted, announces "While you were away:"
followed by the lines. It clears on dismissal. The card is a labelled region
with an `h2`. The close button is named "Dismiss While you were away". If
focus was inside the card when it's dismissed, focus moves to the garden
heading. A line opens a sheet through the same `openSpot` path the guide uses,
so closing that sheet returns focus to the flower's own spot button, as the
sheet's trigger.

## Verification boundary

Tests cover the diff for blooms, unlocks, partner care for either member,
rollover and badges. They also cover your own action's bloom, unlock and badge
being absorbed while partner care still shows (through the real garden client
and check-in, with the sheet opened by a tap, the Today card and a spot
request), and partner care held while a sheet is open. They cover an own
badge staying silent when you leave before the read, when a read fails, and
when another change restarts the read timer. They also cover the first visit
showing nothing, storage read and write failures, stored content, dismissal
and focus, live merging, no repeat on reload, confetti only when gentle motion
is confirmed on, and the hotbar dot.
Verification uses the actual components with disposable synthetic data at
320, 390 and 1280 pixels. It never reads or mutates production data. There is
no backend, schema, dependency, route or product-rule change.
