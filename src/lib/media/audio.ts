import "server-only";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MediaError } from "./error";

export const AUDIO_INPUT_LIMIT = 12 * 1024 * 1024;
const MAX_SAMPLES = 300 * 48000;
// Independent fixed-argv processes, no shell/network/device protocols. Bound
// each allocation, threads, wall time, stdout and stderr even for corrupt files.
async function run(
  tool: string,
  args: string[],
  limit: number,
  collect = true,
) {
  return new Promise<{ bytes: Buffer; length: number }>((resolve, reject) => {
    const executable = path.join(
      process.cwd(),
      "vendor/audio",
      `${process.platform}-${process.arch}`,
      tool,
    );
    const child = spawn(
      process.platform === "linux"
        ? path.join(path.dirname(executable), "limit")
        : executable,
      [
        ...(process.platform === "linux" ? [tool] : []),
        "-hide_banner",
        "-v",
        "warning",
        "-max_alloc",
        "33554432",
        ...args,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: { NODE_ENV: "production", PATH: "/usr/bin:/bin", LANG: "C" },
      },
    );
    let length = 0,
      stderr = 0,
      failed = false;
    const parts: Buffer[] = [];
    const kill = () => {
      failed = true;
      child.kill("SIGKILL");
    };
    const timer = setTimeout(kill, 20_000);
    child.stdout.on("data", (chunk: Buffer) => {
      length += chunk.length;
      if (length > limit) kill();
      else if (collect) parts.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.length;
      if (stderr > 8192) kill();
    });
    child.on("error", () => {
      clearTimeout(timer);
      reject(new MediaError("audio_unavailable", 503));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (failed || code !== 0 || stderr !== 0)
        reject(new MediaError("invalid_audio"));
      else resolve({ bytes: Buffer.concat(parts), length });
    });
  });
}
type Packet = {
  duration_time?: string;
  side_data_list?: {
    side_data_type: string;
    skip_samples?: number;
    discard_padding?: number;
  }[];
};
// FFmpeg shares one demuxer name for Matroska and WebM. Inspect the bounded
// EBML header's actual DocType, rather than searching arbitrary metadata bytes.
function requireWebm(input: Buffer) {
  if (input.length < 5 || input.readUInt32BE(0) !== 0x1a45dfa3)
    throw new MediaError("invalid_audio");
  function vint(offset: number, strip: boolean) {
    if (offset >= input.length || input[offset] === 0)
      throw new MediaError("invalid_audio");
    let width = 1;
    while (!(input[offset] & (0x80 >> (width - 1)))) width++;
    if (width > 8 || offset + width > input.length)
      throw new MediaError("invalid_audio");
    let value = strip ? input[offset] & (0xff >> width) : input[offset];
    for (let i = 1; i < width; i++) value = value * 256 + input[offset + i];
    if (!Number.isSafeInteger(value)) throw new MediaError("invalid_audio");
    return { value, next: offset + width };
  }
  const header = vint(4, true);
  const end = header.next + header.value;
  if (header.value > 4096 || end > input.length)
    throw new MediaError("invalid_audio");
  let offset = header.next,
    found = false;
  while (offset < end) {
    const id = vint(offset, false),
      size = vint(id.next, true);
    if (size.next + size.value > end) throw new MediaError("invalid_audio");
    if (id.value === 0x4282) {
      if (
        found ||
        size.value !== 4 ||
        input.toString("ascii", size.next, size.next + size.value) !== "webm"
      )
        throw new MediaError("unsupported_audio");
      found = true;
    }
    offset = size.next + size.value;
  }
  if (!found) throw new MediaError("unsupported_audio");
}
export async function sanitizeAudio(input: Buffer, claimedType: string) {
  if (claimedType !== "audio/webm") throw new MediaError("unsupported_audio");
  if (!input.length || input.length > AUDIO_INPUT_LIMIT)
    throw new MediaError("audio_too_large");
  requireWebm(input);
  const dir = await mkdtemp(path.join(tmpdir(), "garden-audio-"));
  const file = path.join(dir, "input.webm");
  try {
    await writeFile(file, input, { mode: 0o600 });
    const info = await run(
      "ffprobe",
      [
        "-protocol_whitelist",
        "file,pipe",
        "-show_streams",
        "-show_format",
        "-show_packets",
        "-show_entries",
        "stream=codec_name,codec_type,sample_rate,channels:format=format_name,duration:packet=duration_time,side_data_list",
        "-of",
        "json",
        file,
      ],
      24 * 1024 * 1024,
    );
    const probe = JSON.parse(info.bytes.toString()) as {
      streams: {
        codec_name: string;
        codec_type: string;
        sample_rate: string;
        channels: number;
      }[];
      format: { format_name: string; duration?: string };
      packets: Packet[];
    };
    const stream = probe.streams?.[0];
    if (
      probe.streams?.length !== 1 ||
      stream.codec_name !== "opus" ||
      stream.codec_type !== "audio" ||
      stream.sample_rate !== "48000" ||
      ![1, 2].includes(stream.channels) ||
      probe.format?.format_name !== "matroska,webm"
    )
      throw new MediaError("unsupported_audio");
    const packets = probe.packets;
    if (!packets?.length || packets.length > 120_001)
      throw new MediaError("invalid_audio");
    let skip = 0,
      discard = 0;
    for (const [i, packet] of packets.entries()) {
      const duration = Number(packet.duration_time) * 48000;
      if (!Number.isFinite(duration) || duration < 96 || duration > 5760)
        throw new MediaError("invalid_audio");
      for (const side of packet.side_data_list ?? []) {
        if (side.side_data_type !== "Skip Samples")
          throw new MediaError("invalid_audio");
        const s = side.skip_samples ?? 0,
          d = side.discard_padding ?? 0;
        // Proven profiles: Chromium 0 and native Opus 120 initial samples.
        // Do not silently expand this bound for unverified recorder profiles.
        if (
          !Number.isInteger(s) ||
          !Number.isInteger(d) ||
          s < 0 ||
          d < 0 ||
          (s && (i !== 0 || s > 120)) ||
          (d &&
            (i !== packets.length - 1 ||
              d > 959 ||
              Math.abs(duration + d - 960) > 48))
        )
          throw new MediaError("invalid_audio");
        skip += s;
        discard += d;
      }
    }
    if (skip > 120 || discard > 959) throw new MediaError("invalid_audio");
    const base = [
      "-nostdin",
      "-xerror",
      "-threads",
      "1",
      "-protocol_whitelist",
      "file,pipe",
      "-err_detect",
      "explode",
    ];
    const output = [
      "-map",
      "0:a:0",
      "-threads",
      "1",
      "-ac",
      "1",
      "-acodec",
      "pcm_s16le",
      "-f",
      "s16le",
      "pipe:1",
    ];
    const frameBytes = 2;
    const full = await run(
      "ffmpeg",
      [...base, "-flags2", "+skip_manual", "-i", file, ...output],
      (MAX_SAMPLES + 1079) * frameBytes,
      false,
    );
    const pcm = await run(
      "ffmpeg",
      [...base, "-i", file, ...output],
      MAX_SAMPLES * frameBytes,
    );
    const samples = pcm.length / frameBytes;
    if (
      !Number.isInteger(samples) ||
      samples <= 0 ||
      samples > MAX_SAMPLES ||
      full.length !== pcm.length + (skip + discard) * frameBytes
    )
      throw new MediaError("invalid_audio");
    // Container duration is never the authority, but contradictory explicit
    // metadata is rejected. One packet permits normal container rounding.
    const declared = Number(probe.format.duration);
    if (
      probe.format.duration !== undefined &&
      (!Number.isFinite(declared) ||
        Math.abs(declared - full.length / frameBytes / 48000) > 0.12)
    )
      throw new MediaError("invalid_audio");
    // Canonical PCM WAV uses mono at48kHz, strips source metadata,
    // and plays exactly the validated samples without codec edit interpretation.
    const header = Buffer.alloc(44);
    header.write("RIFF");
    header.writeUInt32LE(pcm.length + 36, 4);
    header.write("WAVEfmt ", 8);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(48000, 24);
    header.writeUInt32LE(48000 * frameBytes, 28);
    header.writeUInt16LE(frameBytes, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(pcm.length, 40);
    const bytes = Buffer.concat([header, pcm.bytes]);
    return {
      bytes,
      mimeType: "audio/wav",
      samples,
      sampleRate: 48000,
      channels: 1,
      durationMs: samples / 48,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError("invalid_audio");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
