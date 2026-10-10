# 0063 — Deploy every push to main

Status: approved by the owner's explicit 2026-10-10 request, for
[issue #157](https://github.com/C0derTang/shared-garden/issues/157). Live activation
requires the separate operator evidence described below.

## Decision

Connect the existing production Vercel project to this GitHub repository through
native Git integration. Every push or merge to `main` starts a production build;
successful builds deploy to the existing site. This authorization supersedes only
the earlier prohibition on deployment integration in
[0021](0021-release-configuration.md) and the release guide. The two-person scope,
privacy rules, environment scoping, existing hosting project and no-unapproved-cost
boundary remain unchanged.

The conservative source configuration uses `git.deploymentEnabled` with `**`
false and `main` true. The glob covers slash-containing branch names; the exact
allow rule wins when both rules match. `github.autoJobCancelation` is false so
newer commits do not automatically cancel earlier queued pushes. The spelling
matches the [official schema](https://openapi.vercel.sh/vercel.json) and
[Git configuration documentation](https://vercel.com/docs/project-configuration/git-configuration).
`ignoreCommand: "exit 1"` makes eligible builds proceed instead of skipping
documentation-only changes through an ignored-build command; the operator also
checks for separate unaffected-project skipping. No additional GitHub Actions
deployment workflow or deployment token is needed.

The four existing CI workflows remain unchanged. Their passing PR checks and
independent review remain merge requirements under [AGENTS.md](../../AGENTS.md).
Native deployment does not wait for the GitHub Actions runs started by a push,
and those runs do not automatically roll back production. Failed builds retain
the previous production deployment. A regression after a successful build calls
for an operator rollback and a reviewed source correction. Database migrations
remain separate operator actions.

## Privacy and activation

Private provider settings must suppress public comments, deployment records and
commit statuses exposing hosting metadata before connection. Preserve the
canonical origin and Production-only secret scope. Disable build skip settings
that could omit `main` pushes. Connect only the existing project, keep other
branches from deploying, and keep all hosted identifiers and credentials out of
source and public evidence. Older branches must receive the configuration before
another push because they lack its branch filter.

The [release guide](../release/configuration.md) defines the private settings,
rollback and activation checks. Source validation and PR review are not live
activation evidence: the operator must observe the reviewed merge's Git-triggered
Production deployment reach `READY` at the matching commit and verify the public
unauthenticated response and GitHub metadata privacy. Record sanitized outcomes
in issue #157. Missing permissions or unavailable privacy controls block
activation and require escalation rather than a privacy exception.
