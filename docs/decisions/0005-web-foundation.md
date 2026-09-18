# Public website and shared interface foundation

Status: conservative implementation choices under the approved discretion in
[decision 0004](0004-finalized-launch-rules.md).

Source: [Issue #17](https://github.com/C0derTang/shared-garden/issues/17).
The foundation follows [AGENTS.md](../../AGENTS.md) and preserves the fixed
two-person private scope in records 0001–0004. These choices do not authorize
private routes or establish that sign-in or a hosted deployment works.

## Public presentation

- The public landing uses cream paper, forest green, muted rust, and warm ochre,
  with an original local SVG pixel garden. It is decorative, contains no data,
  and does not represent the production garden's initial state.
- Readable system sans-serif text and a system serif display face avoid remote
  font requests. The landing stacks on phones and places the garden illustration
  alongside the introduction on wide screens. Content fits a 320px viewport.
- The copy introduces small shared acts of care and memories without names,
  actual contributions, account identities, or private event details. Its only
  action opens an informational sheet. Functional sign-in belongs to a later issue.
- Missing or invalid public setup displays “Garden setup is incomplete.” Valid
  public settings display “Private sign-in is coming soon.” Neither state grants
  access or renders the future private navigation.
- The reusable presentational navigation has Garden, Memories, and Achievements,
  with Settings in its own navigation landmark. It uses explicit active-page
  semantics. Future route owners must authorize before rendering this layout.
  No corresponding private pages are created in this issue.

## Interaction and implementation

- Next.js App Router, TypeScript, React, npm, and Node.js 24 implement the approved
  stack. Dependencies are pinned with one npm lockfile. The public route is
  prerendered; only the sheet boundary needs client interaction.
  Next.js agent-rule generation is disabled so `next dev` preserves the existing
  canonical AGENTS/CLAUDE operating procedure.
- Radix Dialog supplies modal semantics, focus trapping, return to the trigger,
  Escape and outside dismissal. The shared wrapper requires a title and
  description, includes a visible Close button, and accepts optional controlled
  state. It appears as a bottom sheet on phones and a centered dialog from 640px.
  Sheet content scrolls within the viewport. CSS disables motion for the reduced
  motion preference; there is no automatic audio or decorative animation.
- `@/*` resolves to `src/*`. Public and server configuration are separate modules.
  Public validation accepts only an HTTPS origin (HTTP loopback for local
  development) and modern `sb_publishable_` keys. It returns a closed status for
  missing or invalid settings, without echoing values. Legacy JWT keys are
  deliberately excluded so a service-role JWT cannot masquerade as a public key.
- The optional server module accepts only a modern `sb_secret_` key, is marked
  `server-only`, and is unused by the public route. A valid key is not evidence of
  authorization. Privileged clients and operations remain later implementation.
- ESLint 10 uses the official Next.js plugin, TypeScript ESLint, and React Hooks
  rules directly. At implementation, the Next.js umbrella config still brought
  React lint peer dependencies limited to ESLint 9, which had reached end of
  support. Direct supported plugins avoid an obsolete linter or forced peers.
- Focused component/config tests, lint, typecheck, and production build run in
  a separate Web workflow. Existing database scripts and workflow are retained.

## Primary references

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
  and [environment variables](https://nextjs.org/docs/app/guides/environment-variables).
- [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog).
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

Production connection, restricted Google authentication, private content, garden
behavior, and deployment remain separate issues. The artwork and public copy
make no claim that those integrations are complete.
