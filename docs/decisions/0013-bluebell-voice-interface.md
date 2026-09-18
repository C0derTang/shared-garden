# Bluebell recording and private playback

Status: conservative interface choices under [0004](0004-finalized-launch-rules.md),
for [issue #29](https://github.com/C0derTang/shared-garden/issues/29).
Depends on merged garden #27, Sunflower/media interface #28 and audio backend #50.
[0027](0027-private-bluebell-audio.md) and the [media contract](../media/backend.md)
remain authoritative. No new storage, processing or growth authority is added.

The sheet offers Record, Pause/Resume when supported, Stop and review, local
playback, Discard, Re-record, and explicit Share voice memo. Microphone permission
is requested only after Record. Five minutes means active recording time; paused
time does not advance the visible clock or automatic stop deadline. A delayed
background timer displays the actual elapsed time and retains review. The server
validates the entire source and rejects overlength audio; the client never clips
bytes or reports a shortened recording as saved.

Only the proven WebM/Opus profile is requested, with a 48 kHz mono microphone
constraint and 64 kbps encoder hint. Browser constraints are not trusted facts.
Detect format support and catch permission, constructor, start, pause/resume and
runtime errors. Safari with WebM/Opus support can use the same flow; older or
unsupported browsers receive a clear message and keep access to the garden and
saved playback. There is no MP4 relabeling, unsupported codec fallback or browser
claim about real microphone/device coverage. The canonical input remains
`audio/webm`, up to 12 MiB; authoritative processing produces the existing private
48 kHz mono WAV of at most 300 seconds and 28,800,044 bytes.

Stopping releases all microphone tracks immediately, then assembles the final
recorder chunks into an actual File. Errors, discard, dismissal and unmount clear
timers, handlers, tracks and object URLs. A pending permission result is tied to
its capture generation: a late stream after dismissal is stopped without starting
a recorder, including when a newer recording is already in progress. Local review
must be playable before sharing, but listening is never required. Recording and
explicit voice playback pause other voice players; no playback is automatic.
Native audio controls retain browser accessibility. Focus moves to Stop during
capture, the review heading after stopping, and Record after discard/error.
Status messages announce state changes without announcing every timer tick.

The same media intent, direct private Storage File upload, trusted finalization
and `useGarden` external mutation guard as Sunflower are reused. Each immutable
recording has one request UUID, retained across ambiguous intent/upload/finalize
responses. Only a submitted receipt reports success. A failure preserves the
local draft and existing entry. Invalid bytes require a new recording; transient
processing/network failures permit retry of the same immutable attempt. Care
checks run before intent creation and again before finalization. Closing the
sheet prevents subsequent finalization dispatch; an already dispatched request
can finish, so reopening reads authoritative entries.

The draft belongs to the garden day on which recording began. At rollover, a
new-day contribution requires explicit review and Use this memo today before a
new intent can be created. Replacement stays bound to the original entry ID,
original thirty-minute deadline and original garden day. A new day cannot revive
an expired replacement. Current/history references use the existing generic
authoritative history reconciliation, including partner and other-tab changes.

The reusable `VoiceViewer` requests member-authorized short-lived access only
after Load voice memo. It shows the trusted server duration and native playback
controls. URL/resource failure offers Reload private memo; refreshed access does
not start playback. Signed URLs remain in component memory, requests abort on
unmount, and changed references stop/release the former player. Current and
history playback are immediately available to either member regardless of their
own contribution. Playback never writes an entry, award or growth fact.

Best-effort bounded cleanup runs on opening the form and after a confirmed save,
using the existing orphan-only cleanup boundary. Phone controls wrap with at
least 44-pixel touch height. No media upload picker, download collection, reminders,
ambient audio, paid service or hosted configuration change is introduced.

## Verification boundaries

Controlled recorder tests cover active-time limits, pauses, delayed background
stopping, denied/missing/unsupported devices, constructor/start/runtime failure,
late permission races, output bounds and resource cleanup. Form/player tests
cover explicit review/share, immutable retries, original edit expiry, rollover,
closing during upload, private URL retry and exclusive voice playback.

The existing actual HTTP/security harness accepts an explicit `bluebell29` mode
restricted to API 58321, app 58329 and `shared-garden-bluebell29`. All security
assertions and actual File payloads remain intact. This disposable mode can run
both audio and photo regressions with the corresponding status-file variable.
Use `/tmp/shared-garden-bluebell29`, reset to zero fixture state and stop afterward.
Native decoder, database and Auth-role checks remain required. Synthetic browser
streams are test seams only, never production code or real microphone evidence.
Physical-phone microphone/Safari playback and hosted execution remain release
checks; no claim of those checks follows from controlled tests or loopback UI.

The 2026-09-18 loopback browser pass used an isolated copy with a synthetic
Web Audio microphone seam and actual MediaRecorder/Storage/server processing.
At 320 and 390 CSS pixels the recorder had no horizontal overflow. Actual short
capture, pause, review, muted playback to completion, explicit share, partner
playback before contribution, discard, replacement and active-sheet dismissal
passed. Capture tracks and preview URLs were released. Replacement preserved the
original entry/time/deadline, and current/history loaded the new trusted audio.
Controlled denied/unsupported browser modes showed recoverable messages.

One accessibility click on the embedded browser's native Play control crashed
that test tab. A fresh tab's temporary muted-play control exercised native
`audio.play()` successfully for the local preview and private canonical audio;
the crash cause was not determined. Native control/device verification remains
a release limitation. This pass used short recordings; the 300-second evidence
comes separately from controlled active-time tests, the actual HTTP boundary
regression and unchanged Chromium/Safari five-minute decoder fixtures. No test
seam or development binary is included in the application.
