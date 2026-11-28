# Shovel planting menu implementation plan

> **For agentic workers:** Use the repository's dedicated isolated builder and fresh independent review workflow. Apply superpowers:subagent-driven-development or superpowers:executing-plans as appropriate without bypassing AGENTS.md.

**Goal:** One right-side shovel tab opens the existing planting screen; empty plots no longer initiate planting.

**Architecture:** Keep the canonical positive `state.garden.next_spot` and existing mutate transaction. Open the existing planting SplitView directly from the shovel, changing only open/close ownership and authoritative slot allocation, and suppress empty target rendering/picking only for GardenV2 through an optional shared renderer flag whose default preserves other consumers.

**Tech stack:** Existing React/Next/TypeScript/CSS/Radix and pinned vgpu; no dependency changes.

**Spec:** Live issue236, decisions0004/0067/0075/0076; record new choices in0077 before core edits. Version this short plan in docs/superpowers/plans/2026-11-28-shovel-planting-menu.md.

## Global constraints

Strict13 picture/name-only navigation picker. No rule/schema/geography/model/shader-quality/service/cost/privacy/legacy change. Explicit submit only. No timeouts, fixtures, coverage or geometry/reference tolerance reductions. Preserve original user files and unrelated3001.

## Review focus

- Refresh changes next_spot while a Dandelion wish is typed: preserve type/wish and submit the latest slot.
- Concurrent conflict/duplicate click: one explicit transaction, truthful error and preserved draft, explicit retry only.
- Delayed save after close/newer flower/menu or queued read: retain saved plant and newer UI/focus/draft/URL.
- Empty targets must be absent from draw, pointer hit, captions, keyboard and cue reservations; preserve actual plant access.
- Narrow landscape, held/pre-device/GPU loss and stacked tabs: preserve safe44px controls, scroll isolation, exact tour and modal focus.

## Atomic feature steps

Files: garden-v2.tsx, plant-view.tsx, garden-v2.module.css, flower-picker.tsx only if tab grouping requires it, GardenWorld/renderer optional planting-target flag, guide/hint copy; focused matching tests. Prefer filtering current keyboard plots at the consumer to avoid rewriting immutable address helpers. New profiling script and0077/evidence/plan belong to this same issue.

- [x] Record the direct user request, user correction to reuse original planting UI and exact conservative icon/copy/automatic placement choices and scope in0077 plus the issue before core edits.
- [x] Add meaningful failing component/form tests for shovel-only access, all13 types, `PlantView({open,...})` (replace plot-bound opening), latest positive next_spot at submit, selected-type/wish retention, conflicts/duplicate lock, focus/exclusivity and existing late-response/normal-success guarantees. Run them red against the prior implementation.
- [x] Preserve original057 PlantView visible JSX/styles/SplitView hero and form; replace plot-bound opening internally. Keep `onPlanted(result, submittedSpot)` and initiating/queued intent checks. Add one recognizable shovel trigger above the existing flower tab. Active successful planting opens its actual UUID; close-only late completion stays closed.
- [x] Relay a scoped optional `plantingTargets` boolean through GardenWorld/renderer, defaulting to existing behavior. GardenV2 opts out; no empty marker draw/hit targets, clickable planting captions, hidden empty buttons or phantom cue reservations. Geometry/address data remains unchanged; keep physical/keyboard flowers and Dandelion drifting seeds.
- [x] Update truthful hint/guide copy. Pass the focused regressions, including all five review-focus conditions. Inspect actual desktop/phone checkpoint before broad runs and send root visible screenshots.
- [x] Integration order revised by root after the user correction:236 completes and merges first from057;237 integrates merged236 and performs final combined camera/control verification. Never consume unmerged237 or edit garden-tour.ts.
- [x] Freeze source, run final four-size synthetic actual menu/forms/13types/latest-slot/conflict/delayed/held/preGPU/physical/no-empty-target/native-scroll/placement checks with honest manifests. Run full lint/types/tests/build/Node55 and seven actual production404 checks, required CI and precise unchanged-input quality qualifications. Preserve all raw failures and platform limitations.
- [ ] Commit/push codex/236-shovel-menu, ONE PR Closes236; return exact base/head/tree/resources/evidence. Do not approve, merge or clean up. Root will obtain fresh review, handle corrections and merge/release/cleanup.
