# Fixed two-person identity boundary

Status: implementation choices under the conservative discretion in
[decision 0004](0004-finalized-launch-rules.md).
Source: [Issue #18](https://github.com/C0derTang/shared-garden/issues/18).
The private two-person Google-only scope and owner controls remain unchanged.

## Private configuration and stable membership

The database starts with no configured accounts. A direct privileged database
operation supplies both canonical Google account emails at once through
`private.bootstrap_members(text, text)`. The first argument is the owner.
Normalization trims outer whitespace and lowercases; it does not merge aliases,
remove dots, or strip plus suffixes. Operators must use the actual emails Google
returns. Duplicate normalized emails are rejected, and distinct stored Auth user
IDs and Google subject IDs prevent one identity from occupying both slots.

The fixed application identifiers are `1` (owner) and `2` (member), both
`smallint`. Roles are generated from these slots, so browser metadata cannot
assign them. The two-row configuration is required even before one participant
has signed in. Repeating the same bootstrap is a no-op; changing or reversing
accounts, or repairing a partial configuration, requires a separately reviewed
privileged operation. There is no invitation or account replacement API.

An additive trigger on `auth.identities` binds a new, verified Google identity to
an unbound slot. The binding stores both Auth user UUID and Google subject and
never follows an email change to another account. Deleting an Auth account
retains its reserved binding. Recreating an account therefore cannot silently
inherit access. Bootstrap can bind preexisting accounts only when they are
unambiguously verified Google accounts. It rejects ambiguous, unverified, or
non-Google matches atomically.

A private `revoked_at` value immediately denies that member's next database
statement, including an existing JWT. The other member remains eligible.
Repeated bootstrap cannot undo revocation. Removing either configuration row
fails the entire boundary closed. In-flight database statements retain normal
PostgreSQL snapshot semantics; this is not token destruction or deletion of
already downloaded content.

## Signup and authorization are separate boundaries

`public.before_user_created(jsonb)` is executable only by the platform
`supabase_auth_admin` role (plus privileged database administration). It checks
Auth's prospective Google provider, two-account configuration, allowlisted email,
revocation, and existing/reserved accounts. All denials use the same generic
message. It ignores editable user metadata, including role and verification
claims. Its invoker permissions grant Auth only SELECT on the private allowlist;
Auth cannot bootstrap or directly modify membership.

The hook runs before the persisted user and identity exist. In Supabase Auth
v2.196.0, its prospective OAuth UUID need not be the eventual user UUID, its
identities array is empty, and confirmation occurs after identity insertion.
The trigger therefore binds the stored identity before user confirmation, while
all access checks require confirmation afterward. Existing OAuth sign-in does
not run the creation hook; live authorization is always required. These ordering
choices follow the official [hook documentation](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook)
and the pinned Auth [hook](https://github.com/supabase/auth/blob/v2.196.0/internal/api/hooks.go)
and [OAuth lifecycle](https://github.com/supabase/auth/blob/v2.196.0/internal/api/external.go) source.

Every authorization check re-reads the bound Auth user and identity. It requires
one Google identity, matching verified identity email and subject, a confirmed
user email, Google as the original provider, an OAuth authentication method in
the signed JWT, and no anonymous, SSO, deleted, banned, password-bearing, or
additional linked identity state. Identity `email_verified` must be the JSON
boolean `true`. Neither JWT email/role metadata nor editable profile fields
establish membership. The trusted fields are described in Supabase's
[identity](https://supabase.com/docs/guides/auth/identities),
[user](https://supabase.com/docs/guides/auth/users), and
[JWT claim](https://supabase.com/docs/guides/auth/jwt-fields) documentation.

## API and downstream rules

`public.current_member()` returns zero or one row containing only
`member_id smallint` and `member_role text` (`owner` or `member`). It accepts no
target identity. An unrelated authenticated caller receives no row; an anonymous
caller lacks execution permission. No email, Google subject, Auth UUID, or
profile metadata is returned.

`public.is_garden_member()` returns a boolean for the caller and is available to
`authenticated` for RLS policies, including future Realtime-readable tables.
It reveals no account configuration. Future protected mutations must use
transactions/RPCs that call `private.require_member()` or
`private.require_owner()` before touching application data. Those guards return
the caller's member ID or raise SQLSTATE `42501`. The internal
`private.current_member_id()` returns the ID or NULL, and `private.is_owner()`
returns a boolean. All are argument-free. Definer wrappers must retain a fixed
search path and schema-qualified references.

No application role receives private-schema access, table access, default
future grants, or direct access to the existing private clock primitive.
Only the safe public functions receive explicit authenticated execution grants.
The private table has RLS; its only reader policy is for platform Auth's hook.
This issue adds no garden domain tables, application OAuth routes, Storage
policies, or Realtime subscriptions.

## Deployment and verification limits

The local configuration enables Auth so the platform creates its current
`auth.users` and `auth.identities` schema before application migrations, and
configures the local hook. This does not configure the hosted hook or bootstrap
hosted accounts. Follow the separate [private setup guide](../auth/identity-setup.md).

The database suite preserves all 50 clock assertions and adds identity tests
using synthetic `example.test` fixtures, actual platform tables, role switching,
JWT claims, RLS policy evaluation, and rollback cleanup. It does not conduct a
real Google browser exchange. Hosted Google callback, hook activation, private
bootstrap, and both real accounts remain live integration checks.
