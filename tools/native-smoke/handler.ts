// Bearer-protected synthetic native-audio probe. This file is versioned and
// reviewed here, but it is not a route and nothing under src/ imports it except
// its test. `generate.mjs` assembles it into a disposable project outside this
// repository; the product never gains a diagnostic endpoint. There is no body,
// query string, path segment, upload or caller-supplied argument: the only
// input is one fixed fixture named by a module constant and pinned by hash.
import { execFile } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { sanitizeAudio } from "@/lib/media/audio";

// Deliberately relative to the working directory and never to a caller value.
// The generator writes the fixture at this same path inside the artifact, so
// the repository keeps exactly one copy of the 62,580-byte sample.
export const FIXTURE_PATH = "src/test/fixtures/audio/tone-5.webm";
export const FIXTURE_SHA256 =
  "5bc420d62cb176d5cdf8cf77e7a62d3a96609ec57c86d7e84b99f05fae990648";
// A bearer shorter than this is treated as an unset probe, not as a weak
// secret to compare against. 32 characters is the floor, not a recommendation.
export const MIN_TOKEN_LENGTH = 32;
const VERSION_TIMEOUT_MS = 20_000;
const runVersion = promisify(execFile);

export type SmokeResult = {
  status: number;
  body: Record<string, string | number>;
};

const DENIED: SmokeResult = { status: 401, body: { error: "unauthorized" } };

// The same launcher, fixed argv and cleared environment the reviewed decoder
// uses. Output is one truncated line; build configuration is not returned.
async function decoderVersion() {
  const directory = path.join(
    process.cwd(),
    "vendor/audio",
    `${process.platform}-${process.arch}`,
  );
  const linux = process.platform === "linux";
  const { stdout } = await runVersion(
    path.join(directory, linux ? "limit" : "ffprobe"),
    [...(linux ? ["ffprobe"] : []), "-hide_banner", "-version"],
    {
      timeout: VERSION_TIMEOUT_MS,
      maxBuffer: 64 * 1024,
      encoding: "utf8" as const,
      env: { NODE_ENV: "production", PATH: "/usr/bin:/bin", LANG: "C" },
    },
  );
  return stdout.split("\n", 1)[0].slice(0, 120);
}

export async function handleSmokeRequest(headers: {
  get(name: string): string | null;
}): Promise<SmokeResult> {
  const expected = process.env.NATIVE_SMOKE_TOKEN?.trim() ?? "";
  // No token configured, or one below the entropy floor: the probe is simply
  // absent. Nothing is read, decoded or spawned, and no comparison is made.
  if (expected.length < MIN_TOKEN_LENGTH)
    return { status: 503, body: { error: "smoke_unavailable" } };
  const presented = /^Bearer ([A-Za-z0-9._~+/=-]{1,512})$/.exec(
    headers.get("authorization") ?? "",
  )?.[1];
  if (!presented) return DENIED;
  const offered = Buffer.from(presented, "utf8");
  const secret = Buffer.from(expected, "utf8");
  // timingSafeEqual requires equal lengths; length alone is not a secret here.
  if (offered.length !== secret.length || !timingSafeEqual(offered, secret))
    return DENIED;

  const started = process.hrtime.bigint();
  const fixture = await readFile(path.join(process.cwd(), FIXTURE_PATH));
  const fixtureSha256 = createHash("sha256").update(fixture).digest("hex");
  if (fixtureSha256 !== FIXTURE_SHA256)
    return { status: 500, body: { error: "fixture_mismatch" } };
  try {
    const audio = await sanitizeAudio(fixture, "audio/webm");
    return {
      status: 200,
      body: {
        fixtureSha256,
        outputSha256: audio.sha256,
        samples: audio.samples,
        sampleRate: audio.sampleRate,
        channels: audio.channels,
        durationMs: audio.durationMs,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        decoder: await decoderVersion(),
        elapsedMs: Math.round(Number(process.hrtime.bigint() - started) / 1e6),
      },
    };
  } catch {
    // Decoder diagnostics may quote the temporary path; return none of them.
    return { status: 502, body: { error: "decode_failed" } };
  }
}
