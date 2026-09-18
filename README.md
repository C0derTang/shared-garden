# Shared Garden

A shared garden for two people, grown through small daily acts of care.

## Local website development

Use Node.js 24 and npm (the only package manager for this repository).

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open [the local website](http://localhost:3000). The public landing runs with
empty environment settings and explicitly reports that garden setup is incomplete.
It contains a decorative garden illustration and an informational bottom sheet;
it does not sign anyone in or display a private garden. Public settings alone
never grant access. Google sign-in and authenticated routes are subsequent work.

The optional public configuration is `NEXT_PUBLIC_SUPABASE_URL` (an HTTPS service
origin, or HTTP loopback for local development) and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (a modern `sb_publishable_` key). The module
rejects malformed endpoints and secret/legacy keys. Public values are fixed at
build time by Next.js, so rebuild after changing them. The example contains empty
placeholders only. Keep `.env.local` and all `.env*.local` files untracked.

`SUPABASE_SECRET_KEY` is optional and server-only; this foundation never needs it.
The separate `src/lib/config/server.ts` module is guarded with `server-only` and
must never be imported by client components or serialized to a browser. Never
put a privileged key, allowlisted account identity, or private content in a
`NEXT_PUBLIC_` variable. Configuration validation does not replace authorization.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run start
```

`typecheck` generates Next.js route types before running TypeScript. Focused
Vitest/Testing Library tests cover configuration failure states, public access
boundaries, navigation semantics, and dialog keyboard/focus behavior. The Web
workflow runs these checks and a production build under Node.js 24, alongside
the separate database workflow. Browser smoke checks use CUA. There is no hosted
deployment in this foundation.

Reusable primitives live under `src/components/ui`, navigation and its
presentational layout under `src/components/layout`, and configuration under
`src/lib/config`. The import alias `@/*` maps to `src/*`. `PublicLanding` accepts
only a configuration status. `GardenLayout` and `GardenNavigation` are prepared
for future authenticated routes and are not mounted by the public landing;
their caller must verify private access. The stylesheet includes phone bottom
sheets, centered desktop dialogs, visible keyboard focus and reduced motion.
See [decision 0005](docs/decisions/0005-web-foundation.md) for implementation choices.

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
hosted secret. Hosted CLI access status is recorded separately in
[decision 0003](docs/decisions/0003-supabase-and-access.md). Avoid publishing local
startup/status output, which includes generated development keys. Startup failures
can be inspected in the ignored local log.

The local project ID is `shared-garden-clock`. Ports are 56321 (local Data API),
56322 (PostgreSQL), and 56320 (reserved for the shadow database). The database,
PostgREST, and gateway are the only running services; Auth, Storage, Realtime,
Studio, email testing, analytics, and Edge Functions are disabled for this
foundation. These are local development settings, not a production architecture.
For another concurrent checkout, give it a distinct project ID and unused ports
in its local config before starting it. Stop each stack from its own checkout.

`npm run db:test` runs real pgTAP database tests. They cover rollover and Moonflower
boundaries, 23/25-hour DST garden days, winter/month/year boundaries, null input,
session timezone independence, and denied access for public app roles. Each test
file uses a transaction and rollback with synthetic data. GitHub Actions runs the
same migration and test commands for pull requests and pushes to `main`, without
hosted secrets.

## Internal garden clock

The migration defines `private.garden_clock_at(p_instant timestamptz)`:

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
execution privileges. `private` is not exposed by the Data API. A later approved
feature will define an authenticated API boundary.

This foundation implements the public website and internal database clock. It
does not implement a hosted deployment, accounts/access flow, user-data models,
growth processing, or reminders. Product scope and approved
rules are recorded in the
[finalized launch rules](docs/decisions/0004-finalized-launch-rules.md) and their
linked decision history. Contributors must follow [AGENTS.md](AGENTS.md).
