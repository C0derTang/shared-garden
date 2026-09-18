# Private media API and local verification

Implements [decision 0025](../decisions/0025-private-media-and-photo-processing.md)
and [issue #48](https://github.com/C0derTang/shared-garden/issues/48). Read the
[entry](../database/entries.md) and [settlement](../database/rollover.md) contracts
before integrating photo UI. All example values are placeholders.

## Browser protocol

All HTTP operations are same-origin `POST` with `Content-Type: application/json`,
`Origin: <APP_ORIGIN>` and the existing session cookies. Control bodies are at
most 4096 bytes. Unexpected fields, client actor/day/clock/object path or trusted
metadata are rejected. Responses use `Cache-Control: private, no-store` and
`Referrer-Policy: no-referrer`. The session-refresh proxy returns generic 401 `signin_required`, 403
`media_not_available`, or 503 `media_unavailable` JSON for denied requests.
If membership changes between proxy and the route guard, the existing generic
auth redirect is also possible; detect non-JSON/redirect responses and
reestablish the normal session. No test login or fixture clock is shipped.

1. Request `/api/media/intents` with:

   ```json
   {
     "requestId": "<NEW_UUID_REUSED_FOR_NETWORK_RETRIES>",
     "flowerId": "<SUNFLOWER_UUID>",
     "mimeType": "image/jpeg",
     "byteLength": 123456,
     "replacementEntryId": 123
   }
   ```

   Omit `replacementEntryId` (or use null) for a new original. The response is:

   ```json
   {
     "id": "<MEDIA_UUID>",
     "flower_id": "<SUNFLOWER_UUID>",
     "replacement_entry_id": 123,
     "status": "pending",
     "expires_at": "<SERVER_TIMESTAMP>",
     "mime_type": "image/jpeg",
     "input_bytes": 123456,
     "staging_path": "<MEDIA_UUID>/source",
     "final_path": "<MEDIA_UUID>/photo.jpg",
     "entry_id": null,
     "width": null,
     "height": null
   }
   ```

   Paths identify objects but grant no read access. An identical request key
   returns this same intent, including its current status and original expiry.
   Eligibility can change during upload; final entry checks decide acceptance.

2. Use the existing browser Supabase publishable client and user session:
   `client.storage.from("garden-staging").upload(intent.staging_path, file,
   { contentType: intent.mime_type, upsert: false })`. Input bytes go directly to
   Storage, not through Next.js. The bucket enforces 12 MiB and the supported
   MIME list, then the server validates the actual bytes. A failed/ambiguous
   upload may already exist; never use upsert. Call finalize to discover whether
   the complete object arrived. A different file always requires a new intent. Do not call
   `createSignedUploadUrl` / `uploadToSignedUrl`, resumable or S3 upload methods:
   staging permits only the exact live `object.upload` operation. Signed-upload
   creation (including `upsert: true`) is denied even for a pending owner's path.
   Expiry, revocation and cleanup remain enforceable because clients cannot mint
   a longer-lived upload token.

3. Request `/api/media/finalize` with `{ "mediaId": "<MEDIA_UUID>" }`.
   Successful validation and entry acceptance return
   `{ "mediaId": "<MEDIA_UUID>", "entryId": 123, "status": "submitted" }`.
   Repeated finalization is idempotent for that intent. The entry payload is
   exactly `{ "media_id": "<MEDIA_UUID>" }`; all dimensions and metadata remain
   trusted registry facts. Refetch authoritative garden/entry state after
   success **and failure**, because failed entry operations roll back settlement.
   A confirmed receipt does not mean a superseded photo is the latest entry.

4. For each current or historical entry payload, request `/api/media/read` with
   `{ "mediaId": "<MEDIA_UUID>" }`. The response contains `mediaId`, a temporary
   `url`, `expiresIn: 60`, upright `width`, `height`, and `mimeType`. Fetch it
   promptly, use uncropped square `object-fit: contain`, and request a fresh URL
   on expiry or resource failure. Avoid shared/public image optimization caches
   and persistent caching/logging of signed URLs. Partner photos need no prior
   contribution from the viewer. Superseded photos have no new readable reference.

5. Request `/api/media/cleanup` with `{}` on opening the photo sheet or after a
   successful save. A pass handles at most twenty intent rows and returns
   `{ "cleaned": 3 }`; this is maintenance success, not evidence that all orphans
   have been removed. Retry later if unavailable. It never removes a submitted
   final object or deletes an entry/history record. No cron is required.

Supported MIME types are `image/jpeg`, `image/png`, `image/webp`. Reject other
formats accessibly before upload, while treating the server as final authority.
No destructive downsizing fallback is permitted. Explain limits and allow the
user to choose/export another photo when necessary.

## Errors and ambiguity

HTTP errors contain `{ "error": "<CODE>" }`, with no upstream error, identity,
path, token or decoded bytes. Input bodies/fields are 400 `invalid_request`
(413 for a body over 4096 bytes); wrong/missing origin is 403 `invalid_origin`.
Absent or denied membership uses the proxy errors above (or a guard redirect
if membership changes mid-request). The important
media codes are:

| Status/code | UI behavior |
| --- | --- |
| 422 `unsupported_photo`, `invalid_photo`, `type_mismatch`, `photo_too_large`, `photo_size_mismatch` | No contribution saved; choose a supported valid photo and create a new intent |
| 409 `media_processing`, with `retryAfter: 120` | Another worker may be processing; refetch state and retry after the indicated interval |
| 409 `upload_missing` | Upload has not completed or was interrupted; after an ambiguous upload wait/retry; an immutable existing file cannot be replaced |
| 409 `media_expired`, `media_expired_or_changed` | Old intent/lease cannot be used; refetch entry eligibility before starting over |
| 409 `media_upload_limit` | At most three unfinished intents and twenty new intents per rolling hour; expired intents stop using active slots |
| 409 `media_idempotency_conflict` | A request key was reused for different parameters; generate a new key only for a new upload |
| 409 `media_invalid_request`, `media_wrong_flower`, `media_invalid_reference` | Invalid intent/reference; refetch and correct caller input |
| 409 `entry_rejected` | Existing entry/window/bloom rules rejected the contribution; prior valid entry remains; refetch authoritative state |
| 403 `media_not_available` | Wrong owner, invalid reference or no longer authorized; do not expose details |
| 503 `media_unavailable` | Service/configuration/network failure; status may be ambiguous; inspect intent and current entry before retry |

An invalid immutable stage remains an unfinished intent until its 15-minute
expiry; do not keep finalizing invalid bytes. A processing lease permits recovery
after two minutes. Ready-but-unaccepted media is not readable and is eventually
an orphan. Do not label a local preview or an uploaded file as saved care.

## Database capabilities

Authenticated members can call these RPCs; each derives identity from the live
membership boundary, never editable user metadata or a JWT role alone:

| RPC | Parameters/result |
| --- | --- |
| `create_media_upload` | `p_request_id uuid`, `p_flower_id uuid`, `p_mime_type text`, `p_input_bytes integer`, `p_replacement_entry_id bigint default null`; intent JSON above |
| `media_upload_state` | `p_id uuid`; same JSON for owner only, useful after ambiguous responses |
| `claim_media_upload` | `p_id uuid`; guarded claim JSON with a server-processing `lease_id`, or ready/submitted state; browser possession of a lease grants no attestation capability |
| `media_upload_allowed` | `p_path text`; boolean used by staging INSERT policy, no path discovery |
| `media_read_path` | `p_id uuid`; member-only path/dimensions for a currently referenced submitted attachment; the path confers no Storage access |

Server `service_role` alone can execute `attest_media_upload(p_id, p_lease_id,
p_output_bytes, p_width, p_height, p_sha256)`, `media_cleanup_candidates()` and
`media_cleanup_done(p_id,p_staging,p_final)`. Private registry/helpers have no
browser or service-role direct table/schema grants. Storage's trusted capability
is used only after route authorization, with server-chosen paths. Contributions
still use the requesting member's normal user session. Audio must extend these
same state/reference/read/cleanup contracts with its own server decoder; this
migration deliberately refuses audio MIME types and Bluebell intents.

The existing server-only `SUPABASE_SECRET_KEY` must be configured privately for
processing, signing and cleanup. Publishable keys and user sessions cannot call
the attestation seam. Hosted configuration is separate release work; this issue
ships no project identifiers, keys or private images.

## Local verification

Use Node 24, Docker and `npm ci`. Create a disposable project outside the repo,
copying only `supabase/config.toml`, migrations and tests. In the copy set project
ID `shared-garden-media48`, API port `57321`, database `57322`, shadow `57320`.
Keep Auth and Storage enabled and never link to a hosted project. The opt-in test
refuses any other API address/container or a database with existing members,
Auth users, garden or Storage objects. It builds production output with disposable local settings and starts its own
local Next server at
`127.0.0.1:57329` and refuses a failed startup. Keep that port free, and do not run another build/dev server in the same checkout
during this opt-in test. Build output and logs stay local and ignored.

The Node-only harness uploads synthetic bytes as `File` objects, matching the
browser SDK's multipart upload path. Raw Buffer uploads can leave a local
proxy/Storage connection stalled after an early denial; local Linux tracing
observed a following request return 504 after 60 seconds. The same bytes using
multipart completed without that delay. The default transport and 120-second
test budget remain unchanged. Denied Storage operations must return the expected
HTTP 400 error, and private object listings must successfully return an empty
array; network errors and upstream timeouts cannot satisfy either assertion.

```sh
umask 077
node_modules/.bin/supabase start --workdir /tmp/shared-garden-issue48 \
  > /tmp/shared-garden-issue48/start.log 2>&1
node_modules/.bin/supabase status --workdir /tmp/shared-garden-issue48 -o json \
  > /tmp/shared-garden-issue48/status.json
node_modules/.bin/supabase db reset --local --workdir /tmp/shared-garden-issue48
node_modules/.bin/supabase test db --workdir /tmp/shared-garden-issue48
LOCAL_MEDIA_STATUS_FILE=/tmp/shared-garden-issue48/status.json \
  npx vitest run src/test/media-local.test.ts
python3 supabase/tests/concurrency/media_race.py supabase_db_shared-garden-media48
python3 supabase/tests/concurrency/planting_race.py supabase_db_shared-garden-media48
python3 supabase/tests/concurrency/entries_race.py supabase_db_shared-garden-media48
python3 supabase/tests/concurrency/rollover_race.py supabase_db_shared-garden-media48
python3 supabase/tests/concurrency/peony_race.py supabase_db_shared-garden-media48
docker exec -i supabase_db_shared-garden-media48 \
  psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  < docs/auth/verify-identity-auth-role.sql
node_modules/.bin/supabase db reset --local --workdir /tmp/shared-garden-issue48
node_modules/.bin/supabase test db --workdir /tmp/shared-garden-issue48
npm run lint
npm run typecheck
npm test
npm run build
node_modules/.bin/supabase stop --workdir /tmp/shared-garden-issue48
```

Never publish local startup/status/web logs: they can contain ephemeral keys,
cookies or temporary URLs. Normal web tests skip the opt-in integration. It uses
synthetic JPEG/PNG fixtures, real Google-bound test Auth records and locally
signed disposable JWTs, actual `getUser`/`current_member`, real HTTP routes and
Storage APIs. It proves private policies, server decoded sanitized output,
parallel finalize/retry, replacement preservation, cleanup and revocation.
Actual Storage regression checks also deny signed-upload creation with both
upsert options, deny revoked/expired direct uploads, and prevent object
resurrection after cleanup acknowledgement. The image unit tests use actual
native decoding and prove all eight EXIF
orientations, original dimensions, GPS removal, malformed/spoofed/oversized and
animated rejection, including a real two-frame APNG whose native metadata omits
frame count. The SQL and race tests seed trusted metadata explicitly;
those alone do not prove file decoding. No test bypass is in application code.

The `Private media / media-integration` CI job runs on Linux with normal optional
native dependencies, exercises the actual integration and deterministic media
lock races, then resets/stops its disposable services. The existing database
job includes the additive pgTAP file. Baseline identity/entries/rollover tests
and races remain required. Tests do not prove hosted deployment, a real Google
OAuth exchange, camera behavior, physical phone codecs or UI rendering; those
are separate release/photo-UI checks.

## Bluebell audio extension (issue #50)

[Decision 0027](../decisions/0027-private-bluebell-audio.md) extends these same
endpoints and permissions. For a Bluebell intent use canonical `audio/webm`,
byteLength 1..12582912, and its flower ID. Upload directly to `garden-staging`.
Accept one WebM/Opus 48 kHz mono/stereo stream; MP4 and AAC are unsupported.
Modern Safari 18.4+ supports the format; detect support and handle recording
runtime failure without saving empty audio. Browser controls belong to issue #29.

The intent now includes nullable `samples`, `sample_rate` and `channels`;
photo dimensions remain unchanged. Audio final_path is `<MEDIA_UUID>/audio.wav`.
It is not readable until entry attachment. Ready audio metadata is trusted only:
1..14400000 samples, 48000 sample_rate, 1 channel. Finalized playback uses exactly
these samples in PCM 16 mono WAV (maximum 28,800,044 bytes). Read responses add
`samples`, `sampleRate`, `channels`, `durationMs` and `mimeType: audio/wav`;
width/height are null. DurationMs is samples/48 and may be fractional.

The original MIME on the intent describes upload bytes; read MIME describes
trusted playback bytes. No payload schema change: `{media_id:<UUID>}`. Never
send client duration or validation facts. A failed recording/replacement retains
the previous contribution; refetch authoritative state after either outcome.
`unsupported_audio`, `invalid_audio` and `audio_too_large` are 422 failures;
`audio_unavailable` 503 means the native runtime could not start. The shared
size-mismatch error remains `photo_size_mismatch` for compatibility. Other
existing media errors, idempotency, owner/day/edit windows and cleanup apply.

Audio-only attestation is `attest_audio_upload(p_id,p_lease_id,p_output_bytes,
p_samples,p_channels,p_sha256)`, executable only by service_role. It checks
live membership and the canonical stored object's size/MIME, then marks the
same registry ready. It cannot submit a member's entry. Existing photo
attestation cannot attest audio. No direct private-table capability is added.

For the actual audio integration, create the same disposable project with ID
`shared-garden-audio50`, API 57721, DB 57722, shadow 57720, app 57729, under
`/tmp/shared-garden-issue50`. Run `LOCAL_AUDIO_STATUS_FILE=/tmp/shared-garden-issue50/status.json
npx vitest run src/test/media-local.test.ts`; reset before/after. This uses the
same full security/replacement/cleanup suite with real synthetic browser audio.
Run the original photo variant separately against its empty disposable project,
or use `LOCAL_MEDIA_STATUS_FILE` with the same reset audio50 project for photos.
Audio native fixture/resource tests are `src/lib/media/audio*.test.ts`. Linux
production binaries ship in vendor/audio/linux-x64; macOS development requires
an ignored local source build (see vendor/audio/README.md). Do not silently skip
native tests on unsupported development platforms.

`python3 supabase/tests/concurrency/media_race.py
supabase_db_shared-garden-audio50 --audio` runs the same observed lock races for
Bluebell. `node scripts/verify-audio-runtime.mjs` must run after a Linux amd64
production build; it asserts traced executable binaries and a complete server
size upper bound. See [audio verification](audio-verification.md) for evidence.

## Sunflower phone pixel limit

[Decision 0012](../decisions/0012-sunflower-photo-interface.md) raises the photo
pixel ceiling to 25,000,000 via an additive migration, accepting nominal 24MP
5712×4284 phone photos without resizing. All other photo constraints remain.
The actual media harness accepts explicit `LOCAL_MEDIA_MODE=sunflower28` with
either photo or audio status-file mode on the dedicated 57821 API / 57829 web
ports and `shared-garden-sunflower28` container. Photo mode exercises native phone
dimensions, orientation, metadata stripping and over-25M rejection through HTTP.
