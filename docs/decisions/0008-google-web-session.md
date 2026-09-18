# Google sign-in and the web session boundary

Status: conservative implementation choices under
[decision 0004](0004-finalized-launch-rules.md).
Source: [Issue #22](https://github.com/C0derTang/shared-garden/issues/22).
Dependencies: [website foundation](0005-web-foundation.md) and
[fixed identity boundary](0006-fixed-identity-boundary.md).
Follow [AGENTS.md](../../AGENTS.md). The Google-only, fixed two-account scope,
no-reminder rule, and private configuration requirements remain unchanged.

## Entry, callback, and private rendering

Use the supported `@supabase/ssr` and `@supabase/supabase-js` clients with the
Next.js 16 App Router and `proxy.ts`. A normal POST form starts Google OAuth
with PKCE and account selection. The callback exchanges the one-time code,
verifies the identity with Auth's `getUser()`, then calls `current_member()`
with that user's session. Success returns to `/garden`. The application ignores
all caller-supplied next/return destinations; only fixed internal destinations
are used. Neither Host nor forwarded headers supply the OAuth/deployment origin.

`APP_ORIGIN` is required server configuration: a single HTTPS origin, or HTTP
loopback for local development. Credentials, paths other than `/`, query
parameters, and fragments are rejected. Start and sign-out POSTs require an
Origin header exactly equal to the configured origin; missing/foreign origins
receive a generic 403. GET cannot start sign-in or sign out. The callback GET
uses PKCE rather than requiring an Origin header from the external provider.

The proxy verifies Auth identity and live database membership before forwarding
private routes. It passes refreshed cookies to both the downstream request and
browser response, including when returning an access-denied redirect. The
protected page also calls the server-only `requireMember()` guard, so a proxy
bypass cannot render its shell. Future private pages and server actions must
call an authorization guard themselves. Mutations must additionally use the
guarded database routines described in decision 0006; checking at page render
is not authorization for a later write.

Only exactly one valid `current_member()` row is accepted: slot 1/owner or
slot 2/member. Empty, malformed, duplicated, and errored results fail closed.
No email allowlist is duplicated in frontend code. Browser cookies, local
session flags, Auth profile fields, and editable user metadata never prove
membership or assign a role. No Auth profile or token is passed as UI props.

## Session and future Realtime compatibility

The shared SDK cookie name is `sg-auth`. Use `cookieOptions` with `name:
"sg-auth"`, `path: "/"`, `sameSite: "lax"`, `httpOnly: false`, and `secure: true`
on HTTPS (false only for configured HTTP loopback). Do not set a Domain:
cookies remain host-only. Retain the SDK's cookie encoding and chunk handling.
The server creates a fresh client for each request and uses `getAll`/`setAll`;
the Next.js proxy refreshes sessions before Server Component rendering.
Server Components read cookies and recheck authorization; they do not write
cookies. Auth routes and private responses set private/no-store cache headers,
and Auth/Data API fetches also use no-store. No session-bearing result is stored
in a shared cache.

Browser-readable cookies intentionally follow Supabase's supported shared SSR
session pattern. Future Realtime work in issue #27 can call
`createBrowserClient(publicUrl, publishableKey, { cookieOptions: ... })` with the
same name, path, SameSite, and Secure settings. That client can reuse and refresh
the session through the SDK; it does not need a new privileged token-handoff
endpoint. HTTP-only session cookies would prevent this integration. Keep
untrusted HTML/scripts out of the app, and never log token values. Browser
session possession still does not authorize database access: current membership
and Realtime/RLS policies must enforce the identity boundary. This slice creates
no browser Supabase client, subscription, or Realtime authorization policy.
The interoperability test uses the real supported browser client to consume a
session written by the callback adapter.

Sign-out uses Auth's `local` scope to revoke the current session's refresh token
without signing out other devices. It clears the SDK cookie namespace, chunks,
and PKCE verifier cookies, then returns to `/` through a full navigation. If the
service cannot confirm revocation, local cookies are still cleared and a generic
message accurately reports the limitation. As with Supabase's session model,
an already issued access token can remain valid until expiry; database membership
revocation is a separate immediate application boundary.

## Public states and deployment configuration

The public landing remains readable without credentials and retains its original
informational sheet. When both public settings and APP_ORIGIN are valid, it
shows “Continue with Google”; otherwise it shows the incomplete setup state.
Cancellation, unusable callback, sign-in required, denied membership, service
failure, and local-only sign-out have generic accessible pages with retry/home
controls. No upstream error text or OAuth query values are rendered. The denied
page contains no member navigation or private content.

The authorized garden page is an explicitly unfinished shell. It contains no
invented flowers, counts, memories, or live data. Its navigation reuses the
foundation; other destinations remain separate feature work.

Set these environment variables privately, using deployment-specific values:

```dotenv
APP_ORIGIN=https://app.example.test
NEXT_PUBLIC_SUPABASE_URL=https://your-project.example.test
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_WITH_PUBLIC_KEY
```

The `NEXT_PUBLIC_` values must be correct at build time and runtime; Next.js
inlines them. `APP_ORIGIN` is server-only runtime configuration. Configure the
exact `${APP_ORIGIN}/auth/callback` URL in Supabase's redirect allowlist and the
canonical application origin as the site URL. Configure the Google-to-Supabase
callback separately as described in the [private setup guide](../auth/identity-setup.md).
Each deployment needs an explicitly configured origin; wildcard/untrusted
preview-host inference is not supported.

Only the modern publishable key is used by the web session clients. No service
role/secret key, Google OAuth secret, allowed-account list, or owner-only private
configuration is imported into browser code. All auth/config/authorization
helpers are marked `server-only`. Real hosted values and account identities must
never appear in public files, issue/PR evidence, or screenshots.

## Verification and limits

`npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` cover this
slice. The flow tests use the real SDK, PKCE, Next request/response objects and
cookie adapters, with only Auth/Data API network responses replaced. They cover
redirect bounds, origin rejection, missing configuration, callback success and
errors, both member slots, malformed/empty/error membership, expired/rejected
sessions, refresh propagation, browser-client compatibility, and sign-out.
Page tests separately reject anonymous rendering without the proxy. These tests
do not validate a third-party Google exchange.

An opt-in test also calls real isolated local Auth and PostgREST services. To
reproduce without changing repository database settings:

1. Create a disposable directory outside the repository with a `supabase`
   subdirectory. Copy the tracked config and migrations there. In that copy only,
   set project ID `shared-garden-auth22`, API port 56621, DB port 56622 and shadow
   port 56620. Start it with the pinned CLI's `--workdir` option. Never link it to
   a hosted project. Its membership table must be empty.
2. With a restrictive file umask (`077`), save `supabase --workdir <directory>
   status -o json` into a temporary local file outside the repository. Do not
   display or publish this file; it includes generated local keys.
3. Run `LOCAL_AUTH_STATUS_FILE=<temporary-status-file> npx vitest run
   src/test/auth-local.test.ts`. Without this opt-in variable, normal web tests
   skip this additional check. It requires Docker and refuses any API URL except
   `http://127.0.0.1:56621` and any container except the fixed disposable project.
4. Stop/remove the disposable stack and delete the temporary status file after
   verification. Keep all generated keys and startup logs out of public output.

The local test creates synthetic Google-bound Auth/database fixtures, signs a
short-lived JWT using only that disposable project's local key, verifies access
through actual Auth and `current_member()`, revokes membership and checks denial
with the same token, then checks sign-out cookie removal. It removes its fixtures
in cleanup and refuses existing membership or a colliding user. This is not an
OAuth exchange, Auth-issued refresh-token test, or production account check.
Refresh/callback transport is covered by the separate SDK flow tests.

Hosted migrations, private membership bootstrap, hook activation, Google account
verification, and deployment are still external integration work. Provider
configuration alone does not establish that any of these have been completed.

Primary references:

- [Supabase SSR and Next.js proxy](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs).
- [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google).
- [Supabase SSR advanced session guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide).
- [Supabase sign-out](https://supabase.com/docs/guides/auth/signout).
