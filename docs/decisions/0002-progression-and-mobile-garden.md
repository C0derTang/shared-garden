# Progression and mobile garden

Status: approved historical decision record, extended and partially superseded
by [record 0004](0004-finalized-launch-rules.md).

Source: [Issue #5](https://github.com/C0derTang/shared-garden/issues/5).
This extends [record 0001](0001-approved-garden-rules.md) for Shared Garden's
fixed two-person private scope. Its other approved rules remain in force.
Future feature issues must reference these records and follow
[AGENTS.md](../../AGENTS.md) and [CLAUDE.md](../../CLAUDE.md).

## Approved decisions

1. **Peony growth timing.** Peony gains one growth unit immediately when both
   people complete the next shared milestone. Multiple ordered milestones may
   count in the same garden day. The four milestones and no-stage-loss rule in
   record 0001 remain unchanged. Ordinary flowers still apply growth at rollover.
   Streak settlement and achievement timing, not settled by this initial
   decision, are now specified in [record 0004](0004-finalized-launch-rules.md).
2. **Unlock progression.** Rose, Cactus, Tulip, and Marigold are initially
   available. Each additional total bloom unlocks the next type in this order:

   | Total blooms | Newly available type |
   | --- | --- |
   | 1 | Daisy |
   | 2 | Hydrangea |
   | 3 | Sunflower |
   | 4 | Snapdragon |
   | 5 | Moonflower |
   | 6 | Bluebell |
   | 7 | Dandelion |
   | 8 | Forget-me-not |
   | 9 | Peony |

   All 13 types are available after nine total blooms. Cactus check-ins after
   its first bloom do not earn additional bloom credit.
3. **Working visual direction.** Try cozy pixel art with crisp flower sprites,
   warm lighting, and gentle animations. This is a direction to explore, not
   approval of every decorative element, layout, or control in generated concept
   images. [Record 0004](0004-finalized-launch-rules.md) finalizes the launch
   direction and authorizes documented conservative visual choices.
4. **Planting spots.** Use fixed planting spots arranged naturally around the
   garden. A user chooses an empty spot to plant. This does not permit free
   placement or assume a rigid visible grid.
5. **Garden expansion.** Automatically add new garden beds when existing
   planting space fills up. Preserve every bloomed flower and its history.
   This initially retained an assumed active-flower limit.
   [Record 0004](0004-finalized-launch-rules.md) supersedes that constraint:
   there is no overall active-flower cap, while every per-type limit remains.
   It also settles navigation and layout direction and authorizes documented
   implementation choices for bed dimensions and expansion.
6. **Phone-first design.** Design for phones first, with a wider garden view on
   desktop. Breakpoints, navigation, offline/PWA behavior, and other interaction
   choices were initially open; [record 0004](0004-finalized-launch-rules.md)
   now specifies launch behavior and the allowed discretion.

## Current scope and follow-up decisions

[Record 0003](0003-supabase-and-access.md) selects the backend, sign-in, frontend,
and hosting and records provisioning observations.
[Record 0004](0004-finalized-launch-rules.md) is the current launch specification:
it settles the remaining product and interaction rules, removes only the overall
flower cap, and authorizes documented conservative choices within its boundaries.
Its integration dependencies and escalation requirements remain in force. These
decision records describe approved requirements, not a completed application.
