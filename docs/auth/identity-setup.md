# Private identity setup and API contract

This guide implements [decision 0006](../decisions/0006-fixed-identity-boundary.md)
and [Issue #18](https://github.com/C0derTang/shared-garden/issues/18).
All values below are placeholders. Never place real identities, hosted project
identifiers, credentials, or private content in source control or public logs.

## Hosted setup

1. Apply the reviewed migrations through the authorized deployment procedure.
   The identity table starts empty and denies everyone.
2. Configure the approved Google OAuth provider, site URL, and exact redirect
   allowlist for the application. Disable email/password, phone, anonymous, and
   other providers, and keep manual identity linking disabled. Do not enable
   unverified email sign-ins or Google email-verification bypasses. These account
   settings are independent of database migration state.
3. Use a direct privileged database session to bootstrap both actual Google
   account emails together. The first is the designated owner. Prefer bound
   parameters through a private operator tool; keep values out of terminal
   history, screenshots, repository files, and captured query output. Example
   statement with parameter placeholders:

   ```sql
   select private.bootstrap_members($1::text, $2::text);
   ```

   `$1` is `<OWNER_GOOGLE_EMAIL>` and `$2` is `<MEMBER_GOOGLE_EMAIL>`.
   This is intentionally not a public RPC, service-key API, or seed migration.
   It accepts exactly two different normalized addresses. Only an identical
   repeat succeeds after configuration exists; it never clears revocation or
   bindings. Existing matching Auth accounts must have exactly one verified
   Google identity and confirmed email, with no password or other identities.
   Ambiguous existing accounts require private operator resolution first.
4. In Authentication → Hooks, select the Postgres **Before User Created** hook
   `public.before_user_created`. Its function URI is
   `pg-functions://postgres/public/before_user_created`. Enable and save it.
   The migration supplies the selective privileges; do not grant browser roles
   access to the function or private schema. Supabase's
   [hook security/configuration guide](https://supabase.com/docs/guides/auth/auth-hooks)
   describes the platform setup. Configuring the local TOML does not enable it
   in the hosted project.
5. Privately verify both approved Google sign-ins and an unrelated account
   rejection, then confirm that the frontend receives the correct safe member
   role. Verify refresh and regular returning sign-in. No identities or returned
   tokens should be copied to public evidence. Record only sanitized outcomes.

Do not globally disable new user creation before the two intended accounts have
been admitted: the Google OAuth flow still needs to create their Auth users.
The hook enforces the allowlist, and database checks enforce access afterward.
If the hook is absent, unrelated Auth users may be created, but they still cannot
resolve membership or pass the database boundary. Hook activation must be
verified before launch.

## Calling the boundary

| Function | Caller | Result |
| --- | --- | --- |
| `public.current_member()` | `authenticated` | Zero or one row: `member_id smallint`, `member_role text` |
| `public.is_garden_member()` | `authenticated` | Boolean, false when unauthorized |
| `private.current_member_id()` | Trusted database routines | Smallint member ID or NULL |
| `private.is_owner()` | Trusted database routines | Boolean |
| `private.require_member()` | Trusted database routines | Smallint member ID or SQLSTATE `42501` |
| `private.require_owner()` | Trusted database routines | Owner ID `1` or SQLSTATE `42501` |
| `private.bootstrap_members(text, text)` | Privileged database operator | Void; atomic initial private configuration |
| `public.before_user_created(jsonb)` | `supabase_auth_admin` | Hook JSON response; generic `403` error on denial |

Application member `1` is the owner; `2` is the other member. There is no separate
client-supplied role or target-user parameter. Empty `current_member` results
must keep application data hidden. No safe profile metadata is needed yet.
Do not infer authorization from a successful OAuth login alone.

A future SELECT policy can use `using ((select public.is_garden_member()))` and
still needs an explicit table SELECT grant and enabled RLS. This function does
not grant access to any table by itself. Keep writes inside guarded RPC
transactions; owner-only routines call `private.require_owner()` before reading
or writing protected data. No private-schema USAGE grant is needed by browsers.
Realtime and Storage must apply their own policies using this boundary.

## Revocation and account recovery

A direct privileged operator may set `private.garden_members.revoked_at` for the
selected member ID. For example, the parameterized administrative statement is:

```sql
update private.garden_members
set revoked_at = now()
where member_id = $1::smallint;
```

Normal account or profile edits cannot replace a slot's saved user/Google-subject
pair. Changing either stored email, unlinking/changing the identity, adding a
second identity/password, banning/deleting the user, or revoking the slot denies
future database statements. Clearing revocation or replacing a lost account is
an explicit privileged recovery action requiring review; this issue deliberately
provides no self-service replacement API. Never delete the slot to recover it.

## Local verification

Run `npm ci`, `npm run db:start`, `npm run db:reset`, and `npm run db:test` in an
isolated local project. Auth must be enabled during start/reset: without its
platform migrations, `auth.identities` does not exist. A clean start and a full
reset are both checked for this migration. Tests roll back all fixtures and
leave no members or Auth users configured.

The default pgTAP runner is the local `postgres` role, which can create synthetic
Auth fixtures but cannot `SET ROLE supabase_auth_admin`. The suite uses actual
`SET LOCAL ROLE anon`, `authenticated`, and `service_role` for browser/API denials
and RLS tests. It checks the hook role's grants. Additional verification under
the actual `supabase_auth_admin` role uses a disposable local superuser harness
and rolls back; no such role membership or elevated grant belongs in a migration.
Local fixture tests cannot substitute for the private live Google checks above.

To reproduce that additional role/lifecycle check after local reset, run:

```sh
docker exec -i supabase_db_shared-garden-clock \
  psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  < docs/auth/verify-identity-auth-role.sql
```

Replace only the Docker container name if using a separate local project ID.
The [checked-in harness](verify-identity-auth-role.sql) refuses a configured
membership table, switches to the real Auth role for hook and identity writes,
checks the Google insertion-before-confirmation sequence, returning sign-in,
spoofed claims, and revocation, then verifies fixture rollback. It runs only
against the disposable local container; do not run it against a hosted project.
