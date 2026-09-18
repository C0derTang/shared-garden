# Garden UI integration contracts

The UI in issue #27 consumes the merged [rollover](../database/rollover.md),
[entries](../database/entries.md), [planting](../database/planting.md), and
[flower sprite](../decisions/0022-flower-sprites.md) contracts. Its design choices
are recorded in [decision 0011](../decisions/0011-working-garden.md).

- `src/lib/garden/model.ts` validates consumed authoritative snapshots and supplies
  the shared data types. Extend this boundary when adding new media/special
  payloads; never synthesize earned progress or actor identity in UI code.
- `src/lib/garden/actions.ts` owns guarded reads, ordinary mutations and bounded
  twenty-row history pages. Future actions must independently call
  `requireMember()`, use the backend RPC, and reread after accepted/rejected writes.
- `GardenClient` owns shared state/refresh. `useGarden` coordinates mutation locks,
  stale snapshots, foreground/boundary refresh and live invalidations. Future
  workflows should use this refresh path, not a second competing read model.
- `FlowerSheet` shows public-to-both members' current contributions immediately.
  Replace only the relevant unavailable branch for media or Peony, and extend
  `EntryContent` for safe rendering. Keep current entries outside the form so
  reading is never contingent on submitting. Add media signing/authorization at
  its backend boundary; never expose privileged keys or permanent public URLs.
- Sunflower uses `PhotoForm`/`PhotoViewer` and the guarded private media protocol.
  `GardenMutation` additionally accepts an external operation with a
  `checkCurrent()` callback; operations must call it again before the final
  state-changing request, resolve only after a confirmed receipt, and throw on
  ambiguous/error outcomes. The shared hook handles locks and refresh.
- `EntryForm` handles ordinary text, song metadata, moods and one-tap Cactus.
  Preserve both original timestamp and same-day edit bounds. A shared-plan Peony
  editor has its separate approved negotiation rules and must not reuse the
  ordinary payload mutation as a shortcut.
- `SeedPicker` uses actual catalog/unlocks and the selected fixed spot. Its
  unavailable notice can be removed for a type when that care workflow lands.
  Dandelion fulfillment uses `fulfill_dandelion` and the nullable actor/time fact
  on the authoritative flower; see [its contract](../database/dandelion.md).
  Only that fact drives the fulfilled sprite; planting and daily details stay unchanged.
- Song playback/collection should compose the separately merged `SongPlayer` in
  the later music issue. Issue #27 intentionally presents metadata and safe links.
- Each future Memories/Achievements/Settings page must retain its own membership
  guard. Replace the honest upcoming screen within the existing navigation.

## Disposable local verification

Use a fresh copy at `/tmp/shared-garden-issue27`, project ID
`shared-garden-garden-ui`, local API/database/shadow ports 57121/57122/57120,
and Realtime enabled. Never link a hosted project. Capture local `start` and
`status -o json` output into mode-600 files outside the repository.

Run the full web lint/typecheck/test/build, pgTAP suite, all three race harnesses
and Auth-role SQL harness documented in the database guides. With no committed
fixture data present, run:

```sh
node scripts/verify-garden-realtime.mjs /tmp/shared-garden-issue27/status.json
```

CI passes the explicit `ci` mode for the committed local ports/container; no
arbitrary endpoint or container argument is accepted. The script refuses any
other endpoint, dedicated container, or preconfigured
membership/garden. It commits generic synthetic Google-bound Auth fixtures and
uses short-lived local JWTs. It proves actual two-member event delivery for
planting, entry insert/edit, growth and unlock changes; immediate partner reads;
anonymous/outsider denial; and live revocation on an already-connected channel.
Growth/unlock event fixtures are privileged local writes, not a claim that the
browser can award them. It also checks repeated authoritative reads do not
emit more changes and removes fixtures/channels in `finally`. Reset afterward,
rerun database tests and verify zero membership/Auth/garden rows.

Browser evidence uses the real app with this disposable backend. A temporary
loopback-only fixture helper outside production source can install synthetic
sessions using the shared SDK cookie contract, one member on each loopback
hostname. That is synthetic Auth verification, not a real Google OAuth exchange.
No login bypass, test clock, helper route or production demo fixture is shipped.
Record actual phone/desktop, focus, entry/edit, partner update and rollover
observations separately from unit/mock evidence in the review handoff.


## Peony extension (#31)

`PeonyPanel` composes inside `FlowerSheet`, using guarded Peony actions and the
validated bounded state in `src/lib/peony`. It watches the owning garden snapshot's
server timestamp for invalidation. The shared `Mutate` coordinator also accepts
an external operation callback, retaining its pending/read/day guards and
refreshing the garden afterward. A callback resolves only on a confirmed save;
`checkCurrent()` can be called before a delayed external finalization. Ordinary
commands keep the same server action contract. Do not make separate competing
garden subscriptions. Peony INSERT/UPDATE notifications enter `subscribeGarden`
and the existing debounce; plan UPDATE also covers acceptance deletion.
