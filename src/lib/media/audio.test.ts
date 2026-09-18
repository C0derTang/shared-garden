// @vitest-environment node
import { readFile, writeFile } from "node:fs/promises";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { sanitizeAudio } from "./audio";
const fixture = (name: string) =>
  readFile(new URL(`../../test/fixtures/audio/${name}`, import.meta.url));
it.each([
  "safari-300.webm",
  "safari-5.webm",
  "tone-5.webm",
  "tone-300.webm",
  "browser-5-0.webm",
  "browser-300-0.webm",
])(
  "fully decodes and normalizes %s",
  async (name) => {
    const result = await sanitizeAudio(await fixture(name), "audio/webm");
    if (process.env.LOCAL_AUDIO_OUTPUT_DIR)
      await writeFile(
        `${process.env.LOCAL_AUDIO_OUTPUT_DIR}/${name}.wav`,
        result.bytes,
      );
    expect(result.samples).toBeGreaterThan(0);
    expect(result.samples).toBeLessThanOrEqual(14400000);
    expect(result.bytes.toString("ascii", 0, 4)).toBe("RIFF");
    expect(result.bytes.length).toBe(result.samples * result.channels * 2 + 44);
    if (name === "tone-300.webm") expect(result.samples).toBe(14400000);
  },
  60000,
);
it.each([
  "two-streams.webm",
  "tone-301.webm",
  "forged-duration.webm",
  "forged-padding.webm",
  "empty.webm",
  "truncated.mp4",
  "forged-edit.mp4",
  "forged-duration.mp4",
  "garbage.mp4",
])(
  "rejects invalid, misleading or unsupported %s",
  async (name) => {
    await expect(
      sanitizeAudio(await fixture(name), "audio/webm"),
    ).rejects.toBeDefined();
  },
  60000,
);
it("rejects unsupported MIME and byte overflow before decoder execution", async () => {
  await expect(
    sanitizeAudio(Buffer.from("x"), "audio/mp4"),
  ).rejects.toMatchObject({ code: "unsupported_audio" });
  await expect(
    sanitizeAudio(Buffer.alloc(12582913), "audio/webm"),
  ).rejects.toMatchObject({ code: "audio_too_large" });
});
it("rejects truncated and corrupt WebM even if partial samples are valid", async () => {
  const source = await fixture("tone-5.webm");
  await expect(
    sanitizeAudio(source.subarray(0, source.length - 2000), "audio/webm"),
  ).rejects.toBeDefined();
  const corrupt = Buffer.from(source);
  corrupt.fill(255, 1000, 3000);
  await expect(sanitizeAudio(corrupt, "audio/webm")).rejects.toBeDefined();
});
it("rejects Matroska labeled as WebM despite their shared demuxer", async () => {
  await expect(
    sanitizeAudio(await fixture("unsupported.mka"), "audio/webm"),
  ).rejects.toMatchObject({ code: "unsupported_audio" });
});
