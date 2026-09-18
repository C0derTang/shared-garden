# Shared Garden

A shared garden for two people, grown through small daily acts of care.

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

This foundation implements no frontend, hosted deployment, accounts/access flow,
user-data models, growth processing, or reminders. Product scope and approved
rules are recorded in the
[finalized launch rules](docs/decisions/0004-finalized-launch-rules.md) and their
linked decision history. Contributors must follow [AGENTS.md](AGENTS.md).
