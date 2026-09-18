# Sunflower photo interface

Status: conservative implementation choices under [0004](0004-finalized-launch-rules.md), for [issue #28](https://github.com/C0derTang/shared-garden/issues/28).
Depends on merged garden #27 and private media #48. The [media contract](../media/backend.md), [0025](0025-private-media-and-photo-processing.md), and [0011](0011-working-garden.md) remain authoritative.

A Sunflower sheet offers separate labeled Choose photo and Take photo file inputs.
Both accept explicit JPEG, PNG and WebP MIME values; Take photo requests the
outward-facing camera where the browser supports it. HEIC is not advertised.
A supported-format export/choose fallback is visible. File-picker conversion and
physical camera behavior vary by OS/browser; the app does not rename unsupported
bytes or promise a native camera on desktop. Browser preview must load before
Share photo becomes available. Preview, removal and replacement remain explicit.

Limits match the server: 12 MiB, 25 million pixels, each side at most 12,000 pixels,
JPEG/PNG/static WebP. Browser type/byte checks are only early feedback; actual
server decoding validates format, dimensions and animation. The original File
is uploaded unchanged directly to private staging with the authenticated browser
client, never through a Server Action or a public object URL. Server processing
applies EXIF orientation and strips metadata while preserving upright dimensions
and aspect ratio. There is no canvas resizing, crop or destructive fallback.

Local review and member-authorized current/history views use a responsive square
with `object-fit: contain`; portrait and landscape compositions remain complete.
Signed access is requested only through the guarded read route, bypassing shared
image optimization. Resource failure offers an explicit fresh-access retry.
Signed URLs are held in component memory, never persisted or logged by this UI.
Object URLs are revoked on replacement, removal, successful save and unmount;
read requests are aborted on unmount. Both members can read immediately without
first contributing. Author replacement uses the original entry ID and deadline.

The shared garden mutation lock wraps upload/finalization and authoritative
refresh. The current calibrated day is checked after pending reads, before intent
creation and before finalization. Crossing a rollover preserves the local draft
and requires explicit review before a fresh current-day attempt. The database
also binds the intent to its creation day and independently checks author,
bloom, original 30-minute edit window and day at attachment. A failed replacement
never changes the prior valid reference. Closing a sheet during upload prevents
subsequent finalization dispatch; an already dispatched save can still complete,
so entries are authoritative when reopening.

Each selected file gets one request UUID. Network retries keep the same request
and immutable upload; ambiguous upload responses proceed to trusted finalization
to discover whether bytes arrived. Only a confirmed submitted receipt produces
saved feedback. Errors keep the preview and explain retry, choosing another
supported photo, processing delay, or changed care eligibility. No offline queue,
ambient playback, reminders or paid service is introduced.

Best-effort bounded cleanup runs when the photo form opens and after a save.
The existing server cleanup only removes expired unreferenced staging/final
orphans and never referenced current/history attachments. A failed cleanup is
retried on a later visit; it does not prevent care or claim complete cleanup.
No storage policy, production seed or membership configuration changes.

The additive `20260918075000_nominal_phone_photo_pixels.sql` migration raises
only the trusted registry pixel ceiling to 25,000,000, matching native decoding.
This supersedes only the 24,000,000 ceiling in decision 0025: the standard nominal
24MP phone image is 5712×4284 (24,470,208 pixels), which the previous exact cap
rejected. The 12 MiB input, 32 MiB output, 12,000-pixel side limits, metadata
stripping and static formats remain unchanged. The existing pixel constraint
name is retained; the later audio migration modifies the separate ready-metadata
constraint and audio rows have null image dimensions. No photo is resized.
Native and real HTTP tests verify upright 4284×5712 after EXIF orientation;
SQL tests accept nominal 24MP and exactly 25,000,000 pixels and reject larger
images. A 5001×5000 native image is rejected before attachment.

## Verification boundaries

Unit/component tests cover original bytes, immutable retry, preview lifecycle,
review before save, explicit new-day review, expiry, failed saves, signed-read
retry and upload-time rollover. The actual local media harness has an explicit
`LOCAL_MEDIA_MODE=sunflower28` mode restricted to API 57821, web 57829 and the
dedicated `shared-garden-sunflower28` container. It tests real Auth, HTTP routes,
Storage, decoded dimensions/metadata, invalid bytes, references, races and edits.
Use the backend guide's commands with this mode and disposable project; never
point the harness at hosted services or an existing user's garden.

CUA phone-size verification uses synthetic landscape/portrait fixtures and local
synthetic sessions. It verifies selection, review, upload, confirmed save,
partner visibility without contribution, replacement, original deadline and
history rendering. This is not a physical iOS/Android camera or real Google
OAuth test. Those remain release-device checks.
