# Private media and photo processing

Status: conservative choices under [decision 0004](0004-finalized-launch-rules.md)
for [issue #48](https://github.com/C0derTang/shared-garden/issues/48). Photo UI
[#28](https://github.com/C0derTang/shared-garden/issues/28) and voice
[#29](https://github.com/C0derTang/shared-garden/issues/29) consume this boundary.
Identity, session, entries and settlement decisions 0006, 0008, 0009 and 0010
remain authoritative. This slice adds no picker, camera, display, audio decoder,
Memories page, hosted configuration, scheduler or paid service.

## Storage and contribution authority

An actual member requests a 15-minute intent for one Sunflower, with a UUID
request key, claimed MIME/byte count, and optional owned replacement entry ID.
The server chooses the media ID and object paths and captures the garden day.
Each member may have three unexpired unfinished intents and create twenty per
hour. Reusing an identical request key returns its original intent; changing the
parameters is rejected. Expiry never renews on retry.

The browser directly inserts into private `garden-staging` with its normal
publishable client and authenticated session. RLS recognizes live membership and
the exact owner's pending path **and** permits only Storage's exact
`object.upload` operation. An INSERT grant alone also enables reusable signed
upload URLs; `storage.allow_only_operation('object.upload')` explicitly denies
that signing operation, including its upsert variant, and denies other upload
protocols. The verified local Storage v1.72.1 supplies the operation itself;
browser-supplied headers or object metadata do not choose it. Missing/unknown
operations fail closed. No signed-upload capability is issued by this protocol,
so expired, revoked or cleaned intents cannot be resurrected by an anonymous
bearer upload. There are no browser SELECT, UPDATE or DELETE
policies on either media bucket. Upserts and overwrite races fail. Bucket limits
bound transfers before the application receives any bytes. Staging is never
viewable as a contribution and counts as no care.

A Node server route obtains the real `requireMember` guard and a serialized
validation claim. It reads the bounded staged file using a server-only modern
Supabase secret, independently decodes/re-encodes it, then inserts the exact
validated bytes into private `garden-media` without upsert. The server's narrow
attestation RPC verifies the current claim, expiry, still-live owner and stored
object metadata; only `service_role` may call it. This capability records no
entry, growth or client authorization. The server secret never reaches browser
imports and has no general-purpose route accepting paths or operations.

The same user-session client then invokes the existing `submit_flower_entry`
or `edit_flower_entry` with `{ "media_id": "<MEDIA_UUID>" }`. Existing settlement,
author, day, one-original and edit-window checks remain unchanged. A database
trigger atomically binds the ready reference to that exact owner, flower, day
and new-entry/replacement purpose. A photo cannot attach to another member,
flower or entry. Existing nonmedia payload validation and limits are preserved.
An expired or rejected contribution keeps the prior valid reference. Neither
validation nor entry creation awards current-day growth.

## Pixel and metadata contract

Accept JPEG, PNG and static WebP only, with a maximum 12 MiB input, 24,000,000
pixels and 12,000 pixels on either axis. Refuse GIF, animated PNG/WebP, SVG, HTML,
HEIC/HEIF/AVIF, TIFF, corrupt/truncated input and claimed/decoded type mismatches.
Phone HEIC must be exported as a supported format; camera UI support is a later
issue. These conservative formats have standard native decoders in the pinned
Sharp 0.35.4 build on Node 24, macOS and Linux/Vercel.

Sharp's decoder enforces the pixel bound, rejects decoder warnings, and fully
decodes every accepted image during re-encoding. PNG additionally receives a
bounded chunk walk rejecting `acTL`, `fcTL` or `fdAT` animation chunks before
encoding. This is required because the native PNG decoder may omit `pages` for
a valid APNG and otherwise flatten it. Chunk lengths and the final `IEND` are
checked; strings inside unrelated chunk data do not count as animation. Processing has a 20-second
native timeout; the route is limited to 30 seconds. Output is at most 32 MiB.
There is no resize, crop or pixel-dimension downscaling. Apply all eight EXIF
orientations, including mirrors, before stripping metadata: a 6000 × 4000 image
with a quarter-turn orientation becomes an upright 4000 × 6000 image, retaining
all 24,000,000 pixel positions and the visible aspect ratio. Store those upright
output dimensions as the trusted display dimensions.

Encode JPEG as JPEG at quality 95 with 4:4:4 chroma, PNG as lossless PNG, and WebP
as lossless WebP. JPEG is re-encoded and therefore not bit-exact; pixel counts
and composition are preserved. Normalize decoded color to sRGB; original HDR,
color-profile precision and metadata are not archival guarantees. No EXIF, GPS,
XMP, IPTC, comments or original ICC metadata is copied. Original files are
untrusted staging, not retained as a download alternative. This explicitly
trades original-file fidelity for a safe, location-free shared photo while
preserving the approved dimensions and composition.

## Retries, reads and retention

A validation lease lasts two minutes. Concurrent claims report processing; a
retry after a crashed lease can process the same immutable staged object. A
preexisting final path is usable only if its byte length and SHA-256 match the
newly decoded canonical output. A stale worker cannot attest after a newer
lease. Finalization retries return the already accepted entry ID and do not
repeat entry mutation or growth. If a response is ambiguous, read intent and
garden state before retrying or offering replacement. A replaced original's
finalization receipt means it was accepted, not that it is still the current
photo; authoritative entry state decides that.

Both actual members may request a 60-second signed read only for a submitted
media ID still referenced by an entry. Reads include retained past-day history.
Anonymous, unapproved and revoked users cannot obtain a URL or list/download
objects. An already-issued bearer URL may remain usable for its remaining
60 seconds; membership is checked again on refresh. Responses are private and
no-store. Later UI must refresh on expiry/error using this route and display
with `object-fit: contain`; use an ordinary image or an unoptimized private
image, never a public/shared image-optimizer cache. Do not persist or log URLs.

A member may trigger a bounded cleanup pass; UI can call it when opening the
photo sheet and after a successful save. No paid or unattended scheduler is
needed. Cleanup first tombstones expired never-submitted intents under the
shared garden lock, then deletes only their known staging/final paths after a
one-hour grace. That grace exceeds request duration and lease limits. It also
removes staging for accepted entries. Removal acknowledgements are repeatable;
failed removals remain candidates. Final objects that have ever been submitted
are never selected, including superseded replacements. This preserves all
referenced history and avoids unsafe automatic history deletion. Rows remain
as idempotency/expiry tombstones; an idle garden may retain expired staging
until the next cleanup request.

The [API and verification contract](../media/backend.md) specifies requests,
errors and local-only tests. Voice must extend this same registry, immutable
validation, member reference guard and read/cleanup protocol with an approved
audio decoder and duration checks; do not build a parallel ownership boundary.

Primary references checked during implementation:

- [Sharp constructor and decode limits](https://sharp.pixelplumbing.com/api-constructor/).
- [Sharp orientation operations](https://sharp.pixelplumbing.com/api-operation/).
- [Sharp output encoding and default metadata removal](https://sharp.pixelplumbing.com/api-output/).
- [Sharp native platform and optional-dependency support](https://sharp.pixelplumbing.com/install/).
- [Supabase operation-aware Storage policy helpers](https://supabase.com/docs/guides/storage/schema/helper-functions).
- [Storage v1.72.1 operation names](https://github.com/supabase/storage/blob/v1.72.1/src/http/routes/operations.ts).
- [PNG/APNG animation chunk specification](https://www.w3.org/TR/png-3/#11acTL).
- [Vercel function limits](https://vercel.com/docs/functions/limitations): direct
  Storage upload keeps photo bytes out of the function's 4.5 MB request limit.
