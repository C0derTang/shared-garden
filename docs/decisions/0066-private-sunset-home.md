# 0066 — Private sunset home

Status: approved visual revision on 2026-11-14; implementation details under
[0004](0004-finalized-launch-rules.md). Source: [issue #165](https://github.com/C0derTang/shared-garden/issues/165).

The signed-out homepage shows only a `Log in` control using the existing POST
`/auth/start` flow. Successful approved-member OAuth returns to `/`, superseding
the callback destination and public informational homepage in
[0008](0008-google-web-session.md). Anonymous, denied, unavailable and unconfigured
home states contain no artwork, private entries, branding, or garden link.

The user approved a scene that looks like an actual photograph
with a painting filter, and a spider lily instead of the decorative rose.
[This approval](https://github.com/C0derTang/shared-garden/issues/165#issuecomment-6885528265)
supersedes the earlier fine-line SVG treatment, rose anatomy and terrain
illustration refinements. Their implementation history remains in Git and issue
comments; the current homepage uses original raster imagery with a restrained
painted surface, natural lighting and atmospheric depth.

The user's [scene-motion approval](https://github.com/C0derTang/shared-garden/issues/165#issuecomment-6886807188)
and [latest local-audio direction](https://github.com/C0derTang/shared-garden/issues/165#issuecomment-6886946085)
replace the three homepage carousels with exactly one custom local-audio panel.
The retained photograph has slowly drifting clouds and separate distant/near
water ripples. Stationary, feathered masks match its responsive cover crop and
exclude the mountains, sun and shoreline; only duplicated sky/open-water pixels
move. The original PNGs remain unchanged. Layer timing, masks, opacity and the
820px narrow breakpoint are implementation choices under decision 0004.

The single red Lycoris radiata stays anchored in a fixed decorative viewport
layer. The user [clarified](https://github.com/C0derTang/shared-garden/issues/165#issuecomment-6886835387)
that it remains beside/right of the player on wide
screens; on narrow screens it sits behind the panel instead of stacking below.
Its bloom stays above-left of the stem base with gentle base-anchored wind.
Decorative layers ignore pointer events. Reduced motion stops all decoration;
an icon inside the audio panel also pauses/resumes the scenery and flower.

The requested recording is Khalil Fong's **愛在 / Love At** from Wonderland / 未來.
Its identity was corroborated through the [official provider recording](https://www.youtube.com/watch?v=QE1fgMH-bf0)
and [Apple Music listing](https://music.apple.com/tw/album/%E6%84%9B%E5%9C%A8/272875165?i=272875203).
The user subsequently requested local audio and custom controls, superseding the
intermediate official-video choice. No iframe, provider connection, remote
thumbnail, extracted stream or third-party binary is included in the product.
Play/pause, elapsed/duration, seeking and mute use the browser's native audio
engine with custom accessible controls. The source is assigned only after Play;
metadata is not requested beforehand. Leaving the page stops and releases audio.
Errors remain generic and inside the panel, without server paths or details.

The user [supplied a local copy](https://github.com/C0derTang/shared-garden/issues/165#issuecomment-6887023659)
of the requested recording. Its path and binary
remain private, outside the public repository; local configuration and real
playback verification are handled separately from the committed implementation.
Authenticated localhost playback, pause, seek, mute and resume were verified
against that file; its observed duration is about 244 seconds.
Synthetic tones exercise controls only in disposable tests outside product
output. They are never a substitute track or a product fixture. If a recording
is not configured or becomes unavailable, the player reports a generic load
failure after Play.

Server-only `SUNSET_AUDIO_PATH` may point to one authorized absolute local file,
outside public static storage and version control. `.local-media/` is ignored;
actual paths and credentials never reach client props or errors. The independent
`/api/home/audio` GET/HEAD guard verifies Auth and live membership before opening
any file, returns 401/403/503 without login HTML on access failures, and persists
refreshed cookies. Responses are private/no-store with no media on failure.
GET supports bounded single byte ranges and 416 for invalid/multiple ranges;
HEAD returns metadata without a body. Unmatched If-Range receives the full file.
Streaming uses bounded chunks and closes the file on completion/cancellation.
A conservative 128 MiB limit, regular-file check and audio-extension allowlist
(MP3, M4A, AAC, WAV, Ogg, FLAC, WebM) reject unsuitable configuration. The route
rejects configured paths under public/, ignores client-supplied path parameters,
and uses nosniff/same-origin resource headers. No production storage upload,
arbitrary URL proxy, provider credential change or backend data write is added.

The only visible text outside that panel is one bottom-right `old garden` link
to `/garden`, with a pale backing for photographic contrast. The existing garden,
entry categories, music tools and all other routes remain unchanged. Removing
the homepage carousels removes their loader and formatter: the homepage verifies
Auth and live membership, then returns only member/visitor status. It performs
no `memories_page` calls and reads no unused entry content or display names.
Anonymous, denied and unavailable states render only Log in, including no
artwork, player URL, image preload or provider request.

The original landscape and transparent flower were generated from text without
external source images. Public paths, dimensions, hashes and exact sanitized
prompts remain in [artwork provenance](../assets/sunset-home.md). Next.js supplies
responsive image optimization while preserving transparency. The new SVG files
are invisible masking geometry, not replacements for the photographic artwork.
The prior fine-line artwork, decorative rose and three-carousel requirements
are superseded; their history remains in Git and issue comments.

The homepage remains dynamic and private/no-store. Its proxy persists refreshed
cookies in both the downstream request and browser response, including failed
sessions; its server loader independently verifies membership before rendering the
member scene. The native form retains the same-origin referrer policy needed by WebKit.

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
