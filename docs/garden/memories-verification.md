# Memories verification

[Issue #34](https://github.com/C0derTang/shared-garden/issues/34), built from
`7f1d81c5454344a9121196c2210b0498c5a74cb9` after all declared dependencies merged.
[Decision 0018](../decisions/0018-memories.md) defines the read/browse contract.
All data and identities below are synthetic and disposable; no hosted action,
real OAuth exchange, private configuration, or production deployment is claimed.

- Full Linux web suite: 343 tests passed, with the two optional HTTP tests skipped
  by the default command. All 27 content checks, lint, TypeScript, production
  build, and executable audio runtime trace passed. Entire server/runtime upper
  bound: 58,382,733 bytes. The focused Memories suite has 15 tests.
- Clean database suite: 15 files / 1,312 assertions passed, including 35 new
  Memories assertions. Covered both members, stranger/anonymous/live revocation,
  caller RLS and stable read-only function properties, all 13 types, original
  Daisy assignment snapshots, repeated songs, unwatered wishes, current Peony
  acceptances, full snapshot replacement, filters, and preserved overdue garden,
  history, timestamps and credit. Auth platform-role verification also passed.
- Composite cursor checks cover C-collated source/ID ordering, independent source
  identities, equal instants and microsecond distinctions, repeated older reads,
  45 newer arrivals over three pages, and an unchanged older cursor after inserts.
  Client tests check 45 staged arrivals, bounded update batches across loaded and
  staged pages, stale snapshot rejection, filter-response races, retained pages
  on error, Peony acceptance removal and safe content rendering.
- Photo and audio real local Auth/Storage/production-route integration suites
  each passed separately, resetting between them. A private harness copy changed
  only the exact disposable project/container/port/log targets; its strict safety
  and behavioral assertions were preserved. The local gateway's upstream request
  isolation setting was verified. Native development binaries were ignored local
  copies; the production Linux binaries were tested by the full Linux suite.
- Synthetic CUA browser inspection covered populated, empty and error layouts at
  320 × 800, 390 × 844 and 1280 × 900, keyboard filter navigation and no horizontal
  overflow. Twenty initial cards plus eight older cards remained browsable. Both
  members saw the same histories with correct relative author markers. Historical
  Daisy questions, completed Peony milestones and plan/acceptances, permanent
  blooms, and fulfilled/unwatered wishes were inspected.
- Before activation the feed had no image, audio or embed elements. An explicitly
  loaded private 80 × 120 portrait used `object-fit: contain`; close removed it.
  The reused voice viewer loaded native controls only on request and remained
  paused with autoplay disabled. Filtering unmounted audio. Component tests cover
  expiry retry and media replacement; manual browser expiry waits, Spotify
  provider playback, physical phones and native Safari were not tested.
- With an older page on screen, a synthetic partner insert triggered an update
  notice. The same five older cards remained visible and all 28 loaded cards
  remained present; browser scroll anchoring accounted for the new notice.
  Explicitly showing the new memory produced 29 cards with the new one first.
- Query failure was induced only in the disposable database by temporarily
  revoking, then restoring, the feed RPC's execution grant. The initial failed
  filter had an error/retry state and no false empty heading. Recovery displayed
  the true empty result. Revocation prevented fresh reads; a fresh page request
  showed the private-access denial page. Previously downloaded cards remaining
  on an already-open failed refresh are not represented as new authorized reads.

The browser used the hidden in-app surface; its viewport override was reset and
both temporary tabs were closed. Browser/helper services were stopped. The local
fixture was reset after integration checks; all member/Auth/garden/flower/entry,
media/storage, achievement and private-interaction configuration/delivery counts
were zero before stopping its database stack. The builder worktree remains for
independent review and corrections.

An initial full database attempt was made while the browser fixture was still
populated, causing the suites' expected empty-bootstrap preconditions to fail;
the subsequent clean runs above passed. An initial private media harness build
rejected a dependency symlink outside its root; copying the dependencies into the
harness resolved it without changing production code or weakening assertions.
The new query itself performs no settlement; the shared guarded layout retains
its existing global lazy-settlement behavior. Independent exact-head review is
still required before merge.
