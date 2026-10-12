# 0065 — Release database migrations with each main push

Status: approved by the owner's explicit 2026-10-11 request for
[issue #163](https://github.com/C0derTang/shared-garden/issues/163).
Live activation requires separate operator evidence and credentials; this record
alone does not claim activation.

## Decision

Replace decision [0063](0063-main-push-deployments.md)'s independent native Git
trigger with a single serialized GitHub Actions production release. The user
requested database migrations with every push after a missed migration broke
Memories. Existing product rules, private data, providers, plans and review gates
remain unchanged. Ordering and fail-closed checks are conservative implementation
choices under [0004](0004-finalized-launch-rules.md).

Each `main` push uses its exact SHA and waits for successful push runs of all four
existing CI workflows. It verifies the existing Vercel project and production
Supabase URL, requires hosted migration versions to be an exact prefix of the
committed files, builds with production environment values, applies forward
migrations with pinned Supabase 2.117.0 using `db push --skip-vault`, verifies the
complete inventory and anchored Memories contract, and deploys the same artifact
with pinned Vercel 59.20.0 `deploy --prebuilt --prod`. The CLI's access-token
flow creates a temporary database login; a permanent DB password is not stored.
No-op migrations still lead to a deployment. Old missing migrations, unknown
remote versions, failed builds, failed migrations and failed audits stop release.
No reset, seed, Vault synchronization, history repair or down-migration is allowed.

The [workflow](../../.github/workflows/release.yml) uses `queue: max` and never
cancels an active release. GitHub's supported queue holds up to 100 pending runs;
overflow is canceled by the provider, so this is an operational limit on the
all-push guarantee. A Git ancestry check refuses stale reruns that would replace
a newer live commit. A platform timeout or explicit operator cancellation can
still interrupt a run; inspect history before retrying an unknown outcome.

Builds precede database changes to avoid applying schema for an unbuildable app.
Database changes precede site promotion to avoid new code reaching an old schema.
These providers do not share an atomic transaction. Existing site traffic keeps
running during migration and a failed site deployment leaves the migrated schema;
reviewers must therefore require backward-compatible migrations. Use additive
changes with later cleanup rather than destructive releases. Restoring an older
site is not a database rollback.

## Privacy and activation

The release runs only on main pushes and accesses five secrets from a GitHub
`production` environment restricted to main. Dedicated provider tokens and
project IDs stay private. Captured provider/build/database output never reaches
public CI; logs contain fixed stage outcomes only and upload no artifacts.
Keep Vercel's public Git comments, deployment records and commit statuses off.

Do not merge the native-trigger disable until the credentials are configured,
privately validated and the pre-existing missing Hydrangea migration is separately
reviewed and reconciled. The ordinary runner must refuse that gap. Preserve the
later Memories and completed-Marigold repairs. Then perform exact-head independent
review and all existing CI, merge, and verify a real main-push release, deployed
SHA, hosted history/schema and unauthenticated access boundary. Missing access is
an activation blocker; a source-only pass is not completion. See the
[operator guide](../release/configuration.md).

References: [GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency),
[Supabase environments](https://supabase.com/docs/guides/deployment/managing-environments),
[Vercel prebuilt deployments](https://vercel.com/docs/cli/deploy#prebuilt).
