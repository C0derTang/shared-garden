# Achievement contracts and verification

[Decision 0017](../decisions/0017-permanent-achievements.md) documents the choices
for [issue #33](https://github.com/C0derTang/shared-garden/issues/33).
[Decision 0004](../decisions/0004-finalized-launch-rules.md) defines every rule.

## Consumers

Call `public.current_achievements()` as an authenticated, configured member. It
accepts no arguments and returns:

- `server_now`: the operation's authoritative post-lock time.
- `current_streak`: the shared streak through completed garden days.
- `achievements`: exactly 26 rows ordered by `position`, each containing
  `achievement_id`, `title`, `requirement`, `target`, `unit`, `progress`, and
  nullable `earned_at`.

The fixed catalog identifiers are permanent API keys. Progress is bounded by
the target; an earned time is the permanent award marker. Progress and awards
are shared by both members, with no per-person achievement quotas. `earned_at`
is discovery time, not a reconstructed activity date.

Future final-interaction code should begin its normal garden operation and then
call `private.all_ordinary_achievements_complete()` within that transaction. This
internal predicate requires membership and counts the 26 fixed ordinary awards.
It is not executable by browser roles, and it has no final-configuration access.

The evaluator runs after settled catch-up, planting, original entry insertion,
Peony completion including first bloom, and Dandelion fulfillment. All facts
retain their existing authority and timestamps. No achievements input or generic
award-event endpoint is provided. The ordinary read cannot deliver private final
content. All safe public tables retain member RLS and read-only client grants.

## Verification

Use a disposable local project, never a hosted garden:

```sh
npm run db:reset
npm run db:test
python3 supabase/tests/concurrency/achievements_race.py supabase_db_shared-garden-clock
npm run db:reset
npm run lint
npm run typecheck
npm test
npm run build
```

The database suite covers each of the 26 thresholds, rejection just below them,
all-types inclusion, same-instance recovery, distinct question IDs and mood
dates, original inclusive ten-minute pairing, cross-day Peony exclusion,
nonempty absolute-noon settlement, 21-day catch-up followed by missed days,
post-bloom Cactus, and immediate planting/entry/Peony/fulfillment awards. It
checks unchanged tuple versions on repeat evaluation, stable earned timestamps,
member/stranger/anonymous access, direct-write denial and unknown award rejection.
Synthetic SQL fixture mutations run only inside rolled-back tests.

The overlapping-session harness observes actual garden-lock waits between
members, reads, planting and repeated fulfillment. The existing Realtime verifier
also checks delivery of first-seed and timing awards to the partner, 26 safe
read rows, unchanged-read silence, outsider denial and live revocation. Database
CI runs both checks and resets its fixtures afterward.

Phone verification used the actual production build with disposable local
synthetic evidence: 320- and 390-pixel viewports, all 26 requirements, initial
0/26 with Cactus 1/13 planted, live partner planting to 1/26, bounded partial
progress, and 26/26 with all progress bars complete and earned dates retained
after reload. Both widths had no horizontal overflow. The final cards remained
readable above fixed navigation. The viewport was restored and the temporary
tab closed. No hosted data, real Google login, physical phone or OS motion-toggle
test is claimed. Reduced motion disables the optional earned-card fade in CSS.

The full native macOS and Linux unit suites and production builds passed; the
two opt-in HTTP integration suites remain separately exercised by their existing
media/audio CI jobs. Linux runtime verification confirmed the bundled decoder
and limiter execute and the assembled server remains below the existing size
limit. There is no deployment or production fixture seeding in this issue.
