# Private Bluebell audio validation

Status: conservative implementation choices under [0004](0004-finalized-launch-rules.md),
for [issue #50](https://github.com/C0derTang/shared-garden/issues/50). Extends
[0025](0025-private-media-and-photo-processing.md); browser controls remain issue #29.

Reuse the private media registry, member-owned intent, insert-only staging,
server-only attestation, immutable output, live-member entry commit, short-lived
reads and bounded cleanup. Bluebell accepts only a ready voice attachment.
Author/day/original 30-minute edit checks remain authoritative at entry commit.
No listening operation writes an entry, growth or credit. Photos retain their
existing formats, image preservation and security boundary.

The supported recording input is WebM/Opus, 48 kHz, mono or stereo, at most 12 MiB.
Canonical intent MIME is `audio/webm`; recorder MIME may include `codecs=opus`
but UI sends the canonical MIME. MP4/AAC, MP4/Opus and other containers/codecs
are explicitly unsupported. Feature detection must be followed by recorder
error handling; an affirmative `isTypeSupported` is insufficient. Safari 18.4+
introduced WebM/Opus recording ([WebKit](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)).
Synthetic actual Chromium 152 and desktop Safari 27 fixtures support this choice;
no physical iOS/microphone or older Safari compatibility claim is made.

FFmpeg 9.0.1 is built from pinned official source with the retained license,
source archive, verification material and build recipe in [vendor/audio](../../vendor/audio/README.md).
The Linux amd64 programs have network/devices disabled. The Node route chooses
fixed argument arrays, an exclusive temporary directory, no caller paths, one
thread, a 32 MiB single-allocation ceiling, 20 seconds per process, 24 MiB probe-output
and 8 KiB diagnostic bounds. Input has one Opus audio stream and no extra streams.
At most 120001 packets permits Safari's 2.5 ms packets (container metadata rounds
them to 2 ms). The entire process must succeed without decoder diagnostics. A source-built Linux
launcher enforces 768 MiB address space, 20 CPU seconds and 64 file descriptors
per native process; the parent wall timer independently kills stalled processes.

Duration comes from full PCM decode, not timers or container declarations.
Decode both untrimmed (`skip_manual`) and presentation to EOF, count samples,
and require their difference to equal validated first/last boundary padding.
The supported proven profiles have zero initial skip (browser fixtures) or at
most 120 samples (native encoder fixture). Terminal padding is at most 959 samples
and must explain the last nominal 20 ms packet within the container's 1 ms rounding;
interior trims, larger skips and unexplained differences are rejected. These
bounds are format-profile checks, not extra time allowed for a recording.
The presentation must have 1 through 14,400,000 samples inclusive. Contradictory
explicit duration metadata is rejected (up to one 120 ms Opus packet of ordinary
container rounding). This is independent of the strict decoded 300-second limit.

Trusted output is PCM 16 mono 48 kHz WAV, stripping source metadata and using exactly
the verified presentation samples. Both decode counts apply the same stereo to
mono conversion, which changes channel count but never sample duration. Mono is
a conservative voice-memo choice within 0004; it avoids a 57.6 MB stereo output
that would exceed the approved free tier's [50 MB global upload limit](https://supabase.com/docs/guides/storage/uploads/file-limits).
Maximum final audio is 28,800,044 bytes, within the existing 32 MiB private bucket.
There is no silent duration truncation, paid codec service or hosted deployment.

The finalize route allows 90 seconds (three bounded native processes plus network
operations); the existing two-minute processing lease and one-hour cleanup grace
remain sufficient. Failure does not replace a valid attachment. Output is insert
only, with exact hash comparison on ambiguous retry, then trusted attestation
before a separate user-session entry operation. WAV avoids reinterpreting an
untrusted container's edits during playback.

Hosted execution, physical-phone microphone recording/playback and release
configuration remain gates in issues #29/#37. Actual Chromium muted playback of six canonical outputs (including exact 300
seconds and Safari/Chromium captures) passed duration, play, seek and ended
checks. Desktop Safari capture was verified; Safari playback could not be
checked while the native machine was locked. Neither result proves physical iOS.
