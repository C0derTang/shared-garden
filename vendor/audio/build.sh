#!/bin/bash
set -euo pipefail
cd /probe
mkdir -p logs gnupg src build-minimal out
chmod 700 gnupg
rpm -qa | sort > logs/rpm-versions.txt
gcc --version > logs/gcc-version.txt
ldd --version > logs/glibc-version.txt
sha256sum ffmpeg-9.0.1.tar.xz > logs/source-sha256.txt
test "$(sha256sum ffmpeg-9.0.1.tar.xz | cut -d' ' -f1)" = cf38e0e28c7e5605942c4a77755349b0145804a397af37eb1fb4c77cb237f635
gpg --batch --homedir /probe/gnupg --import ffmpeg-devel.asc > logs/key-import.txt 2>&1
gpg --batch --homedir /probe/gnupg --with-colons --fingerprint > logs/key-fingerprint.txt
gpg --batch --homedir /probe/gnupg --verify ffmpeg-9.0.1.tar.xz.asc ffmpeg-9.0.1.tar.xz > logs/signature.txt 2>&1
tar -xJf ffmpeg-9.0.1.tar.xz -C src
cd build-minimal
../src/ffmpeg-9.0.1/configure \
 --prefix=/probe/out --disable-autodetect --disable-everything \
 --disable-network --disable-avdevice --disable-swscale --disable-doc \
 --disable-debug --disable-ffplay --disable-shared --enable-static \
 --enable-ffmpeg --enable-ffprobe --enable-small \
 --disable-gpl --disable-nonfree --disable-version3 \
 --enable-decoder=aac,opus,pcm_s16le,pcm_s24le,pcm_s32le,pcm_f32le \
 --enable-demuxer=mov,matroska,wav \
 --enable-parser=aac,opus \
 --enable-encoder=pcm_s16le,aac \
 --enable-muxer=pcm_s16le,mp4 \
 --enable-protocol=file,pipe \
 --enable-filter=aresample,aformat,anull \
 --extra-cflags='-O2 -march=x86-64 -mtune=generic' \
 > ../logs/configure.txt 2>&1
/usr/bin/time -v make -j4 > ../logs/build.txt 2> ../logs/build-time.txt
make install > ../logs/install.txt 2>&1
/probe/out/bin/ffmpeg -version > ../logs/ffmpeg-version.txt
/probe/out/bin/ffmpeg -L > ../logs/license.txt 2>&1
ldd /probe/out/bin/ffmpeg > ../logs/ldd-ffmpeg.txt
ldd /probe/out/bin/ffprobe > ../logs/ldd-ffprobe.txt
readelf --version-info /probe/out/bin/ffmpeg > ../logs/symbol-versions.txt
stat -c '%n %s' /probe/out/bin/* > ../logs/binary-sizes.txt
sha256sum /probe/out/bin/* > ../logs/binary-sha256.txt
# Linux-only process address-space/CPU/file-descriptor ceiling; source in repo.
gcc -O2 -Wall -Wextra -Werror /probe/limit.c -o /probe/out/bin/limit
