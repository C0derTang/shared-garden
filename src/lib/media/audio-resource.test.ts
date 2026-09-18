// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const behavior = vi.hoisted(() => ({ script: "" }));
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: (_file: string, _args: string[], options: object) =>
      actual.spawn(process.execPath, ["-e", behavior.script], options),
  };
});
import { sanitizeAudio } from "./audio";
it("kills a decoder process that exceeds the real wall-time bound", async () => {
  behavior.script = "setInterval(() => {}, 1000)";
  const start = Date.now();
  await expect(
    sanitizeAudio(
      readFileSync(
        new URL("../../test/fixtures/audio/tone-5.webm", import.meta.url),
      ),
      "audio/webm",
    ),
  ).rejects.toMatchObject({ code: "invalid_audio" });
  expect(Date.now() - start).toBeGreaterThanOrEqual(19000);
  expect(Date.now() - start).toBeLessThan(24000);
}, 26000);
it("kills a process flooding bounded probe output", async () => {
  behavior.script =
    'const b=Buffer.alloc(1048576);function w(){while(process.stdout.write(b)){}process.stdout.once("drain",w)}w();';
  await expect(
    sanitizeAudio(
      readFileSync(
        new URL("../../test/fixtures/audio/tone-5.webm", import.meta.url),
      ),
      "audio/webm",
    ),
  ).rejects.toMatchObject({ code: "invalid_audio" });
});
it("kills a process flooding diagnostic output and exposes no diagnostics", async () => {
  behavior.script =
    'const b=Buffer.alloc(16384);function w(){while(process.stderr.write(b)){}process.stderr.once("drain",w)}w();';
  await expect(
    sanitizeAudio(
      readFileSync(
        new URL("../../test/fixtures/audio/tone-5.webm", import.meta.url),
      ),
      "audio/webm",
    ),
  ).rejects.toMatchObject({ code: "invalid_audio", message: "invalid_audio" });
});
