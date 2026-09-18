# Tulip player integration and retained song collection

Status: conservative implementation choices under the approved discretion in
[decision 0004](0004-finalized-launch-rules.md), for
[issue #30](https://github.com/C0derTang/shared-garden/issues/30).
Dependencies #27 and #45 are merged. The existing
[entry](0009-daily-entries-and-questions.md),
[garden](0011-working-garden.md), and
[player](0024-reusable-song-player.md) contracts remain authoritative.

## Reading, review, and playback

Tulip current entries, read-only flower history, and valid song drafts compose
the existing `SongPlayer`. Review does not submit anything. Each card keeps the
original safe link and escaped title/artist. Supported Spotify tracks still use
only the exact parsed host/path/22-character ID. No arbitrary iframe, autoplay,
provider API key, account synchronization, external playlist, or paid service is
introduced. Loading a player and pressing its provider controls are separate
user actions; listening never grants growth or additional contribution credit.

Official Spotify documentation was checked on 2026-09-18:
[creating an embed](https://developer.spotify.com/documentation/embeds/tutorials/creating-an-embed)
continues to document a responsive track iframe and lazy loading;
[troubleshooting](https://developer.spotify.com/documentation/embeds/tutorials/troubleshooting)
continues to explain previews, browser limitations, and encrypted-media support.
The existing player contract supplies those capabilities and keeps the fallback
visible when provider playback is blocked or unavailable. Full-song playback is
not promised. No new credentials are needed for this integration.

## Collection and privacy

`/garden/songs` is a private secondary route linked from the Garden heading and
every Tulip sheet, including permanent blooms. The primary Garden, Memories,
Achievements navigation remains unchanged. Future Memories work may reuse this
route and `loadSongs` instead of creating another song store.

The page and every Server Action independently call `requireMember()`. Queries
use the caller's session and the existing actual-member RLS on both
`flower_entries` and `flowers`. An inner relation filters flower type to Tulip;
there is no current-day, author, or bloom exclusion. No new schema, service-role
access, browser query, external fetch, or stored copy of a contribution is needed.
Read responses validate consumed entry and song fields. Failures return a
sanitized retryable message without discarding previously displayed content.

Each contribution retains its durable entry ID, member marker (You/Your partner),
garden date and original posting time in Pacific time. The garden date follows
the established 4 a.m. boundary, rather than changing at midnight. Three Tulip
blooms represent 21 paired song-days and up to 42 contributions; legitimate
repeated titles, artists and links are never deduplicated. Other retained care
and any days needed to recover growth remain in history as well.

The collection is read-only. Current author edits remain in the Tulip sheet,
using the existing server-authorized 30-minute AND same-garden-day conditions.
The backend retains original time and author, and rechecks the edit window.
The Tulip sheet retains newest observed versions independently of loaded history,
including edits seen while the first page is still pending. Same-day history pages
reconcile against those versions. The shared photo/ordinary history contract tags
pages with their request garden day: rollover hides loaded pages and late old-day
responses, and a fresh Read history starts from a null cursor. The retained Tulip
versions also protect against an older current snapshot within the same day.
The shared `compareTimestamps` preserves database microseconds; an older snapshot
cannot replace newer history. The cache lasts only while the sheet is open.

## Bounded browsing and refresh

Pages contain at most 20 entries and request one extra row to determine whether
more remain. The stable exclusive key is the immutable, increasing entry ID,
matching existing flower history. Older pages use IDs below the previous oldest
loaded entry. New inserts cannot move that cursor or cause an offset-page skip.

“Check for newer songs” reads the first 20 IDs above the newest loaded ID in
ascending order, then merges by contribution ID into the newest-first display.
If more remain, the user can continue. This deliberately avoids skipping an
intermediate batch when more than 20 contributions arrived while away. New
entries appear only after this explicit action, so reading older history does
not jump to a fresh first page on a background invalidation.

“Refresh saved songs,” foreground/focus, and reconnect refresh already loaded
IDs in batches of at most 20. Returned edits replace the same entry ID; loaded
older pages and the older cursor remain. Stable React keys preserve open players
unless their saved URL changes, as required by the player contract. One request
sequence runs at a time; rejected requests preserve entries and can be retried.
No local timestamp decides editing eligibility, and reads grant no growth.

## Verification

New web tests exercise repeat retention, both authors, multiple instances,
bounded before/after/ID queries, membership failures, retained pages after errors,
edit replacement and original time, safe player integration, and history across
rollover. Existing parser/player tests cover malformed/spoofed URLs and fallbacks.
The rollback-only `song_collection.test.sql` covers 42 repeated contributions
across three blooms, paging, both members, anonymous/outsider denial and live
revocation using actual database roles and existing RLS.

The PR records lint, typecheck, full Linux web suite, production build, database
suite and actual CUA phone/desktop observations separately. All browser fixtures
use a disposable local backend and synthetic members/content; no hosted change,
real Google exchange, private content, or successful provider playback is claimed
without direct evidence.
