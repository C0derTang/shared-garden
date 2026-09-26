# Compact achievement badges

Status: conservative presentation choices for
[issue #106](https://github.com/C0derTang/shared-garden/issues/106), under the
approved discretion in [decision 0004](0004-finalized-launch-rules.md) and the
user's request of 2026-09-26. They refine the badge collection in
[decision 0032](0032-achievement-badges.md), keep the route panel contract in
[decision 0029](0029-immersive-garden.md), and use the tokens in
[decision 0041](0041-pixel-design-tokens.md). Achievement rules come from
[decision 0017](0017-permanent-achievements.md) and are unchanged.

## Badge tiles

Each collapsed badge has a 108-pixel minimum height instead of 150 pixels. The
emblem is 36 by 32 pixels with a 24-pixel icon. The label uses `--text-sm`, and
the status line uses `--text-xs`. The visible "Details +" and "Hide details −"
cue is removed. The button's `aria-expanded` and `aria-controls` still announce
and link the expanded state.

A 4-pixel progress bar sits under the status line. It uses a `--forest` fill on
a `--paper-deep` track with a `--line-strong` edge. It shows the same progress
and target as the status text beside it, capped at full. It is decorative and
hidden from assistive technology, because the badge's accessible name already
holds the full title, state, progress, target and unit. Earned and growing
badges still use the check or diamond mark, the solid or dashed border, and the
Earned or Growing text, so color is never the only signal.

The two-column phone grid and four-column grid at 640 pixels and wider are
unchanged. Badges keep the server's order without dense packing. Every badge
remains at least 44 pixels tall.

## Opened details

Opening a badge keeps its details in place in the grid, as in decision 0032.
Only one badge is open at a time, and the same button toggles it closed with
pointer, Enter or Space. Escape still closes the parent route panel.

After a badge opens, its list item scrolls into view with
`scrollIntoView({ block: "nearest" })`. That scrolls the route panel body only
as far as needed to show the badge and its details. It scrolls smoothly unless
the viewer prefers reduced motion, in which case it jumps. Focus stays on the
badge button. Closing a badge, or a refresh that keeps a badge open, does not
scroll.

An open badge shows its emblem, label, status and a wider progress bar in one
row, followed by the unchanged details.

## Connection status

When partner updates are not connected, the status next to Refresh reads "Not
live" instead of "Check for updates", so it no longer reads like a second
button. Its accessible label, "Refresh to check for partner updates", and the
connected "● Live" text are unchanged.

## Verification boundary

Verification uses the actual `AchievementsClient` in a temporary route panel
preview with 26 synthetic badges at 320, 390 and 1280 pixels, plus lint,
typecheck, tests and a production build. It never reads or mutates production
data. No achievement rule, data, backend, other panel, dependency or private
content changes.
