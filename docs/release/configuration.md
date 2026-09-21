# Release configuration

Deployment and setup for the finished application. Every value in this file is a
placeholder. Never put a real origin, account address, project identifier,
credential or private content in this repository, in a pull request, in a
comment or in captured output.

This document prepares the launch. Performing it — creating the hosted project,
applying migrations, configuring the provider, setting environment values and
deploying — is tracked separately in
[issue #37](https://github.com/C0derTang/shared-garden/issues/37). The choices
recorded here are explained in
[decision 0021](../decisions/0021-release-configuration.md).

## What is private

Exactly two Google accounts may enter. Membership lives in
`private.garden_members`, which starts empty and denies everyone until a
privileged bootstrap admits both addresses; see
[the identity contract](../auth/identity-setup.md). Everything a member writes is
private to the two of them. The repository is public and must stay free of
credentials, account details, hosted identifiers, real domains and garden
content. Publish sanitized requirements and approved decisions only.

## Environment values

| Name | Scope | Exposure |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | all environments that should run | inlined into the browser bundle |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | all environments that should run | inlined into the browser bundle |
| `APP_ORIGIN` | per environment, one value each | server only |
| `SUPABASE_SECRET_KEY` | **Production only** | server only |
| `SPOTIFY_CLIENT_ID` | optional catalog search; authorized runtime only | server only |
| `SPOTIFY_CLIENT_SECRET` | optional catalog search; authorized runtime only | server only |

`.env.example` carries these names with empty values. Copy it, never
commit a filled copy, and keep every `.env*.local` file untracked.

### The canonical origin

`APP_ORIGIN` is a single canonical origin: scheme and host, nothing else.
`src/lib/auth/config.ts` parses it and refuses anything that is not HTTPS
(an `http` loopback such as `http://localhost:3000` is allowed for local
development), or that carries a username, a password, a path other than `/`, a
query string or a fragment. A rejected value makes `getAuthConfig` return null,
and the proxy then closes every guarded route and answers the private media API
with `503`.

There is no wildcard form and no inference from the incoming request host. A
per-deployment preview hostname therefore cannot sign anyone in, which is the
intent: sign-in works on the one origin whose exact redirect URI is registered
with the provider. Use a stable custom domain as the production value, for
example `https://app.example.test`.

Because the two `NEXT_PUBLIC_` values are inlined at build time, changing either
one requires a rebuild, not just a restart.

### The secret key

`SUPABASE_SECRET_KEY` must be a modern `sb_secret_` key. Private media uses it
only after its own authorization checks, for server-side validation, immutable
attestation, short-lived signed reads and bounded cleanup. Scope it to
Production alone. Preview and Development deployments must not hold it: without
it the private media routes answer `503` and no private object can be signed or
written from a preview build. Rotate it through the provider, never by editing
source.

## Hosted setup order

1. Create the hosted project and apply the reviewed migrations through the
   authorized deployment procedure. The migrations create no member, no garden,
   no entry and no award.
2. Configure Google as the only enabled Auth provider with the minimum scopes.
   Disable email/password, phone and anonymous sign-in, keep manual identity
   linking disabled, and do not enable unverified email sign-ins or
   email-verification bypasses. Set the Site URL and the exact redirect
   allowlist to the canonical origin's callback.
3. Enable the Postgres **Before User Created** hook `public.before_user_created`
   (`pg-functions://postgres/public/before_user_created`). The local
   `supabase/config.toml` entry does not enable it in a hosted project. Hook
   activation must be verified before launch.
4. Bootstrap both member addresses in one privileged database session, as
   [the identity contract](../auth/identity-setup.md) describes. This is
   deliberately not a public RPC, a service-key API or a seed migration.
5. Configure the environment values above with the correct per-environment
   scope, then deploy and confirm the build picked up the public pair.
6. Run [the audit recipe](audit-release-schema.sql) against the migrated
   database from a privileged read-only session and read every row.
7. Sign in privately as each allowed account, confirm an unrelated account is
   rejected, and record only sanitized outcomes.

Do not globally disable new user creation before both intended accounts have
signed in at least once: the Google flow still needs to create their Auth users.

## What must not be done

- Do not push a local configuration file to a hosted project, and do not run
  `db:reset`, `db:push` or any seed or fixture command against one. `db:reset`
  discards data; the local commands in this repository are for disposable local
  projects only.
- Do not add `vercel.json`, a `.vercel` link or a repository-to-host deployment
  integration. Deployment is an operator action under #37, not a property of the
  source tree.
- Do not create production activity to make the app look used, and do not seed
  demo content.
- Do not enable extra services, paid tiers or additional accounts. Anything
  implying a paid upgrade is an escalation, not a configuration choice.

## First authorized visit

Initialization is lazy and member-only. Before a real first login the physical
garden may simply be absent: `public.garden` has no row, `public.flowers` is
empty and `public.flower_unlocks` is empty. That is the correct state, not a
failed migration.

The first ordinary authorized access by either member — loading the garden, or
any operation that opens the garden — runs `private.ensure_garden()` under the
garden lock and creates exactly:

- one `public.garden` row, with `next_spot` set to 2;
- one permanent **Cactus** at spot 1, `is_initial` true, `growth_units` 0 and
  `first_bloom_at` null;
- four initial `flower_unlocks`: Cactus, Marigold, Rose and Tulip, the catalog
  entries whose `unlock_after_blooms` is 0;
- one `achievement_progress` counter per catalog entry, which is scaffolding and
  not credit.

It creates **zero** earned awards, zero entries, zero care and no private-event
delivery. The private event stays undelivered until its own conditions are met.

Never add an operator initializer, a synthetic identity, a seed row or a manual
insert to manufacture any of these counts. If the garden looks empty before the
first sign-in, that is the rule working. Issue #37 may report that live SSO is
unavailable — precisely, and without inventing a result — while completing the
checks that do not depend on it.

## Verifying the result

[audit-release-schema.sql](audit-release-schema.sql) reports grants, row level
security, policies, private Storage buckets, Realtime publication membership,
membership slots, private-event configuration and the first-use expectations
above, as `observed` / `expected` / `ok` rows. It opens an explicit read-only
transaction, reads catalog metadata and aggregate counts only, and returns no
personal value. It also lists what SQL cannot prove — provider configuration,
scopes, redirect allowlist, hook activation, Site URL and environment scoping —
each of which needs its own operator observation.

[verification.md](verification.md) records what was actually run before this
configuration was proposed, on which platform, and what was not covered.


## Optional Spotify catalog search

[Decision 0034](../decisions/0034-tulip-spotify-catalog-search.md) adds catalog-only
track search in Tulip. Create a Spotify developer application through the
provider's current setup flow and verify the owner meets its current Premium
and development-mode requirements. Store `SPOTIFY_CLIENT_ID` and
`SPOTIFY_CLIENT_SECRET` in the authorized deployment's secret manager, with no
`NEXT_PUBLIC_` prefix. Use empty placeholders in source; never paste values into
issues, PRs, browser code, logs or screenshots. Do not copy live credentials into
previews or local synthetic fixtures.

This flow uses server-side Client Credentials and no Spotify user OAuth,
redirect callback, scope, personal library or refresh token. A dashboard-required
callback field is unused by this feature. Search requests use the US market,
ten tracks per page and at most five pages. Tokens are cached only in server
memory; changing credentials requires a runtime restart/redeployment to clear
that cache. Follow the provider's rotation flow if credentials are compromised.

Without both values, members see a setup-unavailable search message and can
still enter a song manually. Verify unauthenticated catalog requests fail,
then test an authorized live search and selection without sharing real care.
Confirm a selected song's explicit Load player and Spotify Play controls produce
actual in-browser playback/progress (preview is acceptable). Record actual API
and playback observations separately from automated/synthetic tests. Never
claim iframe rendering alone proves playback, or promise full-song access.
