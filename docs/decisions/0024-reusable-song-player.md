# Reusable song player and safe links

Status: conservative implementation choices under the discretion in
[decision 0004](0004-finalized-launch-rules.md), for
[issue #45](https://github.com/C0derTang/shared-garden/issues/45).
The prerequisite foundation #17 and [entry contract #24](0009-daily-entries-and-questions.md)
are merged. Persisted Tulip history and collection integration remain in
[issue #30](https://github.com/C0derTang/shared-garden/issues/30).

## Component contract

```tsx
import { SongPlayer, type SongPlayerProps } from "@/components/music/song-player";

// Pass the saved Tulip payload directly after validating its entry type.
const song: SongPlayerProps = { title: entry.title, artist: entry.artist, url: entry.url };
<SongPlayer {...song} />;
```

All three props are strings and correspond to the existing Tulip payload fields.
Title and artist are displayed as React text, never HTML. The entry contract
bounds each to 200 characters; the card also wraps unbroken text without clipping
it. The component uses an `article` named by its `h3`, native button and link
controls, unique control/iframe labels, and the foundation's warm palette and
focus treatment. Its CSS module requires the existing global palette/font tokens
and box sizing. It can fill the width of a history row or sheet without selecting
a route or fetching content.

Integration should use the durable entry ID as the list key, pass only authorized
entry data, and retain normal history pagination. Rendering a card neither
submits an entry nor grants growth, listening credit, or membership. There is no
working collection, query, subscription, route, or persisted UI in this slice.

## URL contract

`parseSongLink` is exported from `@/lib/music/song-link`. Its result is a
discriminated union:

- `invalid`: no navigation or embed; the card retains title and artist and
  explains that the saved link is unavailable.
- `external`: `originalUrl` is a safe saved HTTPS link with no supported embed.
- `spotify`: `originalUrl`, validated `trackId`, and the derived `embedUrl`.

The safe-link boundary follows decision 0009: at most 512 Unicode characters,
literal `https://`, an ASCII DNS hostname with at least two labels, hostname at
most 253 characters and labels at most 63, and optional numeric port 1–65,535.
International hostnames must use punycode. Credentials, whitespace, control
characters, backslashes, malformed percent escapes, and percent-encoded ASCII
controls are rejected. This is validation, not a trust assertion about an
external website. No URL is fetched by the parser or by an application server.

Only `https://open.spotify.com/track/<id>` is embedded, where `<id>` is exactly
22 ASCII letters/digits. DNS host case is insensitive; the `/track/` path is case
sensitive. Optional query and fragment are allowed on a safe original link.
The derived URL is always `https://open.spotify.com/embed/track/<id>`, with no
query or fragment. Saved query parameters, including `autoplay`, never become
iframe options. The original saved link is retained byte for byte in the
fallback `href`; it is not replaced with a reconstructed or normalized URL.

Explicit ports (even 443), localized paths such as `/intl-en/track/…`, trailing
slashes, encoded IDs, dot-segment paths, album/playlist/artist links, existing
embed URLs, short links, and other safe HTTPS providers are link-only. Spotify
URIs, raw iframe markup, unsafe URLs, and malformed hosts are never embedded.
No arbitrary iframe source or HTML prop exists. Supporting additional link
shapes later requires deliberate validation and tests.

## Loading, playback, and fallback

Every card starts collapsed with no iframe and no provider request. “Load player”
mounts one iframe for that card; it uses lazy loading and reserves a 352px height
at 100% width. Closing the player removes its iframe and ends that embedded
session. Changing the saved URL also closes and removes the prior player.
Removing a history row removes its player. Multiple cards can be opened only by
explicit separate actions; this component does not coordinate playback across
cards or impose a global player limit.

The load control keeps keyboard focus and communicates its expanded state. The
user then presses Spotify's own play control. There is no application play call,
autoplay query, autoplay permission, background sound, SDK, API key, or Spotify
account synchronization. The iframe retains `encrypted-media`, `fullscreen`,
and `picture-in-picture` permissions and sends no page referrer. The original
song link stays outside the iframe and opens a new tab with `noopener noreferrer`.

The help text is present whenever the player is open and explains preview and
fallback behavior. It does not use iframe `load` as proof of playable content or
attempt to inspect a cross-origin player. Missing content, blocked frames,
browser policy, network conditions, provider availability, and account context
can prevent playback or limit it to a preview. The card retains its metadata
and original link regardless. Full-song playback is never promised.

These choices follow Spotify's current primary documentation, checked on
2026-09-18: [creating an embed](https://developer.spotify.com/documentation/embeds/tutorials/creating-an-embed)
documents the track iframe, responsive width, and lazy loading;
[playback troubleshooting](https://developer.spotify.com/documentation/embeds/tutorials/troubleshooting)
describes preview/browser limits and the `encrypted-media` requirement.

## Verification boundaries

Parser tests cover the accepted shape, original query preservation, canonical
embed derivation, safe unsupported links, host/path spoofing, credentials,
encoded input, invalid schemes, and length/port limits. Component tests cover
safe text, accessible naming, keyboard toggling, mount/unmount, link replacement,
a 50-card closed history, and retained fallback after a provider error event.
They do not simulate successful Spotify playback. Browser observations of a
temporary local preview and the actual check results are recorded on issue #45
and its PR; no preview route or test content is shipped.
