# Explicit application function grants

Status: conservative schema choices under
[decision 0004](0004-finalized-launch-rules.md), for
[issue #66](https://github.com/C0derTang/shared-garden/issues/66).
The [identity boundary](0006-fixed-identity-boundary.md),
[private media protocol](0025-private-media-and-photo-processing.md), and
[audio extension](0027-private-bluebell-audio.md) remain authoritative.

## Convention and existing callers

Every application function explicitly revokes all privileges from `PUBLIC`,
`anon`, `authenticated`, `service_role`, and `supabase_auth_admin` before granting
execution only to its intended caller. Internal helpers receive no application
role grant. The owner and privileged database administration retain their
existing authority.

The additive migration `20260920100000_explicit_function_grants.sql` applies
this convention to all 64 existing application routines without rewriting
already-applied migrations. Its explicit signature list avoids touching
platform or extension routines. It preserves the 29 existing `authenticated`
execution grants, the Auth role's `before_user_created(jsonb)` hook grant,
and these four intentional `service_role` media grants:

- `attest_media_upload(uuid,uuid,integer,integer,integer,text)`
- `attest_audio_upload(uuid,uuid,integer,integer,integer,text)`
- `media_cleanup_candidates()`
- `media_cleanup_done(uuid,boolean,boolean)`

The migration only revokes and re-establishes existing execution grants in one
transaction. It introduces no functions and changes no function bodies,
signatures, table grants, RLS policies, publications, schema grants, or default
privileges. Existing member authorization checks still decide who may use an
`authenticated` routine. A privileged server key is not a member session.

A schema-only comparison before and after this migration shows only removal of
`service_role` execution on `current_member_settings()` and
`save_member_setting(jsonb)`; all other existing grants remain identical.

This is consistency hardening, not a reported exploit or a claimed fixed
vulnerability. The existing server secret is confined to trusted media code;
no browser-reachable escalation is claimed. Historical revoke lists remain a
record of their original migrations, with the new migration establishing the
uniform current surface.

## Regression coverage and future migrations

`supabase/tests/database/function_grants.test.sql` compares the full application
function inventory (excluding extension-owned functions) with an explicit list.
It checks effective execution privileges for all four named roles, absence of
PUBLIC execution, absence of caller grant options, and no direct grants to
other roles. Unexpected routines,
missing intended grants, and widened caller grants fail the test. Future
application routines must follow this convention and update the inventory with
their reviewed intended caller; private helpers are recorded with no caller.

The unchanged feature database tests, Auth-role lifecycle harness, and
concurrency harnesses verify behavior across the normalized grant surface.
Browser testing is not required for this database-only change. This decision
makes no hosted migration or launch-completion claim.
