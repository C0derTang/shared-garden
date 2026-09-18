# Supabase backend, access, and Next.js frontend

Status: approved, incremental decision record.

Sources: [Issue #7](https://github.com/C0derTang/shared-garden/issues/7) and
[Issue #11](https://github.com/C0derTang/shared-garden/issues/11).
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
4. **Next.js frontend.** Use Next.js for the Shared Garden website. This choice
   does not approve a hosting provider.
5. **New Supabase project.** Create a new Supabase project for Shared Garden.
   This records provisioning intent, not completed provisioning or approval of
   resource configuration.

## Unresolved choices and resource status

Hosting remains pending; Vercel is not approved by this record. The Supabase
organization, region, and plan remain unselected and require approval before
provisioning. Account identities and credentials have not been provided.
This record does not claim the new project or any other resources have been
created or connected.

Detailed security architecture, UI design, rollout, and the remaining product
rules identified in the earlier records remain open. This is a decision record,
not an implemented application or a complete specification. Unresolved choices
require further approval before implementation.
