# 0064 — Completed Marigolds retain history without daily care

Status: approved (owner request, [issue #159](https://github.com/C0derTang/shared-garden/issues/159), 2026-10-10).
Supersedes [decision 0062](0062-marigold-daily-care.md), restoring the completed-Marigold rule in [decision 0004](0004-finalized-launch-rules.md).

## Decision

A completed Marigold no longer accepts new daily compliments or appears in
Today's care, care dots, or care prompts. Its permanent flower and existing
compliment history remain. Members can plant another Marigold under the existing
two-unbloomed limit; completed Marigolds do not consume that capacity.

- Unbloomed Marigold care, growth, first-bloom credit and planting rules remain.
- Future rollover excludes completed Marigolds from new daily care facts and
  qualifying activity. Existing entries, settled facts and earned achievements
  remain intact; the rollback does not rewrite history.
- Existing replies and the original author-only edit window remain unchanged.
- Cactus check-ins and separately approved optional mature Hydrangea moods remain.
- An additive migration replaces only submission and settlement functions. The
  previously applied migration is retained; no production reset or data deletion
  is part of this rollback.

## Why

Planting another Marigold already provides a way to continue sharing compliments,
so ongoing care on the completed flower is redundant.

## Applying the rollback

If migration `20261006000000` has already been applied, apply the forward
correction `20261010000000`. If the earlier migration is absent, apply both exact
reviewed migrations and record their normal history entries in one transaction,
so the intermediate permission is never visible and cannot be applied later out
of order. Do not replay unrelated pending migrations. Verify final function
definitions and migration history without creating production garden activity.
