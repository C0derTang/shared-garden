# 0066 — Private sunset home

Status: approved visual revision on 2026-11-14; implementation details under
[0004](0004-finalized-launch-rules.md). Source: [issue #165](https://github.com/C0derTang/shared-garden/issues/165).

The signed-out homepage shows only a `Log in` control using the existing POST
`/auth/start` flow. Successful approved-member OAuth returns to `/`, superseding
the callback destination and public informational homepage in
[0008](0008-google-web-session.md). Anonymous, denied, unavailable and unconfigured
home states contain no artwork, private entries, branding, or garden link.

The user's latest explicit request is a scene that looks like an actual photograph
with a painting filter, and a spider lily instead of the decorative rose.
[This approval](https://github.com/C0derTang/shared-garden/issues/165#issuecomment-6885528265)
supersedes the earlier fine-line SVG treatment, rose anatomy and terrain
illustration refinements. Their implementation history remains in Git and issue
comments; the current homepage uses original raster imagery with a restrained
painted surface, natural lighting and atmospheric depth.

The continuous sunset mountain-and-lake background sits behind the translucent
entry carousels at lower left and a single spider-lily stalk at lower right.
Keeping the warm red palette with a red Lycoris radiata, using separate image
layers, and choosing exact crops and motion are conservative implementation
choices under decision 0004. The bloom is above-left of its slender stem base,
with the stalk leaning down-right. Gentle base-anchored sway and slight flex
suggest wind; the lowest stem edge blends into the foreground. Reduced motion
keeps the image fully still. Phone layouts stack the panels and flower while a
responsive background crop retains the sunset and lake behind them.

The original landscape and transparent flower were generated from text without
external source images. Public asset paths, dimensions, hashes and exact sanitized
generation prompts are recorded in [artwork provenance](../assets/sunset-home.md).
Next.js supplies responsive image optimization while preserving transparency.
The signed-out rendering mounts neither image nor its preload. Existing
Rose/Marigold/Tulip entry categories are unchanged: replacing the decorative
flower does not rename or alter any garden data.

The only visible text outside the carousel panels is one bottom-right
`old garden` link to `/garden`. A restrained pale backing keeps its dark text
readable over photographic foreground detail. Existing garden routes and
features are unchanged. Phone layouts have no horizontal scrolling.

The Rose, Marigold and Tulip panels use the existing bounded `memories_page`
routine after Auth and live membership verification. Each keeps up to 12 newest
usable entries, with plain text excerpts limited to 220 Unicode code points;
Tulip displays title and artist. Existing private display names and garden dates
provide attribution. Missing entries and generic load failures stay inside their
respective panels. No tokens, Auth profiles, upstream errors, or demo data are
passed to the view. There are no database or provider changes.

The first entry is immediately readable. Multiple entries advance after at least
six seconds, allowing extra reading time for longer excerpts. Previous, next and
pause controls use vector icons with at least 44px touch targets. The old-garden
link uses dark ink on a pale backing for contrast over the photograph. Hover,
keyboard focus and hidden tabs pause
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
