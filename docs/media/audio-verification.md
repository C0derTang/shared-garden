# Audio backend verification

Synthetic fixtures only. The implementation decision and supported profiles are
[0027](../decisions/0027-private-bluebell-audio.md); UI and hosted release work are
separate. Evidence recorded during issue #50 on 2026-09-18.

- Full web lint/typecheck/test/build; 195 web assertions and 27 content tests passed. Optional real Auth/Storage suites are run
  explicitly, not counted as ordinary unit-test coverage.
- Real Linux amd64 native suite: 40 tests passed across audio, resource bounds
  and image regressions. Both Chromium and Safari 5/300-second synthetic
  recordings, exact 300-second native recording, over-limit, forged headers,
  forged pre-skip, MP4 edits, two streams, Matroska mislabeled as WebM, corrupt/truncated WebM, empty and
  oversized inputs are covered. Timer and flood tests use real controlled child
  processes; production native tests execute the actual Linux resource launcher.
- Actual Auth/Storage/HTTP audio integration passed with an exact 300-second
  recording, 28,800,044-byte private WAV, concurrent finalize/retry, original
  timing, replacement preservation, immediate partner read, denied outsider and
  untrusted operations, cleanup, expiry/revocation and signed-upload denial.
  The unchanged photo behavior also passed the same HTTP security suite.
- Clean database suite: 9 files / 1020 assertions. Existing media, planting,
  entry, rollover and Peony lock races passed; the media race harness also ran
  with `--audio`. Auth-role insertion/confirmation, returning identity, spoofed
  claims, revocation and rollback verification passed.
- The fully pinned Linux build reproduced both FFmpeg executable hashes exactly.
  Source, signing material, LGPL text and compilation recipes are retained.
  The small Linux launcher adds a 768 MiB address-space, 20 CPU-second and
  64-descriptor ceiling; parent wall/output bounds are independent. An initial
  384 MiB cap caused Rosetta translation pressure and rejected valid fixtures;
  the final 768 MiB configuration passed the complete native suite.
- Actual Linux Next production build and `scripts/verify-audio-runtime.mjs`
  passed. All three executable files are traced with execute bits. The entire
  app server tree plus Next runtime trace is an upper bound of 54,445,864 bytes
  across 1150 files, below the 250 MiB function limit. This measures more than
  the individual finalize route; it is not a deployed Vercel artifact.
- The orchestrator used CUA to verify six canonical WAV outputs in Chromium 152:
  correct finite duration, muted playback advancement, seek near the end and
  natural ended state. Safari 27 actual synthetic capture was verified. Native
  Safari playback was unavailable while the computer was locked. No lock was
  bypassed and no microphone or speaker was used.

Rerun commands and dedicated disposable project settings are in
[backend.md](backend.md). CI runs actual Linux audio integration and packaged
runtime checks. Local status/build/server logs contain disposable credentials
and are deliberately not public artifacts. No hosted deployment, physical-phone
microphone, actual Google OAuth exchange or physical Safari playback is claimed.
