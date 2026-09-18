# Dandelion verification

Issue [#32](https://github.com/C0derTang/shared-garden/issues/32), built from
`e6f938675a0a0baa04fabe38230bd31d360647ac`. Synthetic disposable local data only.

- Lint and TypeScript passed. Focused garden suite: 58 assertions passed.
- Full Linux amd64 web suite: 232 assertions plus 27 content tests passed. Two
  optional Auth/Storage HTTP suites were skipped by the ordinary test command.
  Production builds passed on macOS and Linux. Linux runtime trace audit passed:
  56,623,040-byte entire-server/runtime upper bound, all audio executables traced.
- Clean SQL suite: 11 files / 1041 assertions passed, including 15 fulfillment
  assertions. Guards, actor/time pairing, anonymous/outsider/direct-write denial,
  repeat after two elapsed days, snapshot visibility and unchanged flowers passed.
- Actual Dandelion race observed a second session blocked on the shared database
  lock. Competing members returned identical original facts; repeated requests
  from one member preserved the same timestamp and no new activity/growth/bloom.
- Existing planting, entry, rollover, Peony, photo and audio lock races passed.
  Auth-role hook, confirmation, spoofed claims and revocation SQL passed.
- Real production-app browser flow used a loopback-only synthetic session helper
  outside source. The owner confirmed fulfillment; the partner's already-open
  sheet updated through existing live invalidation, before any manual refresh.
  The wish, actor/time, supporting detail and history remained visible. Refresh
  retained the fulfilled bed label and permanent spot; counts stayed two planted,
  one bloom. Phone partner layout at 390 × 844 was readable and scrollable.
- The existing static fulfilled SVG is used for all users: no new animation,
  timer or motion CSS exists. Its scattered seeds remain decorative. This is the
  reduced-motion alternative by construction, not a claim of changing or testing
  an operating-system preference. Browser testing was in the hidden in-app
  browser, not physical phones or native Safari. No lock was bypassed.
- Browser tabs and helper/server processes were closed. The disposable database
  was reset after browser fixtures; races cleaned their fixtures. Final SQL tests
  roll back, and member/Auth/flower/garden row counts were all zero.

An initial macOS full test run lacked optional development audio executables and
failed six unchanged native audio tests. The complete Linux rerun above passed
with the shipped production binaries. An initial build rejected an external
node_modules symlink; a local dependency copy resolved it without source changes.
No production migration, real Google OAuth exchange, deployment or external
account changes are claimed. Independent exact-head review remains required.

## Peony integration candidate

Merged reviewed main `d07697999ae13ea9ef6b2c65132571669530ba3c` before independent
review of this feature. Resolved shared sheet/bed conflicts by keeping Peony's
separate milestone panel, milestone labels and absent daily-care markers, together
with Dandelion's fulfillment component, permanent labels and static artwork.
The merged external-mutation hook remains intact; fulfillment still uses an
ordinary garden command.

Lint/typecheck passed. Full Linux suite passed 244 assertions plus 27 content
tests; macOS/Linux production builds and the runtime trace audit passed (new
entire-server/runtime upper bound 56,690,358 bytes). A subsequently added
coexistence regression passed with all 13 garden-client tests; the combined
client/hook/Peony/Dandelion suite passed 29 tests. SQL passed 1041 assertions,
Dandelion/Peony observed-lock races and Auth-role SQL passed again. A temporary
local-port adaptation of the merged Peony Realtime harness passed partner
plan/contribution delivery, stale-version rejection, live revocation/RLS and
no-read-loop checks. No production verifier was changed for local ports.

An additional browser smoke attempt could not start: the new browser session
reported no available browser and native access reported a locked Mac. No lock
was bypassed. Earlier real Dandelion browser evidence above predates this merge;
combined conflict resolution is covered by the new coexistence regression and
full tests, not claimed as a repeated manual flow. The attempted synthetic
fixtures were reset and temporary helper/server processes stopped.
