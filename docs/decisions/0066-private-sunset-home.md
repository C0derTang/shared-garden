# 0066 — Private sunset home

Status: approved visual revision on 2026-11-14; implementation details under
[0004](0004-finalized-launch-rules.md). Source: [issue #165](https://github.com/C0derTang/shared-garden/issues/165).

The signed-out homepage shows only a `Log in` control using the existing POST
`/auth/start` flow. Successful approved-member OAuth returns to `/`, superseding
the callback destination and public informational homepage in
[0008](0008-google-web-session.md). Anonymous, denied, unavailable and unconfigured
home states contain no artwork, private entries, branding, or garden link.

Members see a wide fine-line mountain sunset and lake across approximately the
top half of the view, three entry carousels at lower left, and one detailed
botanical rose gently swaying at lower right. Warm parchment, peach, rose and
mauve, serif reading text, layered etched vector contours and delicate water
reflections replace the public pixel homepage presentation. There is no ASCII
art. The only visible text outside the carousel panels is one bottom-right
`old garden` link to `/garden`. Existing garden routes and features are unchanged.
Phone layouts stack the composition without horizontal scrolling.

The Rose, Marigold and Tulip panels use the existing bounded `memories_page`
routine after Auth and live membership verification. Each keeps up to 12 newest
usable entries, with plain text excerpts limited to 220 Unicode code points;
Tulip displays title and artist. Existing private display names and garden dates
provide attribution. Missing entries and generic load failures stay inside their
respective panels. No tokens, Auth profiles, upstream errors, or demo data are
passed to the view. There are no database or provider changes.

The first entry is immediately readable. Multiple entries advance after at least
six seconds, allowing extra reading time for longer excerpts. Previous, next and
pause controls use vector icons. Hover, keyboard focus and hidden tabs pause
rotation. Reduced motion disables automatic advance and decorative sway while
retaining manual navigation. Automatic changes do not trigger live announcements.

The homepage remains dynamic and private/no-store. Its proxy persists refreshed
cookies in both the downstream request and browser response, including failed
sessions; its server loader independently verifies membership before private
reads. The native form retains the same-origin referrer policy needed by WebKit.

Production release and merge are explicitly held until the user approves the
localhost candidate. [0065](0065-ordered-database-releases.md) means a main push
would release production. This work must remain on its feature branch and PR;
no production deployment is authorized. Existing uncommitted draft work is
preserved as reference only. Synthetic preview tooling remains outside product
routes and public artifacts contain no private source content.

The user additionally approved connecting localhost to the existing hosted
production backend and existing Google provider. The exact localhost callback
is allowlisted without changing the production site URL or callback. Local
configuration and credentials stay in ignored files; no provider credential or
database change is part of this feature. Automated fixtures remain synthetic,
and the separate synthetic browser preview stays outside the product routes.
This local configuration approval does not authorize a release or merge.
