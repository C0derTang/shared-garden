# Synthetic audio fixtures

All audio is generated 440 Hz tone, never microphone/ambient/private recordings.
Native files: FFmpeg 9.0.1 at 48 kHz, 5/300/301 seconds. Chromium 152 files:
oscillator-to-MediaStreamDestination, 48 kHz, requested 64 kbps; exact capture
metadata accompanies each file. No speaker output or microphone permission.
Safari 27 WebM fixture uses the same synthetic browser procedure. Browser capture
wall clock is not authoritative sample duration. PhysicaliOS/microphone and
hosted execution are not tested by these fixtures.

`forged-duration` changes container duration fields; `forged-edit.mp4` edits
presentation to conceal 301 seconds; `forged-padding.webm` increases Opus pre-skip
to 65535 samples. MP4 is deliberately unsupported. Empty/garbage/truncated files
exercise invalid-file rejection. The test suite additionally mutates WebM to
exercise corruption/truncation with partially decodable content.

`two-streams.webm` duplicates the synthetic native Opus track with the same
fixture encoder's `-map 0:a -map 0:a -c copy`. `unsupported.mka` replaces
WebM DocType with Matroska and adjusts the EBML header sizes; it remains fully
decodable by their shared demuxer, exercising explicit container rejection.
