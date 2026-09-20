# Release configuration

Status: conservative implementation choices under [0004](0004-finalized-launch-rules.md),
for [issue #63](https://github.com/C0derTang/shared-garden/issues/63). Source
preparation only; the hosted launch is issue #37.

`APP_ORIGIN` is mandatory, server-only and a single canonical origin. It is
scheme and host with no credentials, no path beyond `/`, no query and no
fragment, HTTPS except for an `http` loopback while developing, as
`src/lib/auth/config.ts` already enforces. There is deliberately no wildcard
form and no inference from the request host, restating [0008](0008-google-web-session.md):
a generated preview hostname cannot sign anyone in, because sign-in works only
on the one origin whose exact redirect URI is registered. `.env.example` now
carries it with an empty value, and its comment states the rule. The public pair
is required rather than optional and is inlined at build time, so a changed
value needs a rebuild. `SUPABASE_SECRET_KEY` is required for private media, is
server-only, never carries a `NEXT_PUBLIC_` prefix, and is scoped to Production
alone so that a preview build can sign nothing; its old comment claiming the
foundation never needs it was simply false and is corrected. No real origin,
account address or project identifier appears anywhere; the documents use
`https://app.example.test` and `<OWNER_GOOGLE_EMAIL>`. None of this asserts that
any hosted environment currently holds these values.

The README described a foundation that no longer exists, so it is rewritten
against what the source does. Auth, Storage and Realtime are enabled in
`supabase/config.toml`, while Studio, email testing, analytics, the pooler and
Edge Functions stay disabled; the local project id and ports are development
settings rather than architecture. The local TOML also points the Auth
Before User Created hook at `public.before_user_created`, and the README and the
release guide both state that configuring it locally does not enable it in a
hosted project. The README now names four workflows, the five guarded routes,
the four environment values, the server-only modules and the native
dependencies, and it recommends no local configuration push, no hosted reset, no
fixture bootstrap and no repository-to-host deployment integration. It describes
the repository, not any deployment that exists.

The native runtime is unchanged. FFmpeg 9.0.1 Linux amd64 programs keep their
pinned hashes, executable bits, license and build recipe, and `next.config.ts`
still traces exactly those three files into `/api/media/finalize`, whose
`maxDuration` stays 90 while cleanup stays 30, within the audited ceiling. The
only addition to `scripts/verify-audio-runtime.mjs` is an assertion that no
traced path resolves under `tools/`, which fails the existing `audio-integration`
job rather than any new one; no workflow file is touched and the required-check
surface stays at exactly four. That assertion runs after a build, so its failure
would mean a build began including the template, not that the template changed.

The smoke template lives in `tools/native-smoke` precisely because that is not
`src/app`: it is not a route, nothing under `src/` imports it except its test,
and `generate.mjs` assembles the deployable project outside this repository.
Authorization is a bearer token from the environment, refused below a 32
character floor with `503` before anything is read or spawned, and compared in
constant time over equal-length buffers so a wrong token of the right length is
`401` before the fixture is opened. There is no body, query, path segment or
upload; the fixture is a module constant verified against a pinned SHA-256, and
the response carries only hashes, sample count, duration, channels, sample rate,
Node version, platform, architecture, one truncated decoder version line and
elapsed milliseconds. The fixture is copied at generation time rather than
committed a second time, so the repository keeps one 62,580-byte sample and the
template keeps only its hash. Generation refuses to write inside this repository
or a git checkout and fails if any text file in the result mentions `SUPABASE`,
`NEXT_PUBLIC_` or a key prefix. The token is generated locally, documented in
`tools/native-smoke/README.md` rather than `.env.example`, and never committed.
This proves nothing about hosted execution, which remains issue #37.

`MediaError` moves from `src/lib/media/image.ts` into a new
`src/lib/media/error.ts`, and `image.ts` re-exports it so every existing importer
is unchanged. This touches a merged, security-reviewed module and is called out
deliberately: without it `audio.ts` reaches the error type through the photo
module and drags `sharp` into any graph that decodes audio, which would put an
image library into an artifact that has no business holding one. The extracted
class is byte-for-byte the same and carries no configuration or dependency; the
built smoke artifact traces 107 files with no `sharp` and no Supabase module.
The alternative, copying `image.ts` and adding `sharp` to the artifact, remains
available if a reviewer prefers not to touch the merged module. This refactor
changes no error code, status or behavior.

The audit recipe opens `begin transaction read only`, rolls back, and reads only
`pg_catalog`, `information_schema`, `pg_policies`, `pg_publication_tables`,
`storage.buckets` metadata and `count(*)` aggregates. It calls no application
function, sets no role, forges no claim and returns no email, identifier or
content. Each check reports observed, expected and a boolean, so a fresh database
and a database after one authorized visit both read correctly rather than one of
them failing. `private.daisy_questions` is named as the single private table
without row level security, since its real boundary is the revoked grants and
absent schema usage that checks three and four assert, and naming it stops a new
unprotected table from hiding inside a count. A clearly separated section lists
what SQL cannot prove: provider and scopes, the redirect allowlist, hook
activation, Site URL, environment scoping and hosted native execution. A local
pass is stated to be a local pass, because a local session runs as the database
owner while a hosted one does not.

First-use documentation preserves lazy member-only initialization. Before a real
first login the garden row may be absent, and that is the correct state. One
ordinary authorized access creates exactly one garden row with `next_spot` 2,
one unbloomed permanent Cactus at spot 1, the four zero-threshold unlocks and one
progress counter per achievement, with zero earned awards, zero entries, zero
care and no private-event delivery. No operator initializer, synthetic identity
or seed row may manufacture any of those counts. Issue #37 may report unavailable
live SSO precisely while completing the checks that do not need it.

No deployment integration is added. There is no `vercel.json`, no `.vercel`
link, no repository-to-host automatic deployment, no hosted reset and no fixture
bootstrap, and the documents recommend none. Project creation, environment
scoping, migration and deployment are operator actions under #37.

Honest limits: the record in [verification.md](../release/verification.md) is
local and synthetic. Linux amd64 evidence came from a container on an Apple
Silicon host, browser evidence used locally minted session cookies against a
disposable backend rather than a Google exchange, and audio decoding was not
exercised on the developer machine at all. Nothing here is hosted, Google,
physical-device or provider-playback evidence.

## Native smoke build dependency correction

[Issue #69](https://github.com/C0derTang/shared-garden/issues/69) corrects an
omission exposed by a clean hosted build: the generated TypeScript project
declared only runtime dependencies, so Next's TypeScript check failed in CI
when `typescript`, `@types/react` and `@types/node` were missing. Under 0004's
conservative implementation discretion, the generator now copies only these
three pinned development dependencies from the application manifest. They are
build requirements; the decoder, authorization, fixed fixture and response are
unchanged. No product module, hosted setting or deployment link changes.
The generated manifest regression and a clean Linux build validate this fix;
hosted execution remains the separate issue #37 gate. See
[verification.md](../release/verification.md) for exact evidence and limits.
