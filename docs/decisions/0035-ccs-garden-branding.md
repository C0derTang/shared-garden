# cc’s garden branding

Status: approved by the user's request to “rebrand everything as cc's garden”,
implemented for [issue #86](https://github.com/C0derTang/shared-garden/issues/86).
Routine wording follows [decision 0004](0004-finalized-launch-rules.md). This
changes the name, not the approved two-person scope or any product behavior.

## Display name and audit

Use **cc’s garden**, lowercase with a typographic apostrophe, in human-facing
branding. Use `ccsgarden` for the package name, where an ASCII identifier is
required. Both package manifests agree; dependencies and versions are unchanged.

The audited active surfaces are the page title, landing wordmark and footer,
auth error wordmark, not-found wordmark, member garden heading and loading
message. Guide focus/inertness tests follow the new accessible heading. README,
AGENTS and CLAUDE identify the new name without changes to the operating
procedure. Foundational decision prose and the release audit comment use the
current name; their substantive historical decisions are unchanged.

## Retained wording and identifiers

- Lowercase descriptive phrases such as “a shared garden”, the page description,
  and “A moment for your shared garden” describe the experience, not an old brand.
  The historical “Working shared garden” decision title likewise describes the
  feature rather than naming the product.
- GitHub repository/issue URLs, Supabase project and container names, verification
  fixture paths, and the Realtime channel prefix remain compatible. Renaming an
  external address or repository is separate from this display-name change.
- The existing Shared Garden copyright attribution and introductory comment in
  `vendor/audio/limit.c` remain together as historical authorship of that native
  component. Third-party notices and assets are untouched.
- External service display labels and deployment are handled by the orchestrator;
  account identifiers, callbacks, storage keys and existing private data remain
  unchanged by this source update.

The typography, immersive layout, tutorial, Spotify controls, permissions and
stored garden content retain their approved behavior.
