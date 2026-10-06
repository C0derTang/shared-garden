# 0061 — Color of the day: combined moods and Other

Status: approved (owner request, [issue #151](https://github.com/C0derTang/shared-garden/issues/151), 2026-10-05).
Amends decisions 0009, 0017, 0022, 0045, 0053 and 0059.

## Decision

A Hydrangea mood pick is one of:

- one of the six palette colors;
- two different palette colors, in the member's chosen order (main tone first,
  accent second);
- **Other**, a neutral choice for a feeling the palette misses.

Any pick may carry a short note of up to 140 characters answering "briefly,
why?". The note is required with Other and optional otherwise. Notes are
private member content like any entry text and appear in today's entries,
History and Memories.

The payload stays a flat string object: `mood`, optional `mood2`, optional
`note`. Existing single-mood entries are unchanged and keep rendering as before.

## Artwork

A two-color pick shows as the midpoint of its two palette colors in that
member's slot, at every stage and in historical Memory artwork. Other shows the
neutral artwork tone. No arbitrary color input exists; blends are derived from
the fixed palette only.

## Credit

Nothing about growth, streaks, care obligations or the post-bloom rules in
decision 0059 changes. The mood-match achievement counts a day only when both
members' color sets are identical (order ignored). A partial overlap does not
count, and Other never counts.

## Why

The owner asked for days that are "none of these colors, or a combination". A
bounded combination plus a neutral Other with a few words keeps the palette,
validation and privacy boundaries while fitting more real days.
