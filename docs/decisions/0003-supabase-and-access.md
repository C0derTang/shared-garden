# Supabase backend, access, and Next.js frontend

Status: approved, incremental decision record.

Sources: [Issue #7](https://github.com/C0derTang/shared-garden/issues/7),
[Issue #11](https://github.com/C0derTang/shared-garden/issues/11), and
[Issue #13](https://github.com/C0derTang/shared-garden/issues/13).
This extends [record 0001](0001-approved-garden-rules.md) and
[record 0002](0002-progression-and-mobile-garden.md) for Shared Garden's fixed
two-person private scope. Their other approved rules remain in force.
Future feature issues must reference these records and follow
[AGENTS.md](../../AGENTS.md) and [CLAUDE.md](../../CLAUDE.md).

## Approved decisions

1. **Supabase backend.** Use Supabase for the full backend: PostgreSQL database,
   Supabase Auth with Google sign-in, private Supabase Storage for photos and
   voice recordings, and Supabase Realtime for in-app shared garden updates.
   Do not add Neon or Clerk.
2. **Restricted Google sign-in.** Restrict Google sign-in to the two approved
   accounts. There is no public signup or multi-couple scope. Actual account
   email addresses, credentials, project secrets, and private content must not
   be published in this public repository or its public artifacts.
3. **No daily care reminders.** Do not provide daily care reminders or nudges.
   Do not build email, push, notification opt-in, or reminder scheduling for
   that purpose. This does not settle unrelated notification requirements.
4. **Next.js frontend and Vercel hosting.** Use Next.js for the Shared Garden
   website and Vercel as its hosting provider. Hosting selection does not mean
   that a Vercel deployment exists.
5. **Dedicated hosted Supabase setup.** Use a new, dedicated organization and
   project for Shared Garden. Both have been provisioned, with the organization
   on the Free plan at creation and the project in West US (Oregon), `us-west-2`.
6. **Access defaults.** Enable the Data API, disable automatic exposure of new
   tables, and enable automatic row-level security (RLS). Application grants and
   RLS policies remain implementation work; these defaults do not implement
   authorization restricted to the two approved accounts.

## Provisioning observations

The project was created by the user. After creation, the orchestrator observed
the dashboard reporting Healthy status, Oregon / `us-west-2`, and an enabled
Data API. The Data API Settings page also showed automatic exposure of new
tables switched off, with no tables available, as recorded in the
[issue follow-up](https://github.com/C0derTang/shared-garden/issues/13#issuecomment-5727639932).

Both table-default settings were verified in the prepared creation form before
the user submitted it. Automatic RLS has not been independently audited in the
live database. These dashboard observations are not a database security audit or
verification of application authorization.

## Unresolved choices and resource status

Vercel deployment, hosted migrations, application connection, Google provider
configuration, and the two-account access configuration remain integration
work. Provisioning does not establish that any of this work is complete. Account
identities, credentials, and hosted organization/project identifiers stay
outside this public record.

Detailed security architecture, UI design, rollout, and the remaining product
rules identified in the earlier records remain open. This is a decision record,
not an implemented application or a complete specification. Unresolved choices
require further approval before implementation.
