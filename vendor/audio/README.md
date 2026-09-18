# Private audio decoder distribution

FFmpeg 9.0.1, unmodified official source, LGPL-2.1-or-later. The independent
command-line programs are invoked as subprocesses; application code is not
linked into FFmpeg. Copyright notices and all source license files are in the
accompanying exact source archive. No GPL/nonfree/version3 configuration.

Source: https://ffmpeg.org/releases/ffmpeg-9.0.1.tar.xz
SHA256: cf38e0e28c7e5605942c4a77755349b0145804a397af37eb1fb4c77cb237f635
Signing fingerprint: FCF986EA15E6E293A5644F10B4322F04D67658D8
Official verification: https://ffmpeg.org/download.html
License checklist: https://ffmpeg.org/legal.html

The accompanying archive, detached signature and public key were verified before
building. `build.sh` checks the archive hash and signature and preserves the
full configure command. `Dockerfile` pins the Amazon Linux 2023 image digest.
Build from this directory, mounting it at `/probe`, with Linux amd64:

```sh
docker build --platform linux/amd64 -t garden-audio-build .
docker run --rm --platform linux/amd64 --network none --cpus 4 --memory 2g -v "$PWD:/probe" garden-audio-build /bin/bash /probe/build.sh
cp out/bin/ffmpeg out/bin/ffprobe out/bin/limit linux-x64/
chmod 755 linux-x64/ffmpeg linux-x64/ffprobe linux-x64/limit
```

Original toolchain GCC11.5.0-5.amzn2023.0.5, glibc2.34-231.amzn2023.0.5,
binutils2.41-50.amzn2023.0.5, nasm2.15.05-1.amzn2023.0.6, make4.3-5.amzn2023.0.2.
Only libc/libm and the Linux ELF loader are dynamic dependencies. Network,
devices, external codecs and hardware acceleration are disabled. Fixed file/pipe
protocols only. Decoder executables total 4,107,840 bytes; the MIT-licensed `limit.c` launcher adds 16,952 bytes. SHA256:

- ffmpeg: d9f76898450a5b29283010e8b4dc62bbbf313e19f9f19cc30e59df85633e4fdc
- ffprobe: c43fb6181e957d995330307a19c2d36deb0e00b2f0d37f73f6ab392d59ea1d99

Linux binaries must retain executable permissions. Next traces these three files
into the finalize function. Archive/build files are distribution source, not
function runtime dependencies. Hosted Linux execution is a release gate in #37;
local Docker execution is not a hosted deployment result.

On macOS, developers may build the identical source/configuration into
`darwin-arm64` (ignored), with the two executables directly inside that directory.
The production runtime never chooses a caller-supplied executable path.

The Linux launcher bounds each native process to 768 MiB address space, 20 CPU seconds and 64 open files before exec. A 20-second parent wall timer also kills stalled processes. Source and compilation command are retained. Launcher SHA256: 5a41d090e83d7e5e1ab6005fc020a95afa9f9eeff7e3db599a72a8a8ce0f7ce4. macOS development binaries do not use this Linux launcher; production Linux tests do.

A fresh build from the fully pinned Dockerfile reproduced both decoder SHA256 values exactly. No source patches were applied.
