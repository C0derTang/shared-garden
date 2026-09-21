# Tulip Spotify catalog search

Status: user-approved catalog search, with conservative details under
[decision 0004](0004-finalized-launch-rules.md), for
[issue #84](https://github.com/C0derTang/shared-garden/issues/84).
The immersive composition through decision 0033 is merged. Existing
[entry rules](0009-daily-entries-and-questions.md),
[Tulip collection](0014-tulip-music-collection.md), and
[deliberate player](0024-reusable-song-player.md) remain authoritative.

## Approved interaction

The user approved searching by song or artist, viewing album artwork and
metadata, choosing a track, and explicitly confirming before sharing. Search is
compact and inline in the existing Tulip sheet. Native controls remain at least
44px high; metadata wraps in full at narrow widths. No extra dialog competes
with the sheet's focus and FIFO behavior. Manual title, artist and link fields
remain available throughout failure, offline, cancellation and missing setup.

Search runs on its button or Enter in the search input, never on each keystroke.
Typing another query, cancelling, selecting or unmounting cancels the old
request and invalidates late results. Selecting atomically fills only the
existing title, artist and canonical HTTPS link; focus moves to the title for
review. Selection, cancellation, changing a query and listening never save care.
The existing explicit Share care or Save edit button and same-garden-day AND
30-minute edit authorization remain. Rollover review gates and existing drafts
are retained. No schema, additional store, account linking or personal library
is introduced.

The user additionally required actual in-browser playback, accepting a preview
or full song. The selected song composes the existing Spotify embed: Load player
then the provider's Play control, with no automatic loading or playback. A live
browser check must observe actual play/progress separately from mocked search
and iframe rendering. Full-length playback is not promised. If the existing
embed cannot satisfy playback, personal OAuth or a Web Playback SDK migration
requires escalation rather than silent scope expansion.

## Server and provider boundary

The API proxy refreshes the existing member session and returns private JSON
failures; the search route independently checks actual membership before any
Spotify request, including token acquisition. Both members use server-side
Client Credentials, without Spotify user scopes, refresh tokens or personal
OAuth. Secret names are documented in the deployment guide; values never enter
client bundles, errors, logs or versioned records.

Queries contain 2–100 Unicode characters, no controls, and an integer page 0–4.
Unknown and duplicate parameters are rejected. US market and 10 tracks per
request are fixed; navigation covers at most 50 results. All upstream URLs are
constructed from fixed Spotify origins, never from provider pagination links.
Redirects are rejected. Client abort propagates upstream; an 8-second total
server deadline and 128 KiB body limit bound provider work. Browser requests
also have a 12-second deadline. Provider bodies and internal errors are never
returned to the client.

An in-memory server token expires 30 seconds before Spotify's reported expiry.
The provider token type must be a string equal to bearer without case sensitivity,
including the documented lowercase response; other or malformed types fail closed.
A provider 401 invalidates that token and retries once. Access failures, network
errors and malformed token/results become generic errors. A 429 respects a
bounded numeric Retry-After (1–86,400 seconds); absent or malformed headers use a
60-second local cooldown. The UI says to try later, without promising a provider
reset time. The process suppresses requests during that cooldown. No automatic
retry or per-keystroke traffic is generated. Runtime instances maintain separate
caches; Spotify's application/account quotas remain authoritative.

Track IDs must be 22 ASCII alphanumerics. Canonical Spotify links derive from
these IDs; arbitrary upstream URLs are ignored. Artwork is optional and accepted
only from exact HTTPS `i.scdn.co/image/` paths with 40 lowercase hexadecimal
characters. Consumed metadata is checked and escaped as text. Names up to 2,000
characters are displayed intact; any title or combined artists exceeding the
existing 200-character entry limit has a disabled selection with an explanation
and manual fallback, never silent truncation. Grossly malformed results fail
closed. Artwork and album metadata remain transient, not persisted.

## Attribution and setup

The catalog is visibly attributed using Spotify's official unmodified black
icon, with adequate clear space on the light sheet. The source asset is from the
[official icon download](https://developer.spotify.com/images/guidelines/design/2024-spotify-logo-icon.zip)
(`Primary_Logo_Black_RGB.svg`), retained as `public/spotify-icon.svg` unchanged.
Each result's complete metadata/artwork links back to Spotify. Album artwork is
shown uncropped, without overlays, filters or image transformations. Per Spotify's
required artwork treatment, CSS rounds corners to 4px on small/medium viewports
and 8px on large viewports (conservatively, at 1,024px and wider); the original
image content and contain sizing remain unchanged. No preview
audio is downloaded or rehosted.

Primary documentation checked 2026-09-20:
[track search](https://developer.spotify.com/documentation/web-api/reference/search),
[Client Credentials](https://developer.spotify.com/documentation/web-api/tutorials/client-credentials-flow),
[quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes),
[rate limits](https://developer.spotify.com/documentation/web-api/concepts/rate-limits),
[design and attribution](https://developer.spotify.com/documentation/design), and
[embed troubleshooting](https://developer.spotify.com/documentation/embeds/tutorials/troubleshooting).
Current development-mode search accepts at most 10 items per request. The owner
must meet Spotify's current application requirements. No new paid subscription
or bypass of provider limits is authorized. Deployment secrets, actual API smoke
and actual browser playback are separate runtime verification; synthetic tests
must not be represented as live provider success.
