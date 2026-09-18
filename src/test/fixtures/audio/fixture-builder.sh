#!/bin/bash
set -euo pipefail
cd /probe/build-minimal
# Leave the installed minimal CLI unchanged. This second test-only build adds
# native Opus encoding and WebM muxing solely to make synthetic fixtures.
../src/ffmpeg-9.0.1/configure \
 --prefix=/probe/out --disable-autodetect --disable-everything \
 --disable-network --disable-avdevice --disable-swscale --disable-doc \
 --disable-debug --disable-ffplay --disable-shared --enable-static \
 --enable-ffmpeg --enable-ffprobe --enable-small \
 --disable-gpl --disable-nonfree --disable-version3 \
 --enable-decoder=aac,opus,pcm_s16le,pcm_s24le,pcm_s32le,pcm_f32le \
 --enable-demuxer=mov,matroska,wav \
 --enable-parser=aac,opus \
 --enable-encoder=pcm_s16le,aac,opus \
 --enable-muxer=pcm_s16le,mp4,webm \
 --enable-protocol=file,pipe \
 --enable-filter=aresample,aformat,anull \
 --extra-cflags='-O2 -march=x86-64 -mtune=generic' \
 > /probe/logs/configure-generator.txt 2>&1
make -j4 ffmpeg > /probe/logs/build-generator.txt 2>&1
cp ffmpeg /probe/generator-ffmpeg
python3 /probe/generate-pcm.py
for s in 5 300 301; do
 /probe/generator-ffmpeg -v error -y -i /probe/fixtures/tone-$s.wav -c:a aac -b:a 96k -movflags +faststart /probe/fixtures/tone-$s.mp4
 /probe/generator-ffmpeg -v error -y -i /probe/fixtures/tone-$s.wav -c:a opus -strict experimental -b:a 96k /probe/fixtures/tone-$s.webm
done
