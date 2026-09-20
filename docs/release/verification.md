# Release verification record

What was actually run before the configuration in
[configuration.md](configuration.md) was proposed, where it ran, and what it
does not cover. Observations only; every claim below is local and synthetic.
Nothing here is hosted, Google, physical-device or provider-playback evidence.

## Platforms

| Label | Machine |
| --- | --- |
| **developer host** | macOS, Apple Silicon (`darwin`/`arm64`), Node.js 24 |
| **Linux container** | `node:24` under `--platform linux/amd64` on that same host, `x86_64`, Node v24.21.0 |

The production audio target is Linux amd64. `scripts/verify-audio-runtime.mjs`
asserts `linux`/`x64` in its first two lines and cannot run on the developer
host at all, so every Linux result below came from the container, and the
`audio-integration` CI job remains the authority for that platform.

## Web checks

| Command | developer host | Linux container |
| --- | --- | --- |
| `npm run lint` | PASS | PASS |
| `npm run typecheck` | PASS | PASS |
| `npm test` | 6 failures, see below | 53 files passed, 2 skipped; 406 tests passed, 2 skipped |
| `npm run build` | not run | PASS |
| `node scripts/verify-audio-runtime.mjs` | cannot run (`darwin`/`arm64`) | PASS |

On the developer host `npx vitest run` reports 52 files passed, 1 failed, 2
skipped and 399 tests passed, 6 failed, 3 skipped. All six failures are the
existing `src/lib/media/audio.test.ts` decode cases raising `audio_unavailable`,
because `vendor/audio/darwin-arm64` does not exist and is ignored by git. The
same six fail identically on the unmodified base commit, so this is a
pre-existing platform limitation rather than a regression. In the Linux
container those six pass. The two skipped files in both runs are
`src/test/media-local.test.ts` and `src/test/auth-local.test.ts`, which opt in
through environment variables and were run separately below.

The audio runtime audit printed:

```
PASS: traced executable Linux decoder/limiter, no tools/ template file traced;
entire server + runtime upper bound 58933385 bytes across 1228 files
```

The new `tools/` exclusion assertion was mutation-checked: a copy of the script
with `tools/native-smoke/handler.ts` injected into the traced set failed with
`Production runtime must exclude the template file …`, so the assertion is real
and not vacuous.

## Native smoke template

`src/test/native-smoke.test.ts` runs 15 cases. On the developer host 14 pass and
the single decode case is skipped, because no `vendor/audio/darwin-arm64` build
exists; every authorization case still runs there. In the Linux container all 15
pass, including the decode case.

The generated artifact was assembled and exercised end to end in the Linux
container:

```sh
node tools/native-smoke/generate.mjs /tmp/…outside-the-repo
# PASS: assembled 16 files …
npm install && npm run build && npm run start
```

| Request | Observed |
| --- | --- |
| no `Authorization` header | `401 {"error":"unauthorized"}` |
| wrong token, same length | `401 {"error":"unauthorized"}` |
| `NATIVE_SMOKE_TOKEN` unset | `503 {"error":"smoke_unavailable"}` |
| `NATIVE_SMOKE_TOKEN=short-token` | `503 {"error":"smoke_unavailable"}` |
| correct 64-character token | `200`, `cache-control: private, no-store` |

The `200` body contained exactly the allowed keys and nothing else:

```json
{"fixtureSha256":"5bc420d62cb176d5cdf8cf77e7a62d3a96609ec57c86d7e84b99f05fae990648",
 "outputSha256":"b0cbcac4f5beb40f2dc3fea08803282e1a47ac0b88ee2184209048617e5352f8",
 "samples":240000,"sampleRate":48000,"channels":1,"durationMs":5000,
 "nodeVersion":"v24.21.0","platform":"linux","arch":"x64",
 "decoder":"ffprobe version 9.0.1 Copyright (c) 2007-2026 the FFmpeg developers",
 "elapsedMs":161}
```

