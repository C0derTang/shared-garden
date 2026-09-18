# Approved garden rules

Status: approved historical decision record, extended and partially superseded
by [record 0004](0004-finalized-launch-rules.md).

Source: [Issue #3](https://github.com/C0derTang/shared-garden/issues/3).
This records approved rules for Shared Garden's fixed two-person private scope;
the complete launch rules and achievement catalog are now recorded in
[record 0004](0004-finalized-launch-rules.md).
Future feature issues must reference this record and follow [AGENTS.md](../../AGENTS.md)
and [CLAUDE.md](../../CLAUDE.md).

## Approved decisions

1. **Achievement challenges and timeline.** Preserve the existing challenges and
   allow a longer, flexible completion timeline; about one month is not a
   deadline. Three Forget-me-nots, the 21-day streak, and Recovery remain
   required. Reducing counts, making these optional, or substituting cumulative
   days requires further approval.
2. **Launch roster.** Include 13 types: Rose, Cactus, Tulip, Marigold, Daisy,
   Sunflower, Moonflower, Bluebell, Forget-me-not, Dandelion, Peony, Hydrangea,
   and Snapdragon. Introduce types gradually through unlocks. The exact unlock
   order and thresholds are approved in
   [record 0002](0002-progression-and-mobile-garden.md).
3. **Cactus check-ins.** Paired Cactus check-ins count toward the garden-wide
   streak even after bloom, provided both people check in during the same garden
   day. Cactus stays permanently waterable and exempt from stage loss. This
   does not introduce repeated blooms or additional bloom credit.
4. **Peony milestones.** Preserve four growth units through four ordered shared
   milestones: both suggest a date idea; both agree on activity and time; both
   confirm the date happened; both share a favorite moment afterward. Each
   completed shared milestone adds one unit. Progress holds between milestones
   without stage loss. Immediate growth and multiple ordered milestones in one
   garden day are approved in [record 0002](0002-progression-and-mobile-garden.md).
5. **Shared clock.** Use `America/Los_Angeles`, following Pacific daylight saving
   changes. Rollover is at 4 a.m. local garden time. Each garden day runs from
   4 a.m. through just before the next 4 a.m.; its duration is not invariably
   24 hours. Moonflower is available from 10 p.m. until the next 4 a.m. rollover.
6. **Before-noon achievement.** The achievement for both watering every live
   flower before noon counts ordinary daily-watered live flowers and excludes
   Moonflower and Peony. The empty-set, planting-time, and eligibility details
   were open when this decision was recorded;
   [record 0004](0004-finalized-launch-rules.md) now defines the nonempty 4 a.m.
   snapshot and Cactus eligibility.
7. **Marigold volume achievement.** Require 10 bloomed Marigolds, not 10
   individual compliments per person. No separate per-person bloom quota is
   approved.
8. **Dandelion wishes.** Each Dandelion represents one shared wish. Daily
   watering entries add details to that wish rather than unrelated new wishes.
   This initial decision did not establish completion or agreement rules;
   [record 0004](0004-finalized-launch-rules.md) now approves fulfillment and
   blowing after bloom.

## Current scope and follow-up decisions

[Record 0002](0002-progression-and-mobile-garden.md) records unlock progression,
Peony timing, fixed planting spots, and the initial phone-first visual direction.
[Record 0003](0003-supabase-and-access.md) selects Supabase, restricted Google
sign-in, Next.js, and Vercel and records provisioning observations.
[Record 0004](0004-finalized-launch-rules.md) settles the flower and achievement
catalogs, payloads, timing edge cases, interface, launch, and notification rules
that were previously open. It also authorizes documented conservative choices
within those boundaries. Required access and credentials remain external
integration dependencies; conflicting rules or material scope/privacy changes
still require escalation under [AGENTS.md](../../AGENTS.md).
