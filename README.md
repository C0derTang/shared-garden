# cc’s garden

A shared garden for two people, grown through small daily acts of care.

Two fixed Google accounts may enter, and nobody else. Everything a member
writes — notes, answers, moods, photos, voice memos, songs, wishes and shared
milestones — is private to those two people. This repository is public; the
garden's contents are not. Never commit a credential, an account address, a
hosted project identifier, a real domain or any private content. Examples here
contain placeholders such as `https://app.example.test` only.

Approved product rules live in the
[finalized launch rules](docs/decisions/0004-finalized-launch-rules.md) and the
[decision history](docs/decisions/). Contributors must follow [AGENTS.md](AGENTS.md).

## Local website development

Use Node.js 24 and npm (the only package manager for this repository).

```sh
npm ci
cp .env.example .env.local   # then fill it in; empty values keep the app closed
npm run dev
```

Open [the local website](http://localhost:3000). With empty settings the public
landing explains that garden setup is incomplete and signs nobody in. With the
values below it signs in the two allowed accounts and serves the private garden.

### Environment values

| Name | Where it is read | Required for |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser and server | any sign-in or data access |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser and server | any sign-in or data access |
| `APP_ORIGIN` | server only | sign-in and every authenticated route |
| `SUPABASE_SECRET_KEY` | server only | private photo and voice processing |

Both `NEXT_PUBLIC_` values are required, not optional. They are inlined by
Next.js at build time, so rebuild after changing them. The service URL must be an
HTTPS origin, or an HTTP loopback for local development, and the key must be a
modern `sb_publishable_` key; the module rejects malformed endpoints and
secret or legacy keys.

`APP_ORIGIN` is the one canonical origin this deployment answers on, scheme and
host only. It must be HTTPS except for an `http` loopback while developing, and
it is rejected if it carries credentials, a path other than `/`, a query or a
fragment. There is no wildcard and no per-deployment host inference, so a
preview deployment on a generated hostname cannot sign anyone in. Without a
valid value `getAuthConfig` returns null and every guarded route stays closed.

`SUPABASE_SECRET_KEY` is required for private media: server-side validation,
attestation, short-lived signed reads and cleanup all need it. It is server-only
and must never carry a `NEXT_PUBLIC_` prefix, be imported by a client component
or be serialized to a browser. In a hosted project, scope it to Production only;
Preview and Development deployments must not hold it.

`src/lib/config/server.ts`, `src/lib/auth/config.ts`, `src/lib/media/audio.ts`
and `src/lib/media/image.ts` are all guarded with `server-only`. Never put a
privileged key, an allowlisted account identity or private content in a
`NEXT_PUBLIC_` variable. Configuration validation does not replace authorization.
Keep `.env.local` and every `.env*.local` file untracked.

### Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run start
```

`typecheck` generates Next.js route types before running TypeScript. `npm test`
runs the Vitest suite and the Daisy content validator. Four GitHub Actions
workflows run on every pull request and on pushes to `main`, without hosted
secrets: **Web** (lint, types, tests, production build), **Database** (pgTAP,
the platform Auth-role harness, the concurrency harnesses and the real Realtime
verifiers), **Private media** (real HTTP photo storage and the media race) and
**Private audio** (real HTTP voice storage, the assembled Linux runtime audit and
the audio media race). Browser flows are checked by hand with CUA against a
disposable local backend. Hosted deployment is deliberately not part of this
repository; it is tracked in
[issue #37](https://github.com/C0derTang/shared-garden/issues/37), and
[docs/release/configuration.md](docs/release/configuration.md) describes what it
needs.

### Structure

Reusable primitives live under `src/components/ui`, the authenticated shell and
navigation under `src/components/layout`, feature panels under
`src/components/*`, and configuration under `src/lib/config`. The import alias
`@/*` maps to `src/*`. `PublicLanding` accepts only a configuration status.
`GardenLayout` and `GardenNavigation` wrap the four member routes — garden,
memories, achievements and settings — plus the shared song collection, and a
proxy verifies membership before any of them render. The stylesheet includes
phone bottom sheets, centered desktop dialogs, visible keyboard focus and
reduced motion, and a member may additionally turn gentle motion off for
themselves. Decisions [0005](docs/decisions/0005-web-foundation.md) through
[0027](docs/decisions/0027-private-bluebell-audio.md) record the implementation
choices feature by feature; [0021](docs/decisions/0021-release-configuration.md)
covers release configuration.

## Native dependencies

Private photos are processed with `sharp`. Private voice memos are decoded by
FFmpeg 9.0.1 programs built from pinned official source and committed for Linux
amd64 under [`vendor/audio`](vendor/audio/README.md) with their license, source
archive, verification material and build recipe. They must keep their executable
permission, and `next.config.ts` traces exactly those three files into the
`/api/media/finalize` function. `scripts/verify-audio-runtime.mjs` checks that
trace, the executable bits, the decoder version and the complete server size
bound; it runs on Linux amd64 only. A macOS developer who needs local audio
decoding builds the identical source into `vendor/audio/darwin-<arch>`, which is
ignored by git; without it the audio decoding tests fail locally and the CI job
is the authority.

[`tools/native-smoke`](tools/native-smoke/README.md) holds an inspectable
template for a separate, bearer-protected probe that decodes one fixed synthetic
fixture. It is not a route of this application and no module under `src/` imports
it.

## Local database development

Prerequisites: Node.js 24, npm, and a running Docker-compatible container engine.
The first start downloads the Supabase container images. The Supabase CLI is
pinned in `package.json` and `package-lock.json`; no global CLI is needed.

From this repository:

```sh
npm ci
# Keep generated local development keys out of terminal/CI logs.
mkdir -p supabase/.temp
umask 077
npm run db:start > supabase/.temp/start.log 2>&1
npm run db:reset
npm run db:test
npm run db:stop
```

`db:reset` explicitly targets **only the local database** and discards its local
data before applying migrations. `db:stop` stops this project's containers and
preserves local database data. Do not connect these commands to a hosted project.
These local development commands require no hosted project link, account, or
hosted secret. Avoid publishing local startup/status output, which includes
generated development keys. Startup failures can be inspected in the ignored
local log.

The local project ID is `shared-garden-clock`. Ports are 56321 (local Data API),
56322 (PostgreSQL), and 56320 (reserved for the shadow database). The database,
PostgREST, the gateway, Auth, Storage and Realtime run; Studio, email testing,
analytics, the connection pooler and Edge Functions are disabled. `supabase/config.toml`
also points the Auth **Before User Created** hook at `public.before_user_created`
for local runs; configuring that TOML does **not** enable the hook in a hosted
project, which must be done separately. These are local development settings, not
a production architecture. For another concurrent checkout, give it a distinct
project ID and unused ports in its local config before starting it, and stop each
stack from its own checkout.

`npm run db:test` runs real pgTAP tests covering the garden clock and rollover,
identity and access boundaries, planting and capacity, entries and the edit
window, media registration, Peony milestones, Dandelion fulfillment,
achievements, memories paging, member settings and the private interaction. Each
file uses a transaction and rollback with synthetic data. Alongside them,
`docs/auth/verify-identity-auth-role.sql` exercises the platform Auth role,
`supabase/tests/concurrency/*.py` drive real overlapping SQL sessions, and
`scripts/verify-*.mjs` prove authorized Realtime delivery over actual local
HTTP and websockets. Each of those refuses anything but its dedicated disposable
local project.

## Internal garden clock

The first migration defines `private.garden_clock_at(p_instant timestamptz)`:

| Column | Meaning |
| --- | --- |
| `garden_day date` | Local date on which the current garden day started |
| `day_starts_at timestamptz` | That garden day's 4 a.m. Pacific boundary |
| `next_rollover_at timestamptz` | Next local calendar day's 4 a.m. boundary |
| `moonflower_open boolean` | True from 10 p.m. through just before 4 a.m. |

For a non-null finite instant it returns one row. Null returns no row. Both
boundaries use `America/Los_Angeles`, including daylight-saving changes, regardless
of the database session timezone. Callers must supply their authoritative instant;
the function does not read the browser or database clock.

This is an internal, security-invoker function with a controlled search path.
`PUBLIC`, `anon`, and `authenticated` have neither private-schema usage nor clock
execution privileges, and `private` is not exposed by the Data API. Members reach
the garden only through the explicitly granted `public` functions described in
[the identity contract](docs/auth/identity-setup.md) and the guides under
[docs/database](docs/database/).

## Release

[docs/release/configuration.md](docs/release/configuration.md) describes hosted
setup, including the first-authorized-visit rule.
[docs/release/audit-release-schema.sql](docs/release/audit-release-schema.sql) is
a read-only post-migration audit, and
[docs/release/verification.md](docs/release/verification.md) records what was
actually verified, where, and what was not.
