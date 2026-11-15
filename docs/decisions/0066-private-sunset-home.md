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
Decorative layers ignore pointer events. The operating-system reduced-motion
preference stops all decoration.

The requested recording is Khalil Fong's **愛在 / Love At** from Wonderland / 未來.
Its identity was corroborated through the [official provider recording](https://www.youtube.com/watch?v=QE1fgMH-bf0)
and [Apple Music listing](https://music.apple.com/tw/album/%E6%84%9B%E5%9C%A8/272875165?i=272875203).
The user subsequently requested local audio and custom controls, superseding the
intermediate official-video choice. No iframe, provider connection, remote
thumbnail, extracted stream or third-party binary is included in the product.
Play/pause and seeking use the browser's native audio engine with custom accessible controls. The source is assigned only after Play;
metadata is not requested beforehand. Leaving the page stops and releases audio.
Errors remain generic, announced to screen readers with a retry indication on
the play icon, without server paths or details.

The [square-glass approval](https://github.com/C0derTang/shared-garden/issues/165#issuecomment-6887055837)
and [subsequent layout](https://github.com/C0derTang/shared-garden/issues/165#issuecomment-6887122797)
and [control refinements](https://github.com/C0derTang/shared-garden/issues/165#issuecomment-6887136665)
produce one liquid-glass panel centered horizontally in
the viewport. The [natural-height spacing approval](https://github.com/C0derTang/shared-garden/issues/165#issuecomment-6887193137)
supersedes the square constraint: content determines its height, with balanced
padding around a responsive record, seek bar and play control. On short screens
the record contracts while controls retain their touch targets.
The [floating-lyrics revision](https://github.com/C0derTang/shared-garden/issues/165#issuecomment-6887351472)
then moves the player lower, tightens the seek/play spacing evenly and places
the active lyric above it without a second card. Exact responsive offsets,
padding and the restrained cue entrance are choices under decision 0004; the
later caption revision below supersedes that entrance and the lyric sizing.
Translucency, soft blur and shadow remain, with no visible border,
rim or inset outline. A grooved decorative record rotates during actual playback;
pause, buffering, seeking, end and error stop it. On seek completion the native
media state resumes the record only if audio is unpaused, not ended/errored and
ready, including WebKit's buffered seeks without a fresh playing event. Reduced
motion disables the record and all scenery animation.

The panel has no visible track/artist names, timestamps or prose. A translucent
scrub bar sits above an icon-only play triangle/pause-bars button with an invisible
44px target; accessible control names and elapsed/duration announcements remain.
The corner scenery control and optional mute button are removed at the user's
request. An error is announced to screen readers with a retry indication on the
play icon. The single old-garden link is underlined text with no box/background;
light ink and a restrained text shadow retain contrast over the shore. Responsive
placement, exact glass styling, disc grooves and control dimensions are choices
under decision 0004.

The user [supplied a local copy](https://github.com/C0derTang/shared-garden/issues/165#issuecomment-6887023659)
of the requested recording. Its path and binary
remain private, outside the public repository; local configuration and real
playback verification are handled separately from the committed implementation.
Authenticated localhost playback, pause, seek and resume were verified
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

Timed lyrics use a separate optional server-only `SUNSET_LYRICS_PATH`, an absolute
JSON path outside public static storage and version control. The interchange
format is `{ "version": 1, "cues": [{ "start": 1, "end": 3, "text": "..." }] }`,
with seconds, sorted non-overlapping intervals and explicit ends. Unknown fields
are dropped. Per the [timing amendment](https://github.com/C0derTang/shared-garden/issues/165#issuecomment-6888161978), a cue may carry an optional
`chars` array with one absolute onset per code point of the trimmed text,
finite, nondecreasing and inside `start <= onset < end`; any malformed array
rejects the whole file, and files without it remain valid version 1 data. The user
[supplied the authoritative lyric text](https://github.com/C0derTang/shared-garden/issues/165#issuecomment-6887565676)
and requested only its Mandarin/Chinese lines, excluding romanization. Those
exact words are aligned locally to the supplied recording; recognition output
is not a substitute for the supplied text. Neither full lyrics nor private
cue paths are committed or included in public fixtures, HTML or server props.

The independent `/api/home/lyrics` guard verifies Auth and live membership before
any file inspection and persists refreshed cookies with private/no-store. It
rejects public paths (including resolved symlinks), limits bounded file reads to
256 KiB and validates up to 1024 cues with finite nonnegative times, at most one
hour and 500 characters per cue. Private source metadata is discarded. Missing,
invalid or denied data returns an empty generic failure, never a filesystem
error or login HTML. No client-selected file path or remote request is accepted.

The client requests cues only after explicit Play, independently of audio so a
missing file never blocks playback. Leaving the page cancels lyric work along
with releasing audio. The user's [caption revision](https://github.com/C0derTang/shared-garden/issues/165#issuecomment-6887746621)
asked for character-by-character captions, separate lines at the pauses in the
music, a larger different font and any other improvements. Under decision 0004
the following details were chosen. After viewing the first candidate, the user
reported that audio-derived per-character timing did not feel synchronized and
[asked](https://github.com/C0derTang/shared-garden/issues/165#issuecomment-6888069612)
for a plain constant-velocity slide with no character shadow, which superseded
the ink-bloom reveal. After viewing that, the user [asked](https://github.com/C0derTang/shared-garden/issues/165#issuecomment-6888161978) for better
individual character timing and for phrases to fade out in place, which
supersedes the slide for timed cues and the upward drift. While audio plays, a
frame loop reads the native media clock (rather than the coarse `timeupdate`
event); every displayed state is a pure function of that time, so seeking,
pausing, delayed cue responses and replay show the exact state at once. Each
character's opacity rises linearly from its own onset over 120 ms, or by the next
onset if that is sooner (with a 40 ms floor), so held notes never delay later
characters. Cues without onsets keep the constant-velocity sweep: progress
`(time - start) / (end - start)` in characters with a one-character soft edge.
The display runs a constant 40 ms ahead of the media clock to offset about one
frame of sampling and compositing delay plus part of the ramp, small enough not
to show a character visibly before it is heard. Characters are plain cream text
with no shadow, glow, blur or colour change. Unsung characters keep their space,
so a centered phrase never shifts. A finished phrase fades out in place, by
opacity only and linearly, with no translation or scale. Following the
independent review, the fade always finishes no later than the next phrase's
start, so phrases never overlap: within the window between a phrase's end and
the next start, the linger takes at most 40% of the window (up to 0.25 seconds)
and the fade the rest (up to 0.5 seconds); a window under 50 ms removes the
phrase at the next start without a fade. The last phrase and long gaps keep the
0.25-second linger and 0.5-second fade. Phrases share one grid cell, so nothing
moves. Pausing applies the media position directly. Before gaps of at least 5
seconds, including the
introduction, three
dots appear up to 6 seconds ahead and light one per second over the final 3
seconds. The ending, errors and unavailable cues stay blank.

The captions use the Ma Shan Zheng brush-kaishu face, self-hosted through
`next/font` with no runtime third-party request, falling back to local Kaiti
faces. The lyric stage spans up to 1200px or 94% of the viewport independently
of the player, at about 2.4–5rem on wide screens, 2.1–3.6rem below the 820px
breakpoint and 1.75–3rem in short windows, with balanced wrapping and no
horizontal overflow. The earlier hard outline is removed and no halo or backing
scrim replaces it; contrast over the painting is the user's call. Screen readers
receive each phrase once as plain text while the per-character spans are hidden
from them; the region remains non-live. Reduced motion shows each whole phrase
at its start with no character ramp, exit fade or indicator animation; phrases
swap instantly.

The supplied text resolves the word-recognition blocker after inaccurate local
transcription drafts were withheld. Local alignment preserves all 47 supplied
Chinese lines and 476 characters exactly, including repeated lines, without
romanization. Cues are sorted, non-overlapping and within the recording, with
explicit intro, outro and internal gaps. Phrase-level timings are estimated;
this is not word-by-word karaoke or a claim of a complete human listening audit.
The private file passes the application's validator and all 47 cue-midpoint
selection checks. Authenticated localhost playback and seeks displayed the
expected Chinese cues, instrumental/start/end gaps were blank, and pausing
preserved the current line. Anonymous lyric requests still returned empty
401/private-no-store with the real file configured. This resolves the source
availability and rendering blocker while retaining the timing limitations
above. No guessed transcript, hallucinated text or placeholder cue file is
installed. Synthetic tests prove the mechanism separately from this private
source and runtime evidence.

For the caption revision, the private cues were regenerated locally from the
same recording and private timing evidence, keeping the previous line-level file
as a private backup. Each supplied line is split only where the separated vocal
track shows a measured breath or rest, giving 59 phrase cues from the 47 lines;
legato lines without a measurable pause stay whole. For the timing amendment the
earlier onsets were first measured against the separated vocal: their error was
random scatter rather than a constant offset or drift, and the earlier reveal
animation added further visual delay. Onsets were then regenerated locally by
acoustic forced alignment of the exact supplied characters against the separated
vocal, refined to detected syllable onsets, with phrase starts and ends moved to
the aligned first onset and the sung end without overlaps. Where direct alignment
fails, in the third repeated chorus, timing is mapped acoustically from the two
earlier choruses, whose mappings agree. The result was checked against an
onset detector, the earlier recognition timing and the consistency of repeated
lines; the agreement statistics are recorded privately. All private cue files
from earlier revisions are kept as private backups. The concatenated text still
equals the supplied 476 characters exactly and the application's parser accepts
the file. Onsets remain automatic estimates, not human-verified karaoke timing;
a private listening aid exists for checking by ear. No lyric text, timing or private
path is committed or published.

Apart from an active lyric, the only visible text outside that panel is one bottom-right `old garden` link
to `/garden`, with readable underlined text and no backing. The existing garden,
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