The original artifact's declared dependencies were `next`, `react`, `react-dom` and
`server-only` only. Its lockfile mentioned `supabase` zero times; `sharp`
appeared once, as Next's own optional dependency, and not as anything this
project asks for. The built `/api/smoke` trace held 107 files, none of them a
`sharp` or Supabase module, and included the three `vendor/audio/linux-x64`
programs and the one fixture. The disposable token was generated locally from
`/dev/urandom` and is not recorded anywhere.

This exercised a Linux amd64 container on a developer machine. It is not
evidence that any hosted serverless runtime can execute these programs; that
remains issue #37.

### Clean CI build correction — issue #69

The preceding local run did not establish that the generated manifest could
build in clean CI. As reported in [issue #69](https://github.com/C0derTang/shared-garden/issues/69),
a subsequent hosted build compiled but failed Next's TypeScript check because
the artifact omitted `typescript`, `@types/react` and `@types/node`. The
correction in [decision 0021](../decisions/0021-release-configuration.md) declares
those development dependencies at the application's exact versions: `6.0.3`,
`19.3.0` and `24.13.5`, respectively.

The correction was verified in a fresh `node:24-bookworm` Linux amd64 container
on the developer host, Node `v24.21.0`, with `CI=true` and no database, hosted
configuration or application environment values:

- The generator regression failed before the fix because the emitted
  `devDependencies` was absent, then passed afterwards. It executes the real
  generator into an empty external directory and checks the exact build
  dependency names, pinned application versions and narrow runtime dependency
  list. All 16 native-smoke tests passed on Linux, including bearer denial and
  the authorized decode. On macOS, 15 passed and decoding was skipped.
- Fresh application `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`
  and `npm run build` passed: 53 Vitest files passed, 2 skipped; 407 tests passed,
  2 skipped, plus the Daisy bank checks. The skipped local Auth and media
  suites require a disposable backend and were not enabled in this container.
- `node scripts/verify-audio-runtime.mjs` passed: no template file was traced
  into the application; the complete server/runtime upper bound was 58,937,193
  bytes across 1,228 files.
- The real generator assembled 16 files in a separate empty directory. There,
  `npm install --no-audit --no-fund` and `npm run build` both passed with
  `CI=true`. No implicit dependency installation occurred during the build;
  SHA-256 checks confirmed `package.json` and the generated `package-lock.json`
  stayed unchanged. Next made its normal suggested/required `tsconfig.json`
  adjustments, which are separate from installing missing dependencies.
- The generated route trace contained 107 files, no Supabase or `sharp` module,
  all three pinned programs and the fixed fixture; its lockfile contained no
  Supabase package. With the fixture temporarily removed, missing and wrong
  bearer requests still returned `401 {"error":"unauthorized"}`. After restoring
  it, an authorized local HTTP request returned `200` with exactly the bounded
  keys and hashes shown above: 240,000 samples, 48,000 Hz, one channel, 5,000 ms,
  Linux/x64, Node `v24.21.0`, FFprobe 9.0.1 and 202 ms elapsed. The token was
  created in memory and never printed or stored.

These are local build/runtime results for the correction, not a successful
hosted execution. Hosted execution remains issue #37. The four existing CI
workflow results for the exact PR head are recorded on the issue/PR; no workflow
is added or changed by this correction. No browser check applies to dependency
declarations, and no private content or generated deployment file was committed.

## Database

All of the following ran against the repository's own disposable local project
`shared-garden-clock` on the developer host, started with `umask 077` and with
startup output kept out of this record.

| Check | Result |
| --- | --- |
| `npm run db:reset` | PASS |
| `npm run db:test` | `Files=16, Tests=1345 … Result: PASS` |
| `docs/auth/verify-identity-auth-role.sql` as `supabase_admin` | `PASS: Auth role hook, OAuth insertion/confirmation, returning identity, spoofed claims, revocation, rollback` |
| `settings_race.py` | PASS |
| `planting_race.py` | PASS |
| `entries_race.py` | PASS |
| `rollover_race.py` | PASS |
| `peony_race.py` | PASS |
| `dandelion_race.py` | PASS — **run by no workflow**, see observations |
| `achievements_race.py` | PASS |
| `private_interaction_race.py` | PASS |
| `verify-member-settings.mjs … ci` | PASS |
| `verify-garden-realtime.mjs … ci` | PASS |
| `verify-peony-realtime.mjs … ci` | PASS |
| `verify-private-interaction.mjs … ci` | PASS, fixture tables restored to zero |

Each harness reported removing its own synthetic fixtures, and the database was
reset and re-tested afterwards.

### Private media over real HTTP

A disposable project matching the `media.yml` layout (`shared-garden-media48`,
ports 57321/57322/57320) was started outside the repository, its gateway
upstream keep-alive pinned to one request, and then:

```sh
LOCAL_MEDIA_STATUS_FILE=… npx vitest run src/lib/media/image.test.ts src/test/media-local.test.ts
# 2 files passed, 21 tests passed
python3 supabase/tests/concurrency/media_race.py supabase_db_shared-garden-media48
# PASS ×5
```

The equivalent audio suites were **not** run on the developer host: they decode
with the Linux programs and there is no local macOS build. `audio.yml` covers
them on every pull request head.

### Real local Auth

A disposable `shared-garden-auth22` project on ports 56621/56622/56620, per
[decision 0008](../decisions/0008-google-web-session.md):

```sh
LOCAL_AUTH_STATUS_FILE=… npx vitest run src/test/auth-local.test.ts
# 1 test passed
```

This suite is in no workflow, so this local run is its only evidence. It uses
synthetic Google-bound fixtures and a short-lived JWT signed with that
disposable project's own key; it is not a Google exchange.

## Audit recipe

[audit-release-schema.sql](audit-release-schema.sql) was validated on disposable
local databases only, never on anything hosted, in three states:

| State | Result |
| --- | --- |
| freshly reset, no bootstrap | 66 checks, 66 `ok`, 0 failures |
| bootstrapped, one synthetic authorized `initialize_garden()` | 66 checks, 66 `ok`, 0 failures |
| the browser session below, after a real first authorized visit | 66 checks, 66 `ok`, 0 failures |

The recipe reported its own transaction as read only, and the first-use rows in
the third state read exactly as [configuration.md](configuration.md) describes:
`garden row 1`; `planted flowers 1 total, 1 cactus, 0 bloomed, 0 grown`;
`unlocked flower types 4` being `cactus,marigold,rose,tulip`; `garden spot
cursor 2`; and `achievement progress rows 26 of 26 catalog entries, 0 awards`.

Two expectations were corrected during validation rather than asserted blindly:
`private.daisy_questions` genuinely has no row level security and is now named
as the single expected exception, and `public.hydrangea_moods` holds six
reference rows rather than being empty. Both were confirmed against the
migrations. A local session runs as the database owner while a hosted one does
not, so catalog visibility differs and this pass says nothing about a hosted
project.

## Browser flows

The real application was built and served on `http://localhost:3000` against a
separate disposable local backend, with two synthetic member sessions installed
as `sg-auth` cookies signed with that disposable project's own local key. That
is synthetic session verification, **not** a Google OAuth exchange, and no
production activity was created. Viewports: 320×800, 390×844 and 1440×900.

Observed:

- Anonymous `/garden` redirected to `/auth/error?reason=signin`; the error page
  offered Continue with Google, Sign out and Return home. Anonymous
  `/api/media/intents` answered `401 {"error":"signin_required"}`.
- The first authorized visit produced one Cactus at spot 1 and nothing else, and
  the header read `1 planted · 0 in bloom`. The audit recipe agreed.
- The first-login guide opened for each member independently, moved focus into
  the Cactus sheet's check-in button, and updated its copy after a Rose was
  planted. Closing a sheet returned focus to the button that opened it.
- Cactus check-in recorded one entry, showed a 30-minute edit window and left
  growth at 0. The partner's view showed `1 of 2 cared today` before they acted.
- Ten content types were exercised through the UI and stored: Cactus check-in,
  Rose note, Daisy daily answer, Hydrangea mood, Tulip song (title, artist,
  link, with a deferred player), Sunflower photo, Snapdragon check-in, Dandelion
  wish detail, Forget-me-not memory and Marigold compliment. Editing a Marigold
  entry changed its text while `original_posted_at` stayed unchanged.
- The Sunflower photo uploaded through the real private media routes, landed as
  one object in the private `garden-media` bucket, and rendered back at its
  original 800×600 through a short-lived signed URL, including from Memories.
- Moonflower refused to share outside its window with the status *Moonflower
  opens from 10 p.m. to 4 a.m. Pacific*, while keeping the draft.
- Locked types were disabled in the planting sheet with their unlock thresholds.
- A Peony milestone-one contribution saved and showed its own edit deadline; the
  remaining milestones stayed *After the previous step*.
- Rollover was exercised by temporarily redefining
  `private.begin_garden_operation()` on the disposable database to report one
  day later. The garden day advanced, the paired Rose gained one growth unit,
  the unpaired Cactus stayed at 0, and today's care counters reset. The original
  function definition was restored and compared byte-for-byte afterwards.
- Personal settings are per member: turning gentle motion off for one member set
  only that member's row, left the other member's preference untouched, and
  produced a server-rendered `animation: none !important; transition: none
  !important` style. Emulating `prefers-reduced-motion: reduce` left no running
  animation and kept every flower visible.
- The private event: owner controls appeared only on Settings and only for the
  owner, reading *Armed. Delivery waits for all 26 ordinary achievements.*
  Preview opened the content and consumed nothing — delivery and signal counts
  stayed 0. The partner saw nothing while the gate was closed. After the gate
  was opened on the disposable database, the partner received the pending
  moment, answered once, and the answer was stored exactly once with the owner
  signal at revision 1. Reloading did not offer it again, and the owner's
  Settings page showed *A new answer is here* and *Answered. This moment will
  not repeat.*
- Memories listed 13 cards with deferred private photo and song loading. Songs
  showed its empty state before any Tulip song and the shared collection after.
- No page scrolled horizontally at 320 px. The first Tab focused *Skip to
  content* with a visible 3 px outline. The only console errors in the whole
  session were the two deliberate unauthenticated probes above.

Afterwards the disposable database was reset and confirmed to hold zero Auth
users, members, garden rows, flowers, entries, awards, private-event
configuration and stored objects; the stack was stopped, the local `.env.local`
and status files were deleted, and no browser artifact was committed.

## Not covered here

- Anything hosted. No hosted project was created, migrated, configured or
  deployed, and no hosted environment value was set or read.
- Google sign-in. Every session above was a locally minted cookie.
- Physical phone or microphone capture, and provider playback. The Tulip link is
  a placeholder that was never played.
- Bluebell recording and audio finalization on the developer host: the recorder
  UI rendered (*Microphone is off*, Record, Share voice memo) but nothing was
  recorded or decoded, because the macOS decoder build is absent. The Linux
  audio suites in `audio.yml` are the evidence for that path.
- Dandelion fulfillment through the UI, which needs a bloomed Dandelion. It is
  covered by `dandelion_race.py` and the pgTAP suite.
- Memories paging past the first page, which needs more history than this
  session created. It is covered by the memories pgTAP tests.
- Peony milestones two through four, and a DST rollover in the browser. Both are
  covered by the pgTAP suite and `peony_race.py`/`rollover_race.py`.

## Observations

`supabase/tests/concurrency/dandelion_race.py` is a real harness that passes but
is not invoked by any workflow, unlike the other seven. It is recorded here as
an observation; changing `.github/workflows/database.yml` would change the
required-check surface and belongs to its own atomic issue, not to this one.
