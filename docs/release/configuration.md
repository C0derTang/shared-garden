# Release configuration

Deployment and setup for the finished application. Every value in this file is a
placeholder. Never put a real origin, account address, project identifier,
credential or private content in this repository, in a pull request, in a
comment or in captured output.

Initial hosted setup is tracked in
[issue #37](https://github.com/C0derTang/shared-garden/issues/37) and explained in
[decision 0021](../decisions/0021-release-configuration.md). Automatic deployments
from `main` to the existing project are now authorized by
[decision 0065](../decisions/0065-ordered-database-releases.md) and tracked in
[issue #163](https://github.com/C0derTang/shared-garden/issues/163). Source
configuration alone does not establish that the live integration is active;
complete the activation gate below and record the actual result in that issue.

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
  `db:reset` or any seed or fixture command against one. `db:reset`
  discards data. Only the reviewed release pipeline below may apply ordinary
  forward migrations with `supabase db push --skip-vault`.
- Do not commit a `.vercel` project link or any hosted identifier. The sanitized
  `vercel.json` configures automatic deployment; the private project connection
  and environment values stay in the provider dashboard. Do not create a second
  project. Keep release credentials only in the protected GitHub `production`
  environment described below.
- Do not create production activity to make the app look used, and do not seed
  demo content.
- Do not enable extra services, paid tiers or additional accounts. Anything
  implying a paid upgrade is an escalation, not a configuration choice.

## Automatic deployments from main

[Production release](../../.github/workflows/release.yml) handles every `main`
push at its exact commit. It waits for that commit's successful Web, Database,
Private media and Private audio push checks, verifies the production project
and database target, builds a production artifact, applies pending forward
migrations through Supabase's standard runner, checks the resulting inventory
and Memories API contract, then deploys that same prebuilt artifact. No pending
migrations is a successful case and still deploys. Required PR checks and fresh
independent review remain merge gates under [AGENTS.md](../../AGENTS.md).

`queue: max` serializes releases without canceling an active migration and
retains up to 100 pending runs; [GitHub cancels overflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
A stale rerun cannot replace a newer production commit. Do not cancel an active
migration manually. The job's 60-minute platform timeout still applies; if a run
is interrupted, inspect history privately before retrying. A failure retains the
previous site, but completed migrations are not automatically rolled back.
Migrations must remain compatible with the currently served application and
available rollback versions. Use additive changes and separate later removal.

[`vercel.json`](../../vercel.json) disables native Git deployments on all
branches to prevent a second release bypassing these gates. CLI production
releases remain enabled. Only merge this configuration after credential and
existing-history activation checks below are ready. Production environment
values remain in Vercel; no previews or new hosting project are introduced.

### Database readiness and Memories filter repair

A matching production commit and a `READY` web deployment prove source delivery.
They do not prove the hosted database has the RPC signature that source calls.
Before deploying source that changes an RPC, compare the hosted migration
inventory and function contract with its reviewed migration and apply the
required database change before or with the application release. The Database
CI workflow verifies a disposable database, not the hosted one.

[Issue #161](https://github.com/C0derTang/shared-garden/issues/161) records the
Memories failure: the application sends `p_author` even for **Both of us**, while
the older seven-argument `memories_page` cannot resolve that named argument.
The repair uses the existing reviewed
[`20261001000000_memories_person_filter.sql`](../../supabase/migrations/20261001000000_memories_person_filter.sql)
from [decision 0060](../decisions/0060-memories-person-filter.md). No application
fallback, history reset or change to the filter rules is needed.

For this specific missing-migration state, the authorized operator must:

1. Inspect only migration history and function metadata first. Confirm the
   person-filter migration is absent, the seven-argument function exists and
   the eight-argument function is absent. If that state differs, investigate
   before applying anything; the migration is not an idempotent repair script.
2. Review the exact immutable migration bytes and a guarded transaction wrapper
   independently. Apply only that migration, even if later versions are already
   recorded. Review those later migrations for compatibility first. Do not use
   a bulk migration command, apply other missing migrations or rewrite history
   to make the versions appear sequential.
3. In one transaction, use bounded lock/statement timeouts, serialize the repair,
   recheck the expected catalog/history state, execute the unchanged migration,
   verify the resulting signature and grants, and insert only its actual
   migration record using the migration-history table's current shape. Any
   failed precondition or postcondition must roll back the entire transaction.
4. After commit, run section **5b** of
   [the read-only release audit](audit-release-schema.sql) and check every row.
   It requires the current named arguments/defaults, stable security-invoker
   contract, authenticated-only application execution and no obsolete overload.
   Confirm the migration record exists, other migration records are unchanged,
   and the API schema cache resolves the new signature. Refresh that cache
   through the authorized operator procedure if necessary.
5. Privately verify person selection combined with the other filters and page
   modes using a real existing signed-in session when available. Never forge a
   member identity or create activity to test production. Without that session,
   report the limitation: catalog/grant checks and unauthenticated API signature
   resolution establish deployment readiness; disposable database regressions
   establish member filtering behavior. Publish only sanitized outcomes.

The audit reports boolean results; a successful SQL exit alone is not a pass.
On an established garden, its explicitly labeled first-use checks may correctly
show activity. Assess those separately from the structural Memories checks.

### Private operator settings and activation gate

Before merging the activation PR, verify all of the following privately:

1. Keep the existing project, domain, environment values, Node.js 24 runtime,
   framework settings, `main` production branch and two-member access boundary.
   Keep Vercel Git comments, deployment records/events and commit statuses
   (including consolidated statuses) disabled so no hosting metadata appears
   on GitHub. The CLI does not print provider output or publish deployment URLs.
2. Create a GitHub environment named `production` restricted to the exact
   `main` branch. Store five environment secrets there: `SUPABASE_ACCESS_TOKEN`,
   `SUPABASE_PROJECT_ID`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
   Use dedicated appropriately scoped provider tokens, not expiring local OAuth
   sessions. No production credentials belong in PR jobs or repository files.
   The pinned Supabase CLI obtains its temporary database login using its access
   token; no persistent database password is required for this configuration.
   Verify token access privately before changing the working native trigger.
3. Compare committed and hosted migration history. Reconcile pre-existing gaps
   only through an independently reviewed, explicitly authorized operation
   against immutable migration bytes. In particular, activation of issue #163
   requires reconciling the already committed Hydrangea migration
   `20261005000000`, while preserving the later Memories and Marigold fixes.
   The normal runner requires hosted versions to be an exact prefix of committed
   versions. It refuses remote-only versions and older gaps; it never passes
   `--include-all`, syncs Vault, seeds, resets or repairs migration history.
4. Independently review the exact source candidate and require all four CI checks.
   Merge only when credentials and database reconciliation are ready. Observe
   the real main-push release succeed, verify the deployed commit is that merge,
   verify migration history and schema metadata, and check the unauthenticated
   landing/auth/private-media boundaries without impersonating a member.
5. Record sanitized results in [issue #163](https://github.com/C0derTang/shared-garden/issues/163).
   Keep hosted identifiers, account details, provider logs, deployment URLs,
   build artifacts and environment files out of public output/artifacts. Source
   tests and a reviewed PR are not evidence that live activation happened.
   Missing credentials or provider access block activation, not a reason to
   weaken privacy or introduce an unapproved cost.

The release prints only fixed stage outcomes. Underlying errors are deliberately
suppressed, including command arguments, environment values and provider response
bodies. The ephemeral runner deletes pulled environment/build files on completion
and uploads no artifacts. Diagnose failures through private provider tools; do
not enable shell tracing or publish a failed command's captured output. Rotate
and update tokens in the protected environment when they expire.

### Failed builds and rollback

A failed build does not replace the last successful production deployment.
Inspect its private provider logs, correct the source through the normal issue,
review and merge process, and verify the resulting `main` deployment. A failed
CI check or build stops the release before database changes. A migration or
post-migration audit failure prevents deployment. Inspect any already committed
migrations and correct forward through review; never reset production or blindly
retry an unknown state. A deploy failure may leave the new compatible schema
with the previous site. The pipeline performs no automatic database rollback.

If a successful deployment regresses, use the provider's rollback control to
restore a previously verified production deployment available under the existing
plan, then verify the public response and affected behavior privately. Follow
[the rollback guide](https://vercel.com/docs/deployments/rollback-production-deployment)
and check whether automatic production assignment must be resumed after rollback.
Revert or fix the source through a reviewed PR so a later push does not restore
the regression. Rollback changes the served application, not the database or
secrets; migrations must remain compatible with the restored version. Record
sanitized commit/outcome evidence without exposing deployment links.

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
